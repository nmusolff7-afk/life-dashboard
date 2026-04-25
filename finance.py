"""Finance CRUD + derived-state helpers (PRD §4.5).

This module owns the data-access layer for the four finance tables
(accounts / transactions / budgets / bills). It intentionally has no
Plaid knowledge — the `source` column on each row distinguishes 'manual'
from 'plaid' once the Plaid sync path lands; both use the same shape.

Transaction sign convention: amount > 0 = expense, amount < 0 = income.
This matches Plaid's convention, so Plaid sync can INSERT the same
fields without a translation layer.

Categories (PRD §4.5.11):
  groceries | dining | transport | entertainment | shopping
  bills | health | travel | other
  income           (special category for negative-amount rows)
  transfer         (excluded from spending calcs)
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from db import get_conn


# ── Constants ────────────────────────────────────────────────────────────

# Categories eligible for spend-tracking. Transfers between user's own
# accounts and incoming money are excluded.
SPEND_CATEGORIES = (
    "groceries", "dining", "transport", "entertainment", "shopping",
    "bills", "health", "travel", "other",
)

ALL_CATEGORIES = SPEND_CATEGORIES + ("income", "transfer")

# The "total" pseudo-category in finance_budgets caps all spend categories
# together (simple mode). Otherwise a row per category (category mode).
TOTAL_BUDGET_KEY = "total"


def _now() -> str:
    return datetime.now().isoformat()


def _today() -> str:
    return date.today().isoformat()


# ── Accounts ─────────────────────────────────────────────────────────────


def list_accounts(user_id: int) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM finance_accounts WHERE user_id = ? ORDER BY created_at",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def create_manual_account(user_id: int, name: str, account_type: str = "cash",
                          current_balance: float | None = None) -> int:
    now = _now()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO finance_accounts (user_id, source, name, account_type, "
            "current_balance, created_at, updated_at) "
            "VALUES (?, 'manual', ?, ?, ?, ?, ?)",
            (user_id, name.strip(), account_type, current_balance, now, now),
        )
        conn.commit()
        return int(cur.lastrowid)


def update_account_balance(account_id: int, user_id: int,
                           current_balance: float) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE finance_accounts SET current_balance = ?, updated_at = ? "
            "WHERE id = ? AND user_id = ?",
            (current_balance, _now(), account_id, user_id),
        )
        conn.commit()
    return cur.rowcount > 0


# ── Transactions ─────────────────────────────────────────────────────────


def list_transactions(user_id: int, *, limit: int = 50,
                      since: str | None = None,
                      category: str | None = None) -> list[dict]:
    q = "SELECT * FROM finance_transactions WHERE user_id = ?"
    params: list = [user_id]
    if since:
        q += " AND txn_date >= ?"
        params.append(since)
    if category:
        q += " AND (category_override = ? OR (category_override IS NULL AND category = ?))"
        params.extend([category, category])
    q += " ORDER BY txn_date DESC, id DESC LIMIT ?"
    params.append(limit)
    with get_conn() as conn:
        rows = conn.execute(q, params).fetchall()
    return [dict(r) for r in rows]


def create_transaction(user_id: int, *, amount: float, txn_date: str,
                       merchant_name: str | None, category: str,
                       account_id: int | None = None,
                       note: str | None = None,
                       source: str = "manual") -> int:
    if category not in ALL_CATEGORIES:
        raise ValueError(f"Unknown category: {category}")
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO finance_transactions "
            "(user_id, account_id, source, amount, txn_date, merchant_name, "
            " category, note, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, account_id, source, amount, txn_date,
             (merchant_name or "").strip() or None,
             category, (note or "").strip() or None, _now()),
        )
        conn.commit()
        return int(cur.lastrowid)


def update_transaction(txn_id: int, user_id: int, fields: dict) -> bool:
    allowed = {"amount", "txn_date", "merchant_name", "category_override", "note"}
    safe = {k: v for k, v in fields.items() if k in allowed}
    if not safe:
        return False
    if "category_override" in safe and safe["category_override"] and safe["category_override"] not in ALL_CATEGORIES:
        raise ValueError("Invalid category_override")
    set_clauses = ", ".join(f"{k} = ?" for k in safe)
    params = list(safe.values()) + [txn_id, user_id]
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE finance_transactions SET {set_clauses} WHERE id = ? AND user_id = ?",
            params,
        )
        conn.commit()
    return cur.rowcount > 0


def delete_transaction(txn_id: int, user_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM finance_transactions WHERE id = ? AND user_id = ?",
            (txn_id, user_id),
        )
        conn.commit()
    return cur.rowcount > 0


def effective_category(row: dict) -> str:
    """category_override wins over the stored category (user correction)."""
    return row.get("category_override") or row.get("category") or "other"


# ── Budgets ──────────────────────────────────────────────────────────────


def get_budgets(user_id: int) -> dict[str, float]:
    """Returns {category: monthly_cap} including 'total' if set."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT category, monthly_cap FROM finance_budgets WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return {r["category"]: float(r["monthly_cap"]) for r in rows}


