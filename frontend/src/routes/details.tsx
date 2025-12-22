import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo, useCallback } from 'react';
import {
  useEnrichedTransactions,
  useUsers,
  useBurdenRatio,
  useSaveOverridesBatch,
  fetchApi,
} from '../lib/api';
import type { EnrichedTransaction } from '../lib/types';
import { TransactionsSkeleton } from '../components/Skeleton';

// Format date string to YYYY-MM-DD
function formatDate(dateStr: string): string {
  return dateStr.split('T')[0];
}

export const Route = createFileRoute('/details')({
  loader: async ({ context }) => {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    // Prefetch data in parallel
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ['transactions', year, month, true],
        queryFn: () => fetchApi(`/transactions?year=${year}&month=${month}&includeTagged=true`),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ['users'],
        queryFn: () => fetchApi('/master/users'),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ['burden-ratio', year, month],
        queryFn: () => fetchApi(`/transactions/burden-ratio?year=${year}&month=${month}`),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ['categories'],
        queryFn: () => fetchApi('/master/categories'),
      }),
    ]);
  },
  pendingComponent: TransactionsSkeleton,
  component: DetailsPage,
});

type SortMode = 'date-status' | 'status-date' | 'status-category' | 'status-category-amount' | 'category' | 'amount';

function DetailsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [sortMode, setSortMode] = useState<SortMode>('date-status');
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, { userId: number; percent: number }[]>
  >(new Map());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const { data: transactions = [], isLoading } = useEnrichedTransactions(year, month, true);
  const { data: users = [] } = useUsers();
  const { data: burdenRatio } = useBurdenRatio(year, month);

  // Burden ratio display
  const ratioDisplay = useMemo(() => {
    if (!burdenRatio?.details || !users.length) return null;
    return burdenRatio.details
      .map((d) => {
        const user = users.find((u) => u.id === d.user_id);
        return `${user?.aliases[0] || user?.name}: ${d.ratio_percent}%`;
      })
      .join(' / ');
  }, [burdenRatio, users]);

  // Filter out excluded transactions (always)
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => !tx.processing_status.startsWith('集計除外'));
  }, [transactions]);

  // Sort/group transactions
  const groupedTransactions = useMemo(() => {
    const sorted = [...filteredTransactions];

    switch (sortMode) {
      case 'date-status':
        sorted.sort((a, b) => {
          const dateCompare = b.transaction_date.localeCompare(a.transaction_date);
          if (dateCompare !== 0) return dateCompare;
          return a.processing_status.localeCompare(b.processing_status);
        });
        break;
      case 'status-date':
        sorted.sort((a, b) => {
          const statusCompare = a.processing_status.localeCompare(b.processing_status);
          if (statusCompare !== 0) return statusCompare;
          return b.transaction_date.localeCompare(a.transaction_date);
        });
        break;
      case 'status-category':
        sorted.sort((a, b) => {
          const statusCompare = a.processing_status.localeCompare(b.processing_status);
          if (statusCompare !== 0) return statusCompare;
          const majorCompare = a.categoryMajorName.localeCompare(b.categoryMajorName);
          if (majorCompare !== 0) return majorCompare;
          return a.categoryMinorName.localeCompare(b.categoryMinorName);
        });
        break;
      case 'status-category-amount':
        sorted.sort((a, b) => {
          const statusCompare = a.processing_status.localeCompare(b.processing_status);
          if (statusCompare !== 0) return statusCompare;
          const majorCompare = a.categoryMajorName.localeCompare(b.categoryMajorName);
          if (majorCompare !== 0) return majorCompare;
          const minorCompare = a.categoryMinorName.localeCompare(b.categoryMinorName);
          if (minorCompare !== 0) return minorCompare;
          return Math.abs(b.amount) - Math.abs(a.amount);
        });
        break;
      case 'category':
        sorted.sort((a, b) => {
          const majorCompare = a.categoryMajorName.localeCompare(b.categoryMajorName);
          if (majorCompare !== 0) return majorCompare;
          const minorCompare = a.categoryMinorName.localeCompare(b.categoryMinorName);
          if (minorCompare !== 0) return minorCompare;
          return b.transaction_date.localeCompare(a.transaction_date);
        });
        break;
      case 'amount':
        sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
        break;
    }

    return sorted;
  }, [filteredTransactions, sortMode]);

  // Check if there are any pending changes
  const hasPendingChanges = pendingChanges.size > 0;

  // Update share percentages for a transaction
  const updateShares = useCallback((moneyforwardId: string, shares: { userId: number; percent: number }[]) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(moneyforwardId, shares);
      return next;
    });
  }, []);

  // Get current shares (with pending changes applied)
  const getCurrentShares = useCallback(
    (tx: EnrichedTransaction) => {
      return pendingChanges.get(tx.moneyforward_id) || tx.userShares.map((s) => ({
        userId: s.userId,
        percent: s.percent,
      }));
    },
    [pendingChanges]
  );

  // Mutation
  const saveOverridesBatch = useSaveOverridesBatch();

  // Save changes
  const handleSaveChanges = async () => {
    if (pendingChanges.size === 0) return;

    setSaveStatus('saving');
    try {
      const overrides = Array.from(pendingChanges.entries()).flatMap(([moneyforwardId, shares]) => {
        const tx = transactions.find((t) => t.moneyforward_id === moneyforwardId);
        if (!tx) return [];

        const totalAmount = Math.abs(tx.amount);
        return shares.map((share) => ({
          moneyforward_id: moneyforwardId,
          user_id: share.userId,
          value: Math.round((totalAmount * share.percent) / 100),
        }));
      });

      await saveOverridesBatch.mutateAsync(overrides);

      setPendingChanges(new Map());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const years = Array.from({ length: 3 }, (_, i) => (now.getFullYear() - i).toString());
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  const sortTabs: { key: SortMode; label: string }[] = [
    { key: 'date-status', label: '日付→ステータス' },
    { key: 'status-date', label: 'ステータス→日付' },
    { key: 'status-category', label: 'ステータス→カテゴリ' },
    { key: 'status-category-amount', label: 'ステータス→カテゴリ→金額' },
    { key: 'category', label: 'カテゴリ' },
    { key: 'amount', label: '金額' },
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-lg bg-white p-4 shadow">
        {/* Default burden ratio info bar */}
        {ratioDisplay && (
          <div className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
            今月のデフォルト按分: {ratioDisplay}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded border px-3 py-2"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded border px-3 py-2"
            >
              {months.map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>

          {hasPendingChanges && (
            <>
              <div className="flex items-center gap-2 rounded bg-yellow-50 px-3 py-2 ml-auto">
                <span className="text-sm text-yellow-800">
                  {pendingChanges.size}件の変更があります
                </span>
              </div>
              <button
                onClick={handleSaveChanges}
                disabled={saveStatus === 'saving'}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                変更を保存
              </button>
            </>
          )}

          {saveStatus === 'saving' && <span className="text-sm text-gray-500">保存中...</span>}
          {saveStatus === 'saved' && <span className="text-sm text-green-600">保存完了</span>}
          {saveStatus === 'error' && <span className="text-sm text-red-600">エラー</span>}
        </div>
      </div>

      {/* Sort tabs */}
      <div className="flex gap-4 border-b bg-white px-4">
        {sortTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSortMode(tab.key)}
            className={`px-4 py-3 text-sm transition-colors ${
              sortMode === tab.key
                ? 'border-b-2 border-blue-600 font-medium text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      {isLoading ? (
        <TransactionsSkeleton />
      ) : (
        <div className="space-y-2">
          {groupedTransactions.map((tx) => (
            <TransactionRow
              key={tx.moneyforward_id}
              transaction={tx}
              users={users}
              currentShares={getCurrentShares(tx)}
              onUpdateShares={(shares) => updateShares(tx.moneyforward_id, shares)}
            />
          ))}

          {groupedTransactions.length === 0 && (
            <div className="rounded-lg bg-white p-8 text-center text-gray-500">
              取引がありません
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  transaction,
  users,
  currentShares,
  onUpdateShares,
}: {
  transaction: EnrichedTransaction;
  users: { id: number; name: string; aliases: string[] }[];
  currentShares: { userId: number; percent: number }[];
  onUpdateShares: (shares: { userId: number; percent: number }[]) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editShares, setEditShares] = useState(currentShares);

  const handleEditStart = () => {
    setEditShares(currentShares);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
  };

  const handleEditSave = () => {
    onUpdateShares(editShares);
    setIsEditing(false);
  };

  const updatePercent = (userId: number, value: string) => {
    const percent = parseFloat(value) || 0;
    setEditShares((prev) =>
      prev.map((s) => (s.userId === userId ? { ...s, percent } : s))
    );
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="font-medium">{formatDate(transaction.transaction_date)}</span>
            <span className="text-sm text-gray-600">{transaction.content}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                transaction.processing_status === '按分_家計'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-green-100 text-green-800'
              }`}
            >
              {transaction.processing_status}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-600">
            <span>
              {transaction.categoryMajorName}
              {transaction.categoryMinorName && ` / ${transaction.categoryMinorName}`}
            </span>
            {transaction.costType && (
              <span className="text-xs text-gray-500">[{transaction.costType}]</span>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-semibold">¥{Math.abs(transaction.amount).toLocaleString()}</div>
          {transaction.hasOverrides && (
            <span className="text-xs text-orange-600">※カスタム按分</span>
          )}
        </div>
      </div>

      {/* Share breakdown */}
      {transaction.processing_status === '按分_家計' && (
        <div className="mt-3 border-t pt-3">
          {!isEditing ? (
            <div className="flex items-center justify-between">
              <div className={`flex gap-4 rounded px-2 py-1 ${
                transaction.hasOverrides
                  ? 'bg-orange-50 border border-orange-200'
                  : 'bg-green-50 border border-green-200'
              }`}>
                {currentShares.map((share) => {
                  const user = users.find((u) => u.id === share.userId);
                  const alias = user?.aliases[0] || user?.name || `User ${share.userId}`;
                  return (
                    <div key={share.userId} className="text-sm">
                      <span className="font-medium">{alias}:</span>{' '}
                      <span className="text-gray-700">{share.percent.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleEditStart}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                按分を編集
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {users.length === 2 && (
                <>
                  {/* Slider for first user */}
                  <div className="flex items-center gap-4">
                    <span className="w-20 text-sm font-medium">
                      {users[0]?.aliases[0] || users[0]?.name || `User ${editShares[0]?.userId}`}:
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={editShares[0]?.percent || 0}
                      onChange={(e) => {
                        const user1Percent = parseFloat(e.target.value);
                        const user2Percent = 100 - user1Percent;
                        setEditShares([
                          { userId: users[0].id, percent: user1Percent },
                          { userId: users[1].id, percent: user2Percent },
                        ]);
                      }}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                    />
                    <span className="w-16 text-sm">{editShares[0]?.percent?.toFixed(0)}%</span>
                  </div>

                  {/* Display second user (auto-calculated) */}
                  <div className="flex items-center gap-4 text-gray-600">
                    <span className="w-20 text-sm">
                      {users[1]?.aliases[0] || users[1]?.name || `User ${editShares[1]?.userId}`}:
                    </span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-lg" />
                    <span className="w-16 text-sm">{editShares[1]?.percent?.toFixed(0)}%</span>
                  </div>

                  {/* Amount preview */}
                  <div className="flex justify-between text-sm text-gray-600 px-2">
                    <span>
                      {users[0]?.aliases[0] || users[0]?.name}:
                      ¥{Math.round(Math.abs(transaction.amount) * (editShares[0]?.percent || 0) / 100).toLocaleString()}
                    </span>
                    <span>
                      {users[1]?.aliases[0] || users[1]?.name}:
                      ¥{Math.round(Math.abs(transaction.amount) * (editShares[1]?.percent || 0) / 100).toLocaleString()}
                    </span>
                  </div>
                </>
              )}

              {/* Fallback for more than 2 users */}
              {users.length !== 2 && (
                <div className="flex flex-wrap gap-4">
                  {editShares.map((share) => {
                    const user = users.find((u) => u.id === share.userId);
                    const alias = user?.aliases[0] || user?.name || `User ${share.userId}`;
                    return (
                      <div key={share.userId} className="flex items-center gap-2">
                        <span className="text-sm font-medium">{alias}:</span>
                        <input
                          type="number"
                          value={share.percent}
                          onChange={(e) => updatePercent(share.userId, e.target.value)}
                          className="w-20 rounded border px-2 py-1 text-sm"
                          step="0.1"
                        />
                        <span className="text-sm">%</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleEditCancel}
                  className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleEditSave}
                  className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
