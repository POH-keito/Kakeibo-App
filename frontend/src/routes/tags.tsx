import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useTags, useTransactions, useTransactionTags, useCategories } from '../lib/api';

export const Route = createFileRoute('/tags')({
  component: TagsPage,
});

function TagsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [expandedTags, setExpandedTags] = useState<Set<number>>(new Set());

  const { data: tags = [] } = useTags();
  const { data: transactions = [], isLoading } = useTransactions(year, month, true);
  const { data: categories = [] } = useCategories();

  const transactionIds = transactions.map((tx) => tx.id);
  const { data: transactionTags = [] } = useTransactionTags(transactionIds);

  // Group transactions by tag
  const tagSummary = useMemo(() => {
    const summary: Record<number, { tag: typeof tags[0]; transactions: typeof transactions; totalAmount: number }> = {};

    // Initialize with all tags
    tags.forEach((tag) => {
      summary[tag.id] = { tag, transactions: [], totalAmount: 0 };
    });

    // Group transactions
    transactionTags.forEach((tt) => {
      const transaction = transactions.find((tx) => tx.id === tt.transaction_id);
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

  const years = Array.from({ length: 3 }, (_, i) => (now.getFullYear() - i).toString());
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">タグ別集計</h2>

      {/* Controls */}
      <div className="flex items-center gap-4 rounded-lg bg-white p-4 shadow">
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

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-lg text-gray-600">読み込み中...</div>
        </div>
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
