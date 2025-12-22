import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useTags, useTransactions, useTransactionTags, useCategories, useAssignTags, useUnassignTags, useCreateTag, useUpdateTag, useDeleteTag } from '../lib/api';
import { CalendarView, DayTransactionModal } from '../components/CalendarView';
import type { Transaction } from '../lib/types';

export const Route = createFileRoute('/tags')({
  component: TagsPage,
});

type ViewMode = 'summary' | 'calendar' | 'bulk' | 'manage';

function TagsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [expandedTags, setExpandedTags] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [modalTransactions, setModalTransactions] = useState<Transaction[]>([]);

  // Bulk tagging state
  const [bulkTagId, setBulkTagId] = useState<number | null>(null);
  const [bulkIds, setBulkIds] = useState('');
  const [bulkResult, setBulkResult] = useState<{ success: number; error: string | null } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Tag management state
  const [newTagName, setNewTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: tags = [], refetch: refetchTagsList } = useTags();
  const { data: transactions = [], isLoading } = useTransactions(year, month, true);
  const { data: categories = [] } = useCategories();

  const moneyforwardIds = transactions.map((tx) => tx.moneyforward_id);
  const { data: transactionTags = [], refetch: refetchTags } = useTransactionTags(moneyforwardIds);

  // Mutations
  const assignTags = useAssignTags();
  const unassignTags = useUnassignTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

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

  const handleBulkTag = async () => {
    if (!bulkTagId || !bulkIds.trim()) {
      setBulkResult({ success: 0, error: 'タグとIDを入力してください' });
      return;
    }

    setBulkLoading(true);
    setBulkResult(null);

    try {
      // Parse IDs (one per line, trim whitespace)
      const moneyforwardIds = bulkIds
        .split('\n')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (moneyforwardIds.length === 0) {
        setBulkResult({ success: 0, error: 'IDが入力されていません' });
        setBulkLoading(false);
        return;
      }

      await assignTags.mutateAsync({ tagId: bulkTagId, moneyforwardIds });
      setBulkResult({ success: moneyforwardIds.length, error: null });
      setBulkIds(''); // Clear input on success
    } catch (err) {
      setBulkResult({ success: 0, error: err instanceof Error ? err.message : '不明なエラー' });
    } finally {
      setBulkLoading(false);
    }
  };

  // Tag management handlers
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await createTag.mutateAsync({ name: newTagName.trim() });
      setNewTagName('');
      refetchTagsList();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'タグの作成に失敗しました');
    }
  };

  const handleUpdateTag = async (id: number) => {
    if (!editingTagName.trim()) return;
    try {
      await updateTag.mutateAsync({ id, name: editingTagName.trim() });
      setEditingTagId(null);
      setEditingTagName('');
      refetchTagsList();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'タグの更新に失敗しました');
    }
  };

  const handleDeleteTag = async (id: number) => {
    try {
      await deleteTag.mutateAsync(id);
      setDeleteConfirmId(null);
      refetchTagsList();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'タグの削除に失敗しました');
    }
  };

  const startEditing = (tag: { id: number; name: string }) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
  };

  const cancelEditing = () => {
    setEditingTagId(null);
    setEditingTagName('');
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
          <button
            onClick={() => setViewMode('bulk')}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'bulk'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            一括タグ付け
          </button>
          <button
            onClick={() => setViewMode('manage')}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'manage'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            タグの編集
          </button>
        </div>
      </div>

      {isLoading && viewMode !== 'bulk' ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-lg text-gray-600">読み込み中...</div>
        </div>
      ) : viewMode === 'bulk' ? (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">一括タグ付け</h3>
          <p className="mb-4 text-sm text-gray-600">
            MoneyForward IDを1行に1つずつ入力して、選択したタグを一括で付与します。
          </p>

          <div className="space-y-4">
            {/* Tag selection */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                タグを選択
              </label>
              <select
                value={bulkTagId ?? ''}
                onChange={(e) => setBulkTagId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded border px-3 py-2"
              >
                <option value="">-- タグを選択 --</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>

            {/* ID input textarea */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                MoneyForward ID（1行1ID）
              </label>
              <textarea
                value={bulkIds}
                onChange={(e) => setBulkIds(e.target.value)}
                placeholder="ABC123...&#10;DEF456...&#10;GHI789..."
                rows={10}
                className="w-full rounded border px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                {bulkIds.split('\n').filter((id) => id.trim()).length} 件のIDが入力されています
              </p>
            </div>

            {/* Submit button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleBulkTag}
                disabled={bulkLoading || !bulkTagId || !bulkIds.trim()}
                className="rounded bg-green-600 px-6 py-2 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {bulkLoading ? '処理中...' : '一括付与'}
              </button>

              {/* Result feedback */}
              {bulkResult && (
                <div
                  className={`rounded px-4 py-2 text-sm ${
                    bulkResult.error
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {bulkResult.error
                    ? `エラー: ${bulkResult.error}`
                    : `${bulkResult.success} 件にタグを付与しました`}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : viewMode === 'manage' ? (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">タグの編集</h3>

          {/* New tag form */}
          <div className="mb-6 flex gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
              placeholder="新しいタグ名を入力..."
              className="flex-1 rounded border px-3 py-2"
            />
            <button
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || createTag.isPending}
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {createTag.isPending ? '作成中...' : '作成'}
            </button>
          </div>

          {/* Tag list */}
          <div className="space-y-2">
            {tags.length === 0 ? (
              <p className="text-center text-gray-500 py-4">タグがありません</p>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-3 rounded border p-3 hover:bg-gray-50"
                >
                  {editingTagId === tag.id ? (
                    <>
                      <input
                        type="text"
                        value={editingTagName}
                        onChange={(e) => setEditingTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateTag(tag.id);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="flex-1 rounded border px-3 py-1"
                        autoFocus
                      />
                      <button
                        onClick={() => handleUpdateTag(tag.id)}
                        disabled={updateTag.isPending}
                        className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                      >
                        保存
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="rounded border px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
                      >
                        キャンセル
                      </button>
                    </>
                  ) : deleteConfirmId === tag.id ? (
                    <>
                      <span className="flex-1 text-red-600">
                        「{tag.name}」を削除しますか？
                      </span>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        disabled={deleteTag.isPending}
                        className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                      >
                        {deleteTag.isPending ? '削除中...' : '削除'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded border px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: tag.color || '#888' }}
                      />
                      <span className="flex-1 font-medium">{tag.name}</span>
                      <button
                        onClick={() => startEditing(tag)}
                        className="rounded border px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(tag.id)}
                        className="rounded border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
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
