// Finance types (PRD §4.5). Mirrors the four backend tables.
// Sign convention: amount > 0 = expense, amount < 0 = income.

export type TxnCategory =
  | 'groceries'
  | 'dining'
  | 'transport'
  | 'entertainment'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'travel'
  | 'other'
  | 'income'
  | 'transfer';

export const SPEND_CATEGORIES: readonly TxnCategory[] = [
  'groceries', 'dining', 'transport', 'entertainment', 'shopping',
  'bills', 'health', 'travel', 'other',
] as const;

export const ALL_CATEGORIES: readonly TxnCategory[] = [
  ...SPEND_CATEGORIES, 'income', 'transfer',
] as const;

export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'cash';
export type TxnSource = 'manual' | 'plaid';
export type BillFrequency = 'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'once';
export type BillStatus = 'upcoming' | 'paid' | 'overdue' | 'skipped';

export interface FinanceAccount {
  id: number;
  user_id: number;
  source: TxnSource;
  plaid_account_id?: string | null;
  plaid_item_id?: string | null;
  name: string;
  mask?: string | null;
  account_type?: AccountType | null;
  subtype?: string | null;
  current_balance?: number | null;
  available_balance?: number | null;
  iso_currency?: string;
  created_at: string;
  updated_at: string;
}

export interface FinanceTransaction {
  id: number;
  user_id: number;
  account_id?: number | null;
  source: TxnSource;
  plaid_transaction_id?: string | null;
  amount: number;
  iso_currency?: string;
  txn_date: string;  // YYYY-MM-DD
  merchant_name?: string | null;
  category?: TxnCategory | null;
  category_override?: TxnCategory | null;
  pending?: number;
  note?: string | null;
  created_at: string;
}

export interface FinanceBill {
  id: number;
  user_id: number;
  source: TxnSource;
  name: string;
  amount?: number | null;
  due_date: string;
  frequency: BillFrequency;
  account_id?: number | null;
  status: BillStatus;
  last_paid_date?: string | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetProgress {
  cap: number;
  spent: number;
  remaining: number;
  pct: number | null;
}

export interface FinanceSummaryResponse {
  ok: boolean;
  today: string;
  month_start: string;
  week_start: string;
  spent_month: number;
  spent_week: number;
  income_month: number;
  by_category: Record<string, number>;
  budgets: Record<string, number>;
  budget_progress: Record<string, BudgetProgress>;
  upcoming_bills: FinanceBill[];
  upcoming_bills_total: number;
  weekly_budget_slice: number | null;
  safe_to_spend: number | null;
  accounts: FinanceAccount[];
  txn_count_month: number;
}

export interface FinanceTransactionsResponse {
  ok: boolean;
  transactions: FinanceTransaction[];
}

export interface FinanceBillsResponse {
  ok: boolean;
  bills: FinanceBill[];
}

export interface FinanceBudgetsResponse {
  ok: boolean;
  budgets: Record<string, number>;
}

export interface CreateTransactionInput {
  amount: number;
  txn_date?: string;
  merchant_name?: string;
  category: TxnCategory;
  account_id?: number;
  note?: string;
}

export interface CreateBillInput {
  name: string;
  amount?: number;
  due_date: string;
  frequency?: BillFrequency;
  account_id?: number;
  note?: string;
}
