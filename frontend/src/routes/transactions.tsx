import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo, useCallback } from 'react';
import {
  useEnrichedTransactions,
  useUsers,
  useBurdenRatio,
} from '../lib/api';
import type { EnrichedTransaction } from '../lib/types';
import { TransactionsSkeleton } from '../components/Skeleton';

export const Route = createFileRoute('/transactions')({
  component: TransactionsPage,
});

type SortMode = 'date-status' | 'status-date' | 'category' | 'amount';

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

  // Apply default burden ratio to all transactions
  const handleApplyDefault = async () => {
    if (!burdenRatio?.details) return;

    setSaveStatus('saving');
    try {
      const res = await fetch('/api/transactions/apply-default-ratio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          ratioDetails: burdenRatio.details,
        }),
      });

      if (!res.ok) throw new Error('Failed to apply default');

      setPendingChanges(new Map());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      window.location.reload(); // Refresh to get updated data
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

      const res = await fetch('/api/transactions/overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });

      if (!res.ok) throw new Error('Failed to save');

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

  const totalPercent = editShares.reduce((sum, s) => sum + s.percent, 0);
  const isValidTotal = Math.abs(totalPercent - 100) < 0.01;

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="font-medium">{transaction.transaction_date}</span>
            <span className="text-sm text-gray-600">{transaction.content}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                transaction.processing_status === '按分_家計'
                  ? 'bg-blue-100 text-blue-800'
                  : transaction.processing_status.startsWith('集計除外')
                  ? 'bg-gray-100 text-gray-600'
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
              <div className="flex gap-4">
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
            <div className="space-y-2">
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
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  合計: {totalPercent.toFixed(1)}%
                  {!isValidTotal && (
                    <span className="ml-2 text-red-600">※合計が100%ではありません</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleEditCancel}
                    className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={!isValidTotal}
                    className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
