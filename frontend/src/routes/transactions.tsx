import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState, useMemo, useCallback } from 'react';
import {
  useEnrichedTransactions,
  useUsers,
  useBurdenRatio,
  useApplyDefaultRatio,
  useSaveOverridesBatch,
  fetchApi,
} from '../lib/api';
import type { EnrichedTransaction } from '../lib/types';
import { TransactionsSkeleton } from '../components/Skeleton';

// Format date string to YYYY-MM-DD
function formatDate(dateStr: string): string {
  return dateStr.split('T')[0];
}

export const Route = createFileRoute('/transactions')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData({
      queryKey: ['me'],
      queryFn: () => fetchApi<{ email: string; role: string }>('/auth/me'),
    });
    if (user.role !== 'admin') {
      throw redirect({ to: '/' });
    }
  },
  component: TransactionsPage,
});

type SortMode = 'date-status' | 'status-date' | 'status-category' | 'status-category-amount' | 'category' | 'amount';

function TransactionsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [includeExcluded, setIncludeExcluded] = useState(true);
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

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    if (includeExcluded) return transactions;
    return transactions.filter((tx) => !tx.processing_status.startsWith('集計除外'));
  }, [transactions, includeExcluded]);

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

  // Mutations
  const applyDefaultRatio = useApplyDefaultRatio();
  const saveOverridesBatch = useSaveOverridesBatch();

  // Apply default burden ratio to all transactions
  const handleApplyDefault = async () => {
    if (!burdenRatio?.details) return;

    setSaveStatus('saving');
    try {
      const householdTransactions = transactions.filter(
        (tx) => tx.processing_status === '按分_家計'
      );
      const moneyforwardIds = householdTransactions.map((tx) => tx.moneyforward_id);

      await applyDefaultRatio.mutateAsync({
        year,
        month,
        moneyforwardIds,
      });

      setPendingChanges(new Map());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

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

  // Export CSV
  const handleExport = () => {
    const url = `/api/transactions/export?year=${year}&month=${month}`;
    window.location.href = url;
  };

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

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeExcluded}
              onChange={(e) => setIncludeExcluded(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">集計除外も表示</span>
          </label>

          <button
            onClick={handleExport}
            className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
          >
            CSVエクスポート
          </button>

          {burdenRatio && (
            <button
              onClick={handleApplyDefault}
              disabled={saveStatus === 'saving'}
              className="ml-auto rounded bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
            >
              デフォルト按分を適用
            </button>
          )}

          {hasPendingChanges && (
            <>
              <div className="flex items-center gap-2 rounded bg-yellow-50 px-3 py-2">
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

      {/* Transaction table */}
      {isLoading ? (
        <TransactionsSkeleton />
      ) : (
        <div className="rounded-lg bg-white shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700 w-28">日付</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 w-28">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">内容</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 w-48">カテゴリ</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700 w-28">金額</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 w-56">負担割合</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groupedTransactions.map((tx) => (
                <TransactionRow
                  key={tx.moneyforward_id}
                  transaction={tx}
                  users={users}
                  currentShares={getCurrentShares(tx)}
                  onUpdateShares={(shares) => updateShares(tx.moneyforward_id, shares)}
                />
              ))}
            </tbody>
          </table>

          {groupedTransactions.length === 0 && (
            <div className="p-8 text-center text-gray-500">
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

  const isHousehold = transaction.processing_status === '按分_家計';
  const isExcluded = transaction.processing_status.startsWith('集計除外');

  return (
    <tr className={`hover:bg-gray-50 ${isExcluded ? 'text-gray-400' : ''}`}>
      <td className="px-4 py-3 whitespace-nowrap">
        {formatDate(transaction.transaction_date)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            isHousehold
              ? 'bg-blue-100 text-blue-800'
              : isExcluded
              ? 'bg-gray-100 text-gray-600'
              : 'bg-green-100 text-green-800'
          }`}
        >
          {transaction.processing_status}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="truncate max-w-md block">{transaction.content}</span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {transaction.categoryMajorName}
        {transaction.categoryMinorName && (
          <span className="text-gray-400"> / {transaction.categoryMinorName}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
        ¥{Math.abs(transaction.amount).toLocaleString()}
      </td>
      <td className="px-4 py-3">
        {isHousehold && (
          <BurdenRatioCell
            transaction={transaction}
            users={users}
            currentShares={currentShares}
            isEditing={isEditing}
            editShares={editShares}
            setEditShares={setEditShares}
            onEditStart={handleEditStart}
            onEditCancel={handleEditCancel}
            onEditSave={handleEditSave}
          />
        )}
      </td>
    </tr>
  );
}

function BurdenRatioCell({
  transaction,
  users,
  currentShares,
  isEditing,
  editShares,
  setEditShares,
  onEditStart,
  onEditCancel,
  onEditSave,
}: {
  transaction: EnrichedTransaction;
  users: { id: number; name: string; aliases: string[] }[];
  currentShares: { userId: number; percent: number }[];
  isEditing: boolean;
  editShares: { userId: number; percent: number }[];
  setEditShares: React.Dispatch<React.SetStateAction<{ userId: number; percent: number }[]>>;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: () => void;
}) {
  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <div className={`flex gap-3 rounded px-2 py-1 text-xs ${
          transaction.hasOverrides
            ? 'bg-orange-50 border border-orange-200'
            : 'bg-green-50 border border-green-200'
        }`}>
          {currentShares.map((share) => {
            const user = users.find((u) => u.id === share.userId);
            const alias = user?.aliases[0] || user?.name || '?';
            return (
              <span key={share.userId}>
                <span className="font-medium">{alias}:</span> {share.percent.toFixed(0)}%
              </span>
            );
          })}
        </div>
        <button
          onClick={onEditStart}
          className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
        >
          編集
        </button>
      </div>
    );
  }

  // Editing mode
  if (users.length === 2) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs w-12">{users[0]?.aliases[0] || users[0]?.name}:</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={editShares[0]?.percent || 0}
            onChange={(e) => {
              const p1 = parseFloat(e.target.value);
              setEditShares([
                { userId: users[0].id, percent: p1 },
                { userId: users[1].id, percent: 100 - p1 },
              ]);
            }}
            className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs w-10">{editShares[0]?.percent?.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <span className="text-xs w-12">{users[1]?.aliases[0] || users[1]?.name}:</span>
          <div className="flex-1" />
          <span className="text-xs w-10">{editShares[1]?.percent?.toFixed(0)}%</span>
        </div>
        <div className="flex justify-end gap-1">
          <button onClick={onEditCancel} className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50">
            取消
          </button>
          <button onClick={onEditSave} className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700">
            OK
          </button>
        </div>
      </div>
    );
  }

  return null;
}
