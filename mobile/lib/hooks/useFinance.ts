import { useCallback, useEffect, useState } from 'react';

import type {
  CreateBillInput,
  CreateTransactionInput,
  FinanceBillsResponse,
  FinanceSummaryResponse,
  FinanceTransactionsResponse,
} from '../../../shared/src/types/finance';
import { apiFetch } from '../api';
import { useApi } from './useApi';

export function useFinanceSummary() {
  return useApi<FinanceSummaryResponse>('/api/finance/summary');
}

export function useFinanceTransactions(limit = 50) {
  return useApi<FinanceTransactionsResponse>(`/api/finance/transactions?limit=${limit}`);
}

export function useFinanceBills(includePaid = true) {
  return useApi<FinanceBillsResponse>(`/api/finance/bills?include_paid=${includePaid ? 1 : 0}`);
}

export async function createTransaction(input: CreateTransactionInput): Promise<number> {
  const res = await apiFetch('/api/finance/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw Object.assign(new Error(json.error || 'create failed'), { code: json.error_code });
  }
  return json.transaction_id as number;
}

export async function deleteTransaction(txnId: number): Promise<void> {
  const res = await apiFetch(`/api/finance/transactions/${txnId}`, { method: 'DELETE' });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'delete failed');
}

export async function setBudget(category: string, monthlyCap: number): Promise<void> {
  const res = await apiFetch('/api/finance/budget', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, monthly_cap: monthlyCap }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'budget set failed');
}

export async function createBill(input: CreateBillInput): Promise<number> {
  const res = await apiFetch('/api/finance/bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'bill create failed');
  return json.bill_id as number;
}

export async function markBillPaid(billId: number): Promise<void> {
  const res = await apiFetch(`/api/finance/bills/${billId}/mark-paid`, { method: 'POST' });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'mark-paid failed');
}

export async function deleteBill(billId: number): Promise<void> {
  const res = await apiFetch(`/api/finance/bills/${billId}`, { method: 'DELETE' });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'delete failed');
}