def set_budget(user_id: int, category: str, monthly_cap: float) -> None:
    if category != TOTAL_BUDGET_KEY and category not in SPEND_CATEGORIES:
        raise ValueError(f"Invalid budget category: {category}")
    if monthly_cap < 0:
        raise ValueError("Budget cap must be non-negative")
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO finance_budgets (user_id, category, monthly_cap, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, category) DO UPDATE SET
                monthly_cap = excluded.monthly_cap,
                updated_at = excluded.updated_at
        """, (user_id, category, monthly_cap, _now()))
        conn.commit()


def delete_budget(user_id: int, category: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM finance_budgets WHERE user_id = ? AND category = ?",
            (user_id, category),
        )
        conn.commit()
    return cur.rowcount > 0


# ── Bills ────────────────────────────────────────────────────────────────


def list_bills(user_id: int, *, include_paid: bool = True) -> list[dict]:
    q = "SELECT * FROM finance_bills WHERE user_id = ?"
    if not include_paid:
        q += " AND status != 'paid'"
    q += " ORDER BY due_date"
    with get_conn() as conn:
        rows = conn.execute(q, (user_id,)).fetchall()
    return [dict(r) for r in rows]


def create_bill(user_id: int, *, name: str, amount: float | None,
                due_date: str, frequency: str = "monthly",
                account_id: int | None = None, note: str | None = None,
                source: str = "manual") -> int:
    if frequency not in ("monthly", "weekly", "biweekly", "yearly", "once"):
        raise ValueError(f"Invalid bill frequency: {frequency}")
    now = _now()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO finance_bills (user_id, source, name, amount, due_date, "
            "frequency, account_id, note, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, source, name.strip(), amount, due_date, frequency,
             account_id, (note or "").strip() or None, now, now),
        )
        conn.commit()
        return int(cur.lastrowid)


def mark_bill_paid(bill_id: int, user_id: int, paid_date: str | None = None) -> dict | None:
    """Mark a bill paid. For recurring bills, auto-advances due_date to the
    next occurrence; for 'once' bills, leaves status='paid' terminally."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM finance_bills WHERE id = ? AND user_id = ?",
            (bill_id, user_id),
        ).fetchone()
        if not row:
            return None
        bill = dict(row)
        paid = paid_date or _today()
        if bill["frequency"] == "once":
            conn.execute(
                "UPDATE finance_bills SET status = 'paid', last_paid_date = ?, "
                "updated_at = ? WHERE id = ?",
                (paid, _now(), bill_id),
            )
        else:
            next_due = _advance_due_date(bill["due_date"], bill["frequency"])
            conn.execute(
                "UPDATE finance_bills SET status = 'upcoming', last_paid_date = ?, "
                "due_date = ?, updated_at = ? WHERE id = ?",
                (paid, next_due, _now(), bill_id),
            )
        conn.commit()
        updated = conn.execute(
            "SELECT * FROM finance_bills WHERE id = ?", (bill_id,),
        ).fetchone()
        return dict(updated) if updated else None


def delete_bill(bill_id: int, user_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM finance_bills WHERE id = ? AND user_id = ?",
            (bill_id, user_id),
        )
        conn.commit()
    return cur.rowcount > 0


def _advance_due_date(current: str, frequency: str) -> str:
    try:
        d = date.fromisoformat(current)
    except Exception:
        return current
    if frequency == "weekly":
        return (d + timedelta(days=7)).isoformat()
    if frequency == "biweekly":
        return (d + timedelta(days=14)).isoformat()
    if frequency == "monthly":
        y, m = d.year, d.month + 1
        if m > 12:
            y += 1; m = 1
        try:
            return d.replace(year=y, month=m).isoformat()
        except ValueError:
            # e.g. Jan 31 → Feb 28/29
            import calendar
            last = calendar.monthrange(y, m)[1]
            return d.replace(year=y, month=m, day=last).isoformat()
    if frequency == "yearly":
        try:
            return d.replace(year=d.year + 1).isoformat()
        except ValueError:
            return (d + timedelta(days=365)).isoformat()
    return current


# ── Aggregations (hot path for the Finance tab) ─────────────────────────


def month_range(today: date | None = None) -> tuple[str, str]:
    """(first_of_month, today) inclusive — the range we sum current spend over."""
    today = today or date.today()
    first = today.replace(day=1)
    return first.isoformat(), today.isoformat()


def week_range(today: date | None = None) -> tuple[str, str]:
    """(monday, today) inclusive."""
    today = today or date.today()
    monday = today - timedelta(days=today.weekday())
    return monday.isoformat(), today.isoformat()


def _sum_expenses(rows: list[dict], category: str | None = None) -> float:
    total = 0.0
    for r in rows:
        cat = effective_category(r)
        if cat in ("income", "transfer"):
            continue
        if category and category != TOTAL_BUDGET_KEY and cat != category:
            continue
        amt = float(r.get("amount") or 0)
        if amt > 0:  # expense
            total += amt
    return round(total, 2)


def _sum_income(rows: list[dict]) -> float:
    total = 0.0
    for r in rows:
        if effective_category(r) == "income" and float(r.get("amount") or 0) < 0:
            total += -float(r["amount"])
    return round(total, 2)


