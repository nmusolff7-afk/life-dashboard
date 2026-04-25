import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GoalRow, TabHeader } from '../../components/apex';
import { SegmentedControl } from '../../components/ui';
import { useGoals } from '../../lib/hooks/useGoals';
import {
  deleteTransaction, markBillPaid, useFinanceBills,
  useFinanceSummary, useFinanceTransactions,
} from '../../lib/hooks/useFinance';
import { useTokens } from '../../lib/theme';

type Tab = 'today' | 'progress' | 'history';

const CATEGORY_LABELS: Record<string, string> = {
  groceries: 'Groceries',
  dining: 'Dining',
  transport: 'Transport',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  bills: 'Bills',
  health: 'Health',
  travel: 'Travel',
  other: 'Other',
  income: 'Income',
  transfer: 'Transfer',
};

export default function FinanceScreen() {
  const t = useTokens();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('today');
  const summary = useFinanceSummary();
  const txns = useFinanceTransactions(50);
  const bills = useFinanceBills(false);
  const goals = useGoals();
  const [refreshing, setRefreshing] = useState(false);

  // useCallback deps MUST be the stable .refetch refs, NOT the whole
  // hook-return objects. Those objects are new refs on every render, so
  // including them here made the callback identity change every render,
  // which made useFocusEffect re-fire every render, which called refetch,
  // which flipped loading=true, which re-rendered — infinite loop.
  const summaryRefetch = summary.refetch;
  const txnsRefetch = txns.refetch;
  const billsRefetch = bills.refetch;
  const goalsRefetch = goals.refetch;
  useFocusEffect(
    useCallback(() => {
      summaryRefetch();
      txnsRefetch();
      billsRefetch();
      goalsRefetch();
    }, [summaryRefetch, txnsRefetch, billsRefetch, goalsRefetch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([summaryRefetch(), txnsRefetch(), billsRefetch(), goalsRefetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [summaryRefetch, txnsRefetch, billsRefetch, goalsRefetch]);

  const financeGoals = useMemo(
    () => (goals.data?.goals ?? []).filter((g) => g.category === 'finance'),
    [goals.data],
  );

  const hasAnyData =
    !!summary.data &&
    (summary.data.txn_count_month > 0 ||
      Object.keys(summary.data.budgets).length > 0 ||
      summary.data.upcoming_bills.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TabHeader title="Finance" />

      <View style={styles.tabsWrap}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'progress', label: 'Progress' },
            { value: 'history', label: 'History' },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />}>
        {summary.loading && !summary.data ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : tab === 'today' ? (
          <TodayView
            data={summary.data ?? null}
            hasAnyData={hasAnyData}
            onLogTxn={() => router.push('/finance/transaction-new' as never)}
            onSetBudget={() => router.push('/finance/budget' as never)}
            onAddBill={() => router.push('/finance/bill-new' as never)}
            onMarkBillPaid={async (id) => {
              try { await markBillPaid(id); await onRefresh(); } catch { /* noop */ }
            }}
            financeGoals={financeGoals}
            onOpenGoal={(id) => router.push(`/goals/${id}` as never)}
          />
        ) : tab === 'history' ? (
          <HistoryView
            rows={txns.data?.transactions ?? []}
            loading={txns.loading}
            onDelete={async (id) => {
              try { await deleteTransaction(id); await onRefresh(); } catch { /* noop */ }
            }}
            onAdd={() => router.push('/finance/transaction-new' as never)}
          />
        ) : (
          <ProgressView data={summary.data ?? null} />
        )}
      </ScrollView>
    </View>
  );
}

// ── Today ───────────────────────────────────────────────────────────────

function TodayView({
  data, hasAnyData, onLogTxn, onSetBudget, onAddBill, onMarkBillPaid,
  financeGoals, onOpenGoal,
}: {
  data: null | NonNullable<ReturnType<typeof useFinanceSummary>['data']>;
  hasAnyData: boolean;
  onLogTxn: () => void;
  onSetBudget: () => void;
  onAddBill: () => void;
  onMarkBillPaid: (id: number) => void;
  financeGoals: NonNullable<ReturnType<typeof useGoals>['data']>['goals'];
  onOpenGoal: (id: number) => void;
}) {
  const t = useTokens();
  if (!data) return null;

  const safeToSpend = data.safe_to_spend;
  const safeColor =
    safeToSpend == null ? t.muted :
    safeToSpend > 0 ? '#22C55E' : safeToSpend === 0 ? t.muted : '#F59E0B';

  return (
    <>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.heroLabel, { color: t.muted }]}>Safe to spend this week</Text>
        {safeToSpend == null ? (
          <>
            <Text style={[styles.heroBig, { color: t.text }]}>—</Text>
            <Text style={[styles.heroSub, { color: t.muted }]}>
              Set a total budget + log some transactions to get a "safe to spend" number.
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.heroBig, { color: safeColor }]}>${safeToSpend.toLocaleString()}</Text>
            <Text style={[styles.heroSub, { color: t.muted }]}>
              Weekly slice ${data.weekly_budget_slice ?? '—'} · spent ${data.spent_week} · bills due ${data.upcoming_bills_total}
            </Text>
          </>
        )}
      </View>

      {/* Empty-state CTA */}
      {!hasAnyData ? (
        <View style={[styles.emptyCta, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Get started</Text>
          <Text style={[styles.emptyBody, { color: t.muted }]}>
            Finance works with or without a bank connected. Log your first transaction manually, or set a monthly budget to start tracking. Bank linking lands in a later cycle.
          </Text>
          <View style={styles.emptyButtons}>
            <Pressable onPress={onLogTxn} style={[styles.primaryBtn, { backgroundColor: t.accent }]}>
              <Text style={styles.primaryBtnText}>Log transaction</Text>
            </Pressable>
            <Pressable onPress={onSetBudget} style={[styles.secondaryBtn, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={[styles.secondaryBtnText, { color: t.text }]}>Set budget</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Budget subsystem */}
      <SubsystemCard label="Budget" onPressRight={onSetBudget} rightLabel={Object.keys(data.budgets).length ? 'Edit' : 'Set'}>
        {Object.keys(data.budgets).length === 0 ? (
          <Text style={[styles.subsystemEmpty, { color: t.muted }]}>No budget set. Tap "Set" to cap your monthly spending — total or per-category.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {Object.entries(data.budget_progress).map(([cat, p]) => (
              <BudgetBar key={cat} label={cat === 'total' ? 'Total' : CATEGORY_LABELS[cat] ?? cat} progress={p} />
            ))}
          </View>
        )}
      </SubsystemCard>

      {/* Spending subsystem */}
      <SubsystemCard label="Spending" onPressRight={onLogTxn} rightLabel="Log">
        <View style={styles.spendingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.spendingBig, { color: t.text }]}>${data.spent_month.toLocaleString()}</Text>
            <Text style={[styles.subsystemSub, { color: t.muted }]}>month-to-date · {data.txn_count_month} transactions</Text>
          </View>
        </View>
        {data.txn_count_month > 0 ? (
          <View style={styles.catRow}>
            {topCategories(data.by_category, 3).map(([cat, amt]) => (
              <View key={cat} style={styles.catCell}>
                <Text style={[styles.catLabel, { color: t.muted }]}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                <Text style={[styles.catAmt, { color: t.text }]}>${amt.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </SubsystemCard>

      {/* Bills subsystem */}
      <SubsystemCard label="Bills" onPressRight={onAddBill} rightLabel="Add">
        {data.upcoming_bills.length === 0 ? (
          <Text style={[styles.subsystemEmpty, { color: t.muted }]}>No upcoming bills. Add rent, subscriptions, or other recurring bills to track them here.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {data.upcoming_bills.slice(0, 4).map((b) => (
              <BillRow key={b.id} bill={b} onMarkPaid={() => onMarkBillPaid(b.id)} />
            ))}
            <Text style={[styles.subsystemSub, { color: t.muted, marginTop: 4 }]}>
              ${data.upcoming_bills_total.toLocaleString()} due in the next 7 days
            </Text>
          </View>
        )}
      </SubsystemCard>

      {/* Finance goals strip — wired into A1 unified goals system */}
      {financeGoals.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, { color: t.muted }]}>Finance goals</Text>
          {financeGoals.map((g) => (
            <GoalRow key={g.goal_id} goal={g} onPress={() => onOpenGoal(g.goal_id)} />
          ))}
        </>
      ) : null}

      <Text style={[styles.footerNote, { color: t.subtle }]}>
        Bank linking via Plaid lands in a later cycle. Everything here works with manual entry today.
      </Text>
    </>
  );
}

function BudgetBar({ label, progress }: {
  label: string;
  progress: { cap: number; spent: number; remaining: number; pct: number | null };
}) {
  const t = useTokens();
  const pct = Math.max(0, Math.min(1, progress.pct ?? 0));
  const over = progress.spent > progress.cap;
  const fillColor = over ? '#EF4444' : pct > 0.85 ? '#F59E0B' : '#22C55E';
  return (
    <View>
      <View style={styles.budgetHeader}>
        <Text style={[styles.budgetLabel, { color: t.text }]}>{label}</Text>
        <Text style={[styles.budgetNums, { color: t.muted }]}>
          ${progress.spent.toLocaleString()} / ${progress.cap.toLocaleString()}
        </Text>
      </View>
      <View style={[styles.budgetTrack, { backgroundColor: t.border }]}>
        <View style={[styles.budgetFill, { width: `${pct * 100}%`, backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

function BillRow({ bill, onMarkPaid }: {
  bill: { id: number; name: string; amount?: number | null; due_date: string; frequency: string };
  onMarkPaid: () => void;
}) {
  const t = useTokens();
  return (
    <View style={[styles.billRow, { borderColor: t.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.billName, { color: t.text }]}>{bill.name}</Text>
        <Text style={[styles.billMeta, { color: t.muted }]}>
          due {bill.due_date} · {bill.frequency}
        </Text>
      </View>
      <Text style={[styles.billAmt, { color: t.text }]}>
        {bill.amount != null ? `$${bill.amount.toLocaleString()}` : '—'}
      </Text>
      <Pressable onPress={onMarkPaid} hitSlop={10} style={[styles.markPaidBtn, { borderColor: t.accent }]}>
        <Text style={[styles.markPaidText, { color: t.accent }]}>Paid</Text>
      </Pressable>
    </View>
  );
}

// ── History ─────────────────────────────────────────────────────────────

function HistoryView({
  rows, loading, onDelete, onAdd,
}: {
  rows: { id: number; amount: number; txn_date: string; merchant_name: string | null; category: string | null; category_override: string | null; note: string | null; source: string }[];
  loading: boolean;
  onDelete: (id: number) => void;
  onAdd: () => void;
}) {
  const t = useTokens();
  if (loading && rows.length === 0) return <ActivityIndicator color={t.accent} style={{ marginTop: 20 }} />;

  return (
    <>
      <View style={styles.historyHeader}>
        <Text style={[styles.sectionLabel, { color: t.muted }]}>Recent transactions</Text>
        <Pressable onPress={onAdd}>
          <Text style={[styles.linkText, { color: t.accent }]}>+ Log</Text>
        </Pressable>
      </View>
      {rows.length === 0 ? (
        <View style={[styles.emptyCta, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.emptyTitle, { color: t.text }]}>No transactions logged</Text>
          <Text style={[styles.emptyBody, { color: t.muted }]}>
            Log your first transaction to start tracking your spending.
          </Text>
        </View>
      ) : (
        rows.map((r) => {
          const category = r.category_override ?? r.category ?? 'other';
          const isIncome = category === 'income';
          const sign = isIncome ? '+' : '-';
          const amtAbs = Math.abs(r.amount);
          return (
            <Pressable
              key={r.id}
              onLongPress={() => onDelete(r.id)}
              style={[styles.txnRow, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.txnMerchant, { color: t.text }]} numberOfLines={1}>
                  {r.merchant_name || CATEGORY_LABELS[category] || 'Manual entry'}
                </Text>
                <Text style={[styles.txnMeta, { color: t.muted }]}>
                  {r.txn_date} · {CATEGORY_LABELS[category] ?? category}
                  {r.source === 'manual' ? ' · manual' : ''}
                </Text>
              </View>
              <Text style={[styles.txnAmt, { color: isIncome ? '#22C55E' : t.text }]}>
                {sign}${amtAbs.toLocaleString()}
              </Text>
            </Pressable>
          );
        })
      )}
      <Text style={[styles.footerNote, { color: t.subtle }]}>Long-press a row to delete.</Text>
    </>
  );
}

// ── Progress ────────────────────────────────────────────────────────────

function ProgressView({ data }: { data: null | NonNullable<ReturnType<typeof useFinanceSummary>['data']> }) {
  const t = useTokens();
  if (!data) return null;
  const cats = topCategories(data.by_category, 9);
  const max = cats.length ? Math.max(...cats.map(([, v]) => v)) : 1;
  return (
    <>
      <Text style={[styles.sectionLabel, { color: t.muted }]}>Month-to-date by category</Text>
      {cats.length === 0 ? (
        <Text style={[styles.subsystemEmpty, { color: t.muted }]}>No spending this month yet.</Text>
      ) : (
        <View style={[styles.chartCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          {cats.map(([cat, amt]) => {
            const w = max > 0 ? amt / max : 0;
            return (
              <View key={cat} style={styles.chartRow}>
                <Text style={[styles.chartLabel, { color: t.text }]}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                <View style={[styles.chartTrack, { backgroundColor: t.border }]}>
                  <View style={[styles.chartFill, { width: `${w * 100}%`, backgroundColor: t.accent }]} />
                </View>
                <Text style={[styles.chartValue, { color: t.muted }]}>${amt.toLocaleString()}</Text>
              </View>
            );
          })}
        </View>
      )}
      <Text style={[styles.footerNote, { color: t.subtle }]}>
        Cash-flow chart (income vs expenses) lands with Plaid income detection in a later cycle.
      </Text>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function topCategories(byCategory: Record<string, number>, n: number): [string, number][] {
  return Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function SubsystemCard({
  label, onPressRight, rightLabel, children,
}: { label: string; onPressRight: () => void; rightLabel: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={[styles.subsystem, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.subsystemHeader}>
        <Text style={[styles.subsystemLabel, { color: t.muted }]}>{label}</Text>
        <Pressable onPress={onPressRight}>
          <Text style={[styles.linkText, { color: t.accent }]}>{rightLabel}</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabsWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 60, gap: 12 },
  hero: { borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center', gap: 4 },
  heroLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroBig: { fontSize: 40, fontWeight: '800', marginTop: 6 },
  heroSub: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  emptyCta: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  emptyButtons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  primaryBtn: { borderRadius: 100, paddingVertical: 8, paddingHorizontal: 16 },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 16 },
  secondaryBtnText: { fontSize: 13, fontWeight: '700' },

  subsystem: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  subsystemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subsystemLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  subsystemSub: { fontSize: 12 },
  subsystemEmpty: { fontSize: 13, lineHeight: 18 },
  linkText: { fontSize: 13, fontWeight: '600' },

  spendingRow: { flexDirection: 'row', alignItems: 'baseline' },
  spendingBig: { fontSize: 24, fontWeight: '800' },
  catRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  catCell: { flex: 1 },
  catLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  catAmt: { fontSize: 15, fontWeight: '700', marginTop: 2 },

  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  budgetLabel: { fontSize: 13, fontWeight: '600' },
  budgetNums: { fontSize: 12 },
  budgetTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 4 },

  billRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  billName: { fontSize: 14, fontWeight: '600' },
  billMeta: { fontSize: 11, marginTop: 2 },
  billAmt: { fontSize: 14, fontWeight: '700' },
  markPaidBtn: { borderWidth: 1, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  markPaidText: { fontSize: 11, fontWeight: '700' },

  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  txnRow: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  txnMerchant: { fontSize: 14, fontWeight: '600' },
  txnMeta: { fontSize: 11, marginTop: 2 },
  txnAmt: { fontSize: 15, fontWeight: '700' },

  chartCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chartLabel: { width: 90, fontSize: 12, fontWeight: '600' },
  chartTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  chartFill: { height: '100%', borderRadius: 5 },
  chartValue: { width: 70, textAlign: 'right', fontSize: 12, fontWeight: '600' },

  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 2 },
  footerNote: { fontSize: 11, lineHeight: 15, marginTop: 16, fontStyle: 'italic' },
});
