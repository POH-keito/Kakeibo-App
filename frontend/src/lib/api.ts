import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Transaction,
  Category,
  User,
  Tag,
  TransactionShare,
  TransactionShareOverride,
  TransactionTag,
  BurdenRatio,
  MonthlyMemo,
  MonthlySummary,
  EnrichedTransaction,
  ChatMessage,
  AIAnalysisResponse,
  CostTrendData,
} from './types';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      // Try to parse error response
      const errorData = await res.json().catch(() => null);

      if (errorData?.error) {
        // Structured error response from backend
        throw new ApiError(
          errorData.error.statusCode || res.status,
          errorData.error.message || 'エラーが発生しました',
          errorData.error.code
        );
      }

      // Fallback for non-structured errors
      throw new ApiError(res.status, `HTTPエラー: ${res.status}`);
    }

    return res.json();
  } catch (err) {
    // Network errors (offline, timeout, etc.)
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new ApiError(0, 'ネットワークエラーが発生しました。インターネット接続を確認してください。');
    }

    // Re-throw ApiError and other errors
    throw err;
  }
}

// Master data hooks (low-frequency updates)
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchApi<Category[]>('/master/categories'),
    staleTime: 1 * 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000,   // 24 hours
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => fetchApi<User[]>('/master/users'),
    staleTime: 1 * 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000,   // 24 hours
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => fetchApi<Tag[]>('/master/tags'),
    staleTime: 1 * 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000,   // 24 hours
  });
}

