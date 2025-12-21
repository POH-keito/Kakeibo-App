import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo, useCallback } from 'react';
import {
  useEnrichedTransactions,
  useUsers,
  useBurdenRatio,
} from '../lib/api';
import type { EnrichedTransaction } from '../lib/types';

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
    Map<number, { userId: number; percent: number }[]>
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
          return a.categoryMinorName.localeCompare(b.categoryMinorName);
        });
        break;
      case 'amount':
        sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
        break;
    }

    return sorted;
  }, [filteredTransactions, sortMode]);

  // Default burden ratio for this month
  const defaultRatio = useMemo(() => {
    if (!burdenRatio?.details || users.length === 0) return null;
    const firstUser = users[0];
    const firstDetail = burdenRatio.details.find((d) => d.user_id === firstUser.id);
    return firstDetail?.ratio_percent || 50;
  }, [burdenRatio, users]);

  // Handle slider change
  const handleSliderChange = useCallback(
    (transactionId: number, firstUserPercent: number) => {
      if (users.length < 2) return;

      const newChanges = new Map(pendingChanges);
      newChanges.set(transactionId, [
        { userId: users[0].id, percent: firstUserPercent },
        { userId: users[1].id, percent: 100 - firstUserPercent },
      ]);
      setPendingChanges(newChanges);
    },
    [pendingChanges, users]
  );

  // Reset to default
  const handleReset = useCallback(
    (transactionId: number) => {
      const newChanges = new Map(pendingChanges);
      newChanges.delete(transactionId);
      setPendingChanges(newChanges);
    },
    [pendingChanges]
  );

  // Apply default to all
  const handleApplyDefaultToAll = async () => {
    if (!window.confirm('全ての取引にデフォルト按分を適用しますか？')) return;

    setSaveStatus('saving');
    try {
      const householdTxIds = groupedTransactions
        .filter((tx) => tx.processing_status === '按分_家計')
        .map((tx) => tx.id);

      const res = await fetch('/api/shares/apply-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          transaction_ids: householdTxIds,
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
      const overrides: Array<{ transaction_id: number; user_id: number; amount: number }> = [];

      pendingChanges.forEach((shares, transactionId) => {
        const tx = transactions.find((t) => t.id === transactionId);
        if (!tx) return;

        shares.forEach((share) => {
          overrides.push({
            transaction_id: transactionId,
            user_id: share.userId,
            amount: Math.round(Math.abs(tx.amount) * (share.percent / 100)),
          });
        });
      });

      const res = await fetch('/api/shares/save-batch', {
        method: 'POST',
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

  const ratioDisplay = useMemo(() => {
    if (!burdenRatio?.details || !users.length) return null;
    return burdenRatio.details
      .map((d) => {
        const user = users.find((u) => u.id === d.user_id);
        return `${user?.aliases[0] || user?.name}: ${d.ratio_percent}%`;
      })
      .join(' / ');
  }, [burdenRatio, users]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">取引詳細</h2>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-4 shadow">
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

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeExcluded}
            onChange={(e) => setIncludeExcluded(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">按分対象外を表示</span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleApplyDefaultToAll}
            className="rounded bg-gray-600 px-3 py-2 text-sm text-white hover:bg-gray-700"
          >
            デフォルト按分を適用
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={pendingChanges.size === 0 || saveStatus === 'saving'}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saveStatus === 'saving'
              ? '保存中...'
              : `変更を保存${pendingChanges.size > 0 ? ` (${pendingChanges.size}件)` : ''}`}
          </button>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-gray-100 p-3 text-sm">
        {ratioDisplay && (
          <span className="text-gray-600">今月のデフォルト按分: {ratioDisplay}</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-green-600">保存完了</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-red-600">保存エラー</span>
        )}
      </div>

      {/* Sort tabs */}
      <div className="flex gap-2 border-b">
        {[
          { key: 'date-status', label: '日付・ステータス順' },
          { key: 'status-date', label: 'ステータス・日付順' },
          { key: 'category', label: 'カテゴリ順' },
          { key: 'amount', label: '金額順' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSortMode(tab.key as SortMode)}
            className={`px-4 py-2 text-sm ${
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
        <div className="flex h-64 items-center justify-center">
          <div className="text-lg text-gray-600">読み込み中...</div>
        </div>
      ) : (
        <div className="space-y-2">
          {groupedTransactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              users={users}
              defaultRatio={defaultRatio}
              pendingChange={pendingChanges.get(tx.id)}
              onSliderChange={(percent) => handleSliderChange(tx.id, percent)}
              onReset={() => handleReset(tx.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  transaction: tx,
  users,
  defaultRatio,
  pendingChange,
  onSliderChange,
  onReset,
}: {
  transaction: EnrichedTransaction;
  users: { id: number; name: string; aliases: string[] }[];
  defaultRatio: number | null;
  pendingChange?: { userId: number; percent: number }[];
  onSliderChange: (percent: number) => void;
  onReset: () => void;
}) {
  const isHousehold = tx.processing_status === '按分_家計';

  // Current percentage for first user
  const currentPercent = useMemo(() => {
    if (pendingChange) {
      return pendingChange[0]?.percent || 50;
    }
    const firstShare = tx.userShares.find((s) => s.userId === users[0]?.id);
    return firstShare?.percent || defaultRatio || 50;
  }, [pendingChange, tx.userShares, users, defaultRatio]);

  // Determine slider color
  const sliderColor = useMemo(() => {
    if (pendingChange) return 'border-red-500'; // Has pending change
    if (tx.hasOverrides) return 'border-red-300'; // Has saved override
    return 'border-green-500'; // Using default
  }, [pendingChange, tx.hasOverrides]);

  return (
    <div className={`rounded-lg bg-white p-4 shadow ${
      tx.processing_status.startsWith('集計除外') ? 'opacity-60' : ''
    }`}>
      <div className="flex flex-wrap items-start gap-4">
        {/* Date & Status */}
        <div className="w-32">
          <div className="text-sm font-medium">{tx.transaction_date}</div>
          <div className="text-xs text-gray-500">{tx.processing_status}</div>
        </div>

        {/* Content & Category */}
        <div className="flex-1 min-w-48">
          <div className="font-medium">{tx.content}</div>
          <div className="text-sm text-gray-500">
            {tx.categoryMajorName} &gt; {tx.categoryMinorName}
          </div>
        </div>

        {/* Amount */}
        <div className="w-28 text-right">
          <div className="text-lg font-bold">
            ¥{Math.abs(tx.amount).toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">{tx.costType}</div>
        </div>

        {/* Slider (only for household transactions) */}
        {isHousehold && users.length >= 2 && (
          <div className={`w-64 rounded border-2 p-2 ${sliderColor}`}>
            <div className="mb-1 flex justify-between text-xs">
              <span>{users[0]?.aliases[0] || users[0]?.name}: {currentPercent}%</span>
              <span>{users[1]?.aliases[0] || users[1]?.name}: {100 - currentPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={currentPercent}
              onChange={(e) => onSliderChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>¥{Math.round(Math.abs(tx.amount) * currentPercent / 100).toLocaleString()}</span>
              <span>¥{Math.round(Math.abs(tx.amount) * (100 - currentPercent) / 100).toLocaleString()}</span>
            </div>
            {(pendingChange || tx.hasOverrides) && (
              <button
                onClick={onReset}
                className="mt-1 text-xs text-blue-600 hover:underline"
              >
                デフォルトに戻す
              </button>
            )}
          </div>
        )}
      </div>

      {/* Memo */}
      {tx.memo && (
        <div className="mt-2 text-sm text-gray-600">
          メモ: {tx.memo}
        </div>
      )}
    </div>
  );
}