def finance_summary(user_id: int, today: date | None = None) -> dict:
    """Single hot-path read for the Finance tab. Returns everything the
    client needs to render the Today view without N+1 fetches."""
    today = today or date.today()
    month_start, month_end = month_range(today)
    week_start, week_end = week_range(today)

    # Pull all month-to-date transactions once
    with get_conn() as conn:
        month_rows = conn.execute(
            "SELECT * FROM finance_transactions "
            "WHERE user_id = ? AND txn_date >= ? AND txn_date <= ?",
            (user_id, month_start, month_end),
        ).fetchall()
    month_rows = [dict(r) for r in month_rows]
    week_rows = [r for r in month_rows if r["txn_date"] >= week_start]

    budgets = get_budgets(user_id)

    spent_month = _sum_expenses(month_rows)
    spent_week = _sum_expenses(week_rows)
    income_month = _sum_income(month_rows)

    # Per-category month-to-date spend
    by_category = {c: _sum_expenses(month_rows, c) for c in SPEND_CATEGORIES}

    # Budget progress
    total_cap = budgets.get(TOTAL_BUDGET_KEY)
    budget_progress = {}
    for cat, cap in budgets.items():
        if cat == TOTAL_BUDGET_KEY:
            spent = spent_month
        else:
            spent = by_category.get(cat, 0.0)
        budget_progress[cat] = {
            "cap": cap,
            "spent": spent,
            "remaining": round(cap - spent, 2),
            "pct": round(spent / cap, 3) if cap > 0 else None,
        }

    # Upcoming bills in next 7 days
    bills = list_bills(user_id, include_paid=False)
    in_7d = (today + timedelta(days=7)).isoformat()
    upcoming_bills = [b for b in bills if b["due_date"] <= in_7d]
    upcoming_total = round(sum(float(b["amount"] or 0) for b in upcoming_bills), 2)

    # Safe to Spend This Week = weekly budget slice - already-spent - upcoming-bills
    # Weekly budget slice = total_cap / 4.33 if user has a total budget; else
    # sum of per-category caps / 4.33.
    weekly_budget_slice = None
    if total_cap is not None:
        weekly_budget_slice = round(total_cap / 4.33, 2)
    elif budgets:
        per_cat_total = sum(v for k, v in budgets.items() if k != TOTAL_BUDGET_KEY)
        if per_cat_total > 0:
            weekly_budget_slice = round(per_cat_total / 4.33, 2)
    safe_to_spend = None
    if weekly_budget_slice is not None:
        safe_to_spend = round(weekly_budget_slice - spent_week - upcoming_total, 2)

    return {
        "today": today.isoformat(),
        "month_start": month_start,
        "week_start": week_start,
        "spent_month": spent_month,
        "spent_week": spent_week,
        "income_month": income_month,
        "by_category": by_category,
        "budgets": budgets,
        "budget_progress": budget_progress,
        "upcoming_bills": upcoming_bills,
        "upcoming_bills_total": upcoming_total,
        "weekly_budget_slice": weekly_budget_slice,
        "safe_to_spend": safe_to_spend,
        "accounts": list_accounts(user_id),
        "txn_count_month": len(month_rows),
    }


# ── Helpers used by goals_engine ────────────────────────────────────────


def monthly_spend_to_date(user_id: int, today: date | None = None) -> float:
    today = today or date.today()
    ms, me = month_range(today)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT category, category_override, amount FROM finance_transactions "
            "WHERE user_id = ? AND txn_date >= ? AND txn_date <= ?",
            (user_id, ms, me),
        ).fetchall()
    return _sum_expenses([dict(r) for r in rows])


def had_budget_adherent_week(user_id: int, week_start: date,
                             budgets: dict[str, float] | None = None) -> bool:
    """True if the user stayed at-or-under their weekly budget for the 7-day
    window starting `week_start`. Used by FIN-05 budget-streak goal.

    Also requires at least one transaction during the week so empty
    historical weeks (before the user started logging) don't inflate the
    streak — a week with zero transactions is 'no data', not 'succeeded'."""
    budgets = budgets if budgets is not None else get_budgets(user_id)
    total_cap = budgets.get(TOTAL_BUDGET_KEY)
    if total_cap is None:
        # If only per-category caps, fold them together.
        per_cat = sum(v for k, v in budgets.items() if k != TOTAL_BUDGET_KEY)
        if per_cat == 0:
            return False  # no budget set → can't qualify
        total_cap = per_cat
    weekly_slice = total_cap / 4.33
    ws = week_start.isoformat()
    we = (week_start + timedelta(days=6)).isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT category, category_override, amount FROM finance_transactions "
            "WHERE user_id = ? AND txn_date >= ? AND txn_date <= ?",
            (user_id, ws, we),
        ).fetchall()
    row_list = [dict(r) for r in rows]
    # Count only real (expense-or-income) activity, not just empty rows.
    if not row_list:
        return False
    spent = _sum_expenses(row_list)
    return spent <= weekly_slice