// Transaction hooks (high-frequency updates)
export function useTransactions(year: string, month: string, includeTagged = false) {
  return useQuery({
    queryKey: ['transactions', year, month, includeTagged],
    queryFn: () =>
      fetchApi<Transaction[]>(
        `/transactions?year=${year}&month=${month}&includeTagged=${includeTagged}`
      ),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

export function useTransactionShares(moneyforwardIds: string[]) {
  return useQuery({
    queryKey: ['transaction-shares', moneyforwardIds],
    queryFn: () =>
      moneyforwardIds.length > 0
        ? fetchApi<TransactionShare[]>(`/transactions/shares?ids=${moneyforwardIds.join(',')}`)
        : Promise.resolve([]),
    enabled: moneyforwardIds.length > 0,
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

export function useTransactionOverrides(moneyforwardIds: string[]) {
  return useQuery({
    queryKey: ['transaction-overrides', moneyforwardIds],
    queryFn: () =>
      moneyforwardIds.length > 0
        ? fetchApi<TransactionShareOverride[]>(
            `/transactions/overrides?ids=${moneyforwardIds.join(',')}`
          )
        : Promise.resolve([]),
    enabled: moneyforwardIds.length > 0,
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

export function useTransactionTags(moneyforwardIds: string[]) {
  return useQuery({
    queryKey: ['transaction-tags', moneyforwardIds],
    queryFn: () =>
      moneyforwardIds.length > 0
        ? fetchApi<TransactionTag[]>(`/transactions/tags?ids=${moneyforwardIds.join(',')}`)
        : Promise.resolve([]),
    enabled: moneyforwardIds.length > 0,
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

export function useBurdenRatio(year: string, month: string) {
  return useQuery({
    queryKey: ['burden-ratio', year, month],
    queryFn: () =>
      fetchApi<BurdenRatio | null>(`/transactions/burden-ratio?year=${year}&month=${month}`),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

export function useMonthlySummary(year: string, month: string, includeTagged = false) {
  return useQuery({
    queryKey: ['monthly-summary', year, month, includeTagged],
    queryFn: () =>
      fetchApi<MonthlySummary>(
        `/transactions/summary?year=${year}&month=${month}&includeTagged=${includeTagged}`
      ),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

export function useCostTrend(months = 6) {
  return useQuery({
    queryKey: ['cost-trend', months],
    queryFn: () => fetchApi<CostTrendData[]>(`/transactions/cost-trend?months=${months}`),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

// Enriched transactions hook
export function useEnrichedTransactions(year: string, month: string, includeTagged = false) {
  const { data: transactions = [], isLoading: txLoading } = useTransactions(
    year,
    month,
    includeTagged
  );
  const { data: categories = [] } = useCategories();
  const { data: users = [] } = useUsers();

  const moneyforwardIds = transactions.map((tx) => tx.moneyforward_id);
  const { data: shares = [] } = useTransactionShares(moneyforwardIds);
  const { data: overrides = [] } = useTransactionOverrides(moneyforwardIds);

  const enrichedTransactions: EnrichedTransaction[] = transactions.map((tx) => {
    const category = categories.find((c) => c.id === tx.category_id);
    const txShares = shares.filter((s) => s.moneyforward_id === tx.moneyforward_id);
    const txOverrides = overrides.filter((o) => o.moneyforward_id === tx.moneyforward_id);
    const hasOverrides = txOverrides.length > 0;

    // Build user shares
    const userShares = txShares.map((share) => {
      const override = txOverrides.find((o) => o.user_id === share.user_id);
      const amount = override ? override.value : share.share_amount;
      const user = users.find((u) => u.id === share.user_id);
      const totalAmount = Math.abs(tx.amount);
      const percent = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;

      return {
        userId: share.user_id,
        alias: user?.aliases[0] || user?.name || `User ${share.user_id}`,
        amount,
        percent,
      };
    });

    return {
      ...tx,
      categoryMajorName: category?.major_name || '未分類',
      categoryMinorName: category?.minor_name || '',
      costType: category?.cost_type || '',
      hasOverrides,
      userShares,
    };
  });

  return {
    data: enrichedTransactions,
    isLoading: txLoading,
  };
}

// Monthly memo hooks
export function useMonthlyMemo(targetMonth: string) {
  return useQuery({
    queryKey: ['monthly-memo', targetMonth],
    queryFn: () => fetchApi<MonthlyMemo | null>(`/memos/${targetMonth}`),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

export function useSaveMonthlyMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetMonth, content }: { targetMonth: string; content: string }) =>
      fetchApi<MonthlyMemo>(`/memos/${targetMonth}`, {
        method: 'PUT',
        body: JSON.stringify({ memo_content: content }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['monthly-memo', variables.targetMonth] });
    },
  });
}

// Tag mutation hooks
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      fetchApi<Tag>('/tags', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name, color }: { id: number; name?: string; color?: string }) =>
      fetchApi<Tag>(`/tags/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      fetchApi<{ success: boolean }>(`/tags/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useTagTransactionCount(tagId: number | null) {
  return useQuery({
    queryKey: ['tag-transactions', tagId],
    queryFn: () =>
      tagId ? fetchApi<{ tag_id: number; transaction_count: number }>(`/tags/${tagId}/transactions`) : null,
    enabled: !!tagId,
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

// Burden ratio hooks
export function useBurdenRatios() {
  return useQuery({
    queryKey: ['burden-ratios'],
    queryFn: () => fetchApi<BurdenRatio[]>('/burden-ratios'),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });
}

export function useCreateBurdenRatio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      effectiveMonth,
      details,
    }: {
      effectiveMonth: string;
      details: Array<{ user_id: number; ratio_percent: number }>;
    }) =>
      fetchApi<BurdenRatio>('/burden-ratios', {
        method: 'POST',
        body: JSON.stringify({ effective_month: effectiveMonth, details }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['burden-ratios'] });
    },
  });
}

export function useUpdateBurdenRatio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      details,
    }: {
      id: number;
      details: Array<{ user_id: number; ratio_percent: number }>;
    }) =>
      fetchApi<BurdenRatio>(`/burden-ratios/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ details }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['burden-ratios'] });
    },
  });
}

export function useDeleteBurdenRatio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      fetchApi<{ success: boolean }>(`/burden-ratios/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['burden-ratios'] });
    },
  });
}

// AI analysis hooks
export function useAIAnalysis() {
  return useMutation({
    mutationFn: ({
      summary,
      month,
      history,
      userMessage,
    }: {
      summary: { totalSpending: number; byCategory: Record<string, number>; userShares: Record<string, number> };
      month: string;
      history?: ChatMessage[];
      userMessage?: string;
    }) =>
      fetchApi<AIAnalysisResponse>('/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ summary, month, history, userMessage }),
      }),
  });
}

// Category summary calculation
export function calculateCategorySummary(
  transactions: Transaction[],
  categories: Category[]
): Record<string, { amount: number; minors: Record<string, number> }> {
  const summary: Record<string, { amount: number; minors: Record<string, number> }> = {};

  transactions
    .filter((tx) => tx.processing_status === '按分_家計')
    .forEach((tx) => {
      const category = categories.find((c) => c.id === tx.category_id);
      const majorName = category?.major_name || '未分類';
      const minorName = category?.minor_name || '未分類';
      const amount = Math.abs(tx.amount);

      if (!summary[majorName]) {
        summary[majorName] = { amount: 0, minors: {} };
      }
      summary[majorName].amount += amount;

      if (!summary[majorName].minors[minorName]) {
        summary[majorName].minors[minorName] = 0;
      }
      summary[majorName].minors[minorName] += amount;
    });

  return summary;
}

// Cost type summary calculation
export function calculateCostTypeSummary(
  transactions: Transaction[],
  categories: Category[]
): Record<string, { amount: number; majors: Record<string, { amount: number; minors: Record<string, number> }> }> {
  const summary: Record<string, { amount: number; majors: Record<string, { amount: number; minors: Record<string, number> }> }> = {};

  transactions
    .filter((tx) => tx.processing_status === '按分_家計')
    .forEach((tx) => {
      const category = categories.find((c) => c.id === tx.category_id);
      const costType = category?.cost_type || '未分類';
      const majorName = category?.major_name || '未分類';
      const minorName = category?.minor_name || '未分類';
      const amount = Math.abs(tx.amount);

      if (!summary[costType]) {
        summary[costType] = { amount: 0, majors: {} };
      }
      summary[costType].amount += amount;

      if (!summary[costType].majors[majorName]) {
        summary[costType].majors[majorName] = { amount: 0, minors: {} };
      }
      summary[costType].majors[majorName].amount += amount;

      if (!summary[costType].majors[majorName].minors[minorName]) {
        summary[costType].majors[majorName].minors[minorName] = 0;
      }
      summary[costType].majors[majorName].minors[minorName] += amount;
    });

  return summary;
}
