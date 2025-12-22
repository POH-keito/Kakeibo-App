import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useTags, useTransactions, useTransactionTags, useCategories, useAssignTags, useUnassignTags } from '../lib/api';
import { CalendarView, DayTransactionModal } from '../components/CalendarView';
import type { Transaction } from '../lib/types';

export const Route = createFileRoute('/tags')({
  component: TagsPage,
});

type ViewMode = 'summary' | 'calendar';

function TagsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [expandedTags, setExpandedTags] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [modalTransactions, setModalTransactions] = useState<Transaction[]>([]);

  const { data: tags = [] } = useTags();
  const { data: transactions = [], isLoading } = useTransactions(year, month, true);
  const { data: categories = [] } = useCategories();

  const moneyforwardIds = transactions.map((tx) => tx.moneyforward_id);
  const { data: transactionTags = [], refetch: refetchTags } = useTransactionTags(moneyforwardIds);

  // Mutations
  const assignTags = useAssignTags();
  const unassignTags = useUnassignTags();

  // Group transactions by tag
  const tagSummary = useMemo(() => {
    const summary: Record<number, { tag: typeof tags[0]; transactions: typeof transactions; totalAmount: number }> = {};

    // Initialize with all tags
    tags.forEach((tag) => {
      summary[tag.id] = { tag, transactions: [], totalAmount: 0 };
    });

    // Group transactions
    transactionTags.forEach((tt) => {
      const transaction = transactions.find((tx) => tx.moneyforward_id === tt.moneyforward_id);
      if (transaction && summary[tt.tag_id]) {
        summary[tt.tag_id].transactions.push(transaction);
        summary[tt.tag_id].totalAmount += Math.abs(transaction.amount);
      }
    });

    // Filter out tags with no transactions and sort by amount
    return Object.values(summary)
      .filter((s) => s.transactions.length > 0)
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [tags, transactions, transactionTags]);

  const toggleTag = (tagId: number) => {
    const next = new Set(expandedTags);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    setExpandedTags(next);
  };

  const handleDayClick = (date: string, dayTransactions: Transaction[]) => {
    setModalDate(date);
    setModalTransactions(dayTransactions);
    setModalOpen(true);
  };

  const handleSaveTagChanges = async (changes: { moneyforward_id: string; tag_ids: number[] }[]) => {
    // Batch operations by tagId to reduce API calls (N+1 optimization)
    const additionsByTag = new Map<number, string[]>();
    const removalsByTag = new Map<number, string[]>();

    for (const { moneyforward_id, tag_ids } of changes) {
      const currentTags = transactionTags
        .filter((tt) => tt.moneyforward_id === moneyforward_id)
        .map((tt) => tt.tag_id);

      const currentSet = new Set(currentTags);
      const newSet = new Set(tag_ids);

      // Group additions by tagId
      for (const tagId of tag_ids) {
        if (!currentSet.has(tagId)) {
          const ids = additionsByTag.get(tagId) || [];
          ids.push(moneyforward_id);
          additionsByTag.set(tagId, ids);
        }
      }

      // Group removals by tagId
      for (const tagId of currentTags) {
        if (!newSet.has(tagId)) {
          const ids = removalsByTag.get(tagId) || [];
          ids.push(moneyforward_id);
          removalsByTag.set(tagId, ids);
        }
      }
    }

    // Execute batched additions
    for (const [tagId, moneyforwardIds] of additionsByTag) {
      await assignTags.mutateAsync({ tagId, moneyforwardIds });
    }

    // Execute batched removals
    for (const [tagId, moneyforwardIds] of removalsByTag) {
      await unassignTags.mutateAsync({ tagId, moneyforwardIds });
    }

    // Refetch tags to update UI
    await refetchTags();
  };

  const years = Array.from({ length: 3 }, (_, i) => (now.getFullYear() - i).toString());
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">タグ別集計</h2>

      {/* Controls */}
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow">
        <div className="flex items-center gap-4">
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

        {/* View mode toggle */}
        <div className="flex items-center gap-2 rounded-lg border bg-gray-100 p-1">
          <button
            onClick={() => setViewMode('summary')}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'summary'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            集計ビュー
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'calendar'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            カレンダービュー
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-lg text-gray-600">読み込み中...</div>
        </div>
      ) : viewMode === 'calendar' ? (
        <>
          <CalendarView
            year={year}
            month={month}
            transactions={transactions}
            tags={tags}
            transactionTags={transactionTags}
            onDayClick={handleDayClick}
          />
          <DayTransactionModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            date={modalDate}
            transactions={modalTransactions}
            tags={tags}
            transactionTags={transactionTags}
            onSave={handleSaveTagChanges}
          />
        </>
      ) : tagSummary.length === 0 ? (
        <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow">
          タグ付きの取引がありません
        </div>
      ) : (
        <div className="rounded-lg bg-white shadow">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium">タグ</th>
                <th className="px-4 py-3 text-right font-medium">金額</th>
                <th className="px-4 py-3 text-right font-medium">件数</th>
              </tr>
            </thead>
            <tbody>
              {tagSummary.map(({ tag, transactions: taggedTxs, totalAmount }) => (
                <>
                  <tr
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className="cursor-pointer border-b hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`transform transition-transform ${expandedTags.has(tag.id) ? 'rotate-90' : ''}`}
                        >
                          ▶
                        </span>
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: tag.color || '#888' }}
                        />
                        <span className="font-medium">{tag.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      ¥{totalAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {taggedTxs.length}件
                    </td>
                  </tr>

                  {expandedTags.has(tag.id) && (
                    <tr key={`${tag.id}-details`}>
                      <td colSpan={3} className="bg-gray-50 px-4 py-2">
                        <div className="ml-6 space-y-1">
                          {taggedTxs
                            .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
                            .map((tx) => {
                              const category = categories.find((c) => c.id === tx.category_id);
                              return (
                                <div
                                  key={tx.id}
                                  className="flex items-center gap-4 rounded bg-white p-2 text-sm"
                                >
                                  <span className="w-24 text-gray-500">{tx.transaction_date}</span>
                                  <span className="flex-1 truncate">{tx.content}</span>
                                  <span className="text-gray-500">
                                    {category?.major_name}
                                  </span>
                                  <span className="w-28 text-right font-medium">
                                    ¥{Math.abs(tx.amount).toLocaleString()}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
