import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useBurdenRatios,
  useCreateBurdenRatio,
  useUpdateBurdenRatio,
  useDeleteBurdenRatio,
  useUsers,
  useAssignTags,
} from '../lib/api';
import type { Tag, BurdenRatio } from '../lib/types';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

const TAG_COLORS = [
  { value: '#ef4444', label: '赤' },
  { value: '#f97316', label: 'オレンジ' },
  { value: '#eab308', label: '黄' },
  { value: '#22c55e', label: '緑' },
  { value: '#14b8a6', label: 'ティール' },
  { value: '#3b82f6', label: '青' },
  { value: '#8b5cf6', label: '紫' },
  { value: '#ec4899', label: 'ピンク' },
  { value: '#6b7280', label: 'グレー' },
];

function SettingsPage() {
  const { data: tags = [], isLoading } = useTags();
  const assignTags = useAssignTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const { data: burdenRatios = [], isLoading: ratiosLoading } = useBurdenRatios();
  const createBurdenRatio = useCreateBurdenRatio();
  const updateBurdenRatio = useUpdateBurdenRatio();
  const deleteBurdenRatio = useDeleteBurdenRatio();
  const { data: users = [] } = useUsers();

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].value);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Bulk tagging state
  const [bulkTagId, setBulkTagId] = useState<number | null>(null);
  const [bulkIds, setBulkIds] = useState('');
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [bulkMessage, setBulkMessage] = useState('');

  // Burden ratio state
  const [isCreatingRatio, setIsCreatingRatio] = useState(false);
  const [editingRatio, setEditingRatio] = useState<BurdenRatio | null>(null);
  const [newMonth, setNewMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [ratioPercentages, setRatioPercentages] = useState<Record<number, number>>({});
  const [ratioError, setRatioError] = useState<string | null>(null);

  // Handle create tag
  const handleCreate = useCallback(async () => {
    if (!newTagName.trim()) {
      setError('タグ名を入力してください');
      return;
    }

    try {
      await createTag.mutateAsync({ name: newTagName.trim(), color: newTagColor });
      setNewTagName('');
      setNewTagColor(TAG_COLORS[0].value);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タグの作成に失敗しました');
    }
  }, [newTagName, newTagColor, createTag]);

  // Start editing
  const handleEditStart = useCallback((tag: Tag) => {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color || TAG_COLORS[0].value);
    setError(null);
  }, []);

  // Cancel editing
  const handleEditCancel = useCallback(() => {
    setEditingTag(null);
    setEditName('');
    setEditColor('');
    setError(null);
  }, []);

  // Save edit
  const handleEditSave = useCallback(async () => {
    if (!editingTag) return;

    if (!editName.trim()) {
      setError('タグ名を入力してください');
      return;
    }

    try {
      await updateTag.mutateAsync({
        id: editingTag.id,
        name: editName.trim(),
        color: editColor,
      });
      setEditingTag(null);
      setEditName('');
      setEditColor('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タグの更新に失敗しました');
    }
  }, [editingTag, editName, editColor, updateTag]);

  // Handle delete
  const handleDelete = useCallback(
    async (tag: Tag) => {
      if (!window.confirm(`タグ「${tag.name}」を削除しますか？\n紐づいている取引からもタグが外れます。`)) {
        return;
      }

      try {
        await deleteTag.mutateAsync(tag.id);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'タグの削除に失敗しました');
      }
    },
    [deleteTag]
  );

  // Burden ratio handlers
  const initializeRatioPercentages = useCallback((ratio?: BurdenRatio) => {
    const percentages: Record<number, number> = {};
    if (ratio?.details) {
      ratio.details.forEach((detail) => {
        percentages[detail.user_id] = detail.ratio_percent;
      });
    } else {
      // Default: equal split
      const defaultPercent = users.length > 0 ? Math.floor(100 / users.length) : 0;
      users.forEach((user) => {
        percentages[user.id] = defaultPercent;
      });
    }
    setRatioPercentages(percentages);
  }, [users]);

  const handleCreateRatioStart = useCallback(() => {
    setIsCreatingRatio(true);
    setEditingRatio(null);
    initializeRatioPercentages();
    setRatioError(null);
  }, [initializeRatioPercentages]);

  const handleEditRatioStart = useCallback((ratio: BurdenRatio) => {
    setEditingRatio(ratio);
    setIsCreatingRatio(false);
    initializeRatioPercentages(ratio);
    setRatioError(null);
  }, [initializeRatioPercentages]);

  const handleRatioCancel = useCallback(() => {
    setIsCreatingRatio(false);
    setEditingRatio(null);
    setRatioPercentages({});
    setRatioError(null);
  }, []);

  const handleRatioSave = useCallback(async () => {
    // Validate total equals 100%
    const total = Object.values(ratioPercentages).reduce((sum, val) => sum + val, 0);
    if (Math.abs(total - 100) > 0.01) {
      setRatioError('合計が100%である必要があります');
      return;
    }

    const details = Object.entries(ratioPercentages).map(([userId, percent]) => ({
      user_id: parseInt(userId),
      ratio_percent: percent,
    }));

    try {
      if (editingRatio) {
        await updateBurdenRatio.mutateAsync({ id: editingRatio.id, details });
      } else {
        await createBurdenRatio.mutateAsync({ effectiveMonth: newMonth, details });
      }
      handleRatioCancel();
    } catch (err) {
      setRatioError(err instanceof Error ? err.message : '按分比率の保存に失敗しました');
    }
  }, [ratioPercentages, editingRatio, newMonth, createBurdenRatio, updateBurdenRatio, handleRatioCancel]);

  const handleRatioDelete = useCallback(async (ratio: BurdenRatio) => {
    if (!window.confirm(`${ratio.effective_month}の按分比率を削除しますか？`)) {
      return;
    }

    try {
      await deleteBurdenRatio.mutateAsync(ratio.id);
      setRatioError(null);
    } catch (err) {
      setRatioError(err instanceof Error ? err.message : '按分比率の削除に失敗しました');
    }
  }, [deleteBurdenRatio]);

  const handleCopyFromPrevious = useCallback(() => {
    if (burdenRatios.length === 0) return;

    // Get the most recent ratio
    const latest = burdenRatios[0];
    initializeRatioPercentages(latest);
  }, [burdenRatios, initializeRatioPercentages]);

  const updateRatioPercent = useCallback((userId: number, value: string) => {
    const percent = parseFloat(value) || 0;
    setRatioPercentages((prev) => ({ ...prev, [userId]: percent }));
  }, []);

  const getTotalPercent = useCallback(() => {
    return Object.values(ratioPercentages).reduce((sum, val) => sum + val, 0);
  }, [ratioPercentages]);

  const formatRatioSummary = useCallback((ratio: BurdenRatio) => {
    return ratio.details
      .map((detail) => {
        const user = users.find((u) => u.id === detail.user_id);
        const alias = user?.aliases[0] || user?.name || `User ${detail.user_id}`;
        return `${alias} ${detail.ratio_percent}%`;
      })
      .join(' / ');
  }, [users]);

  // Bulk tagging handler
  const handleBulkTag = useCallback(async () => {
    if (!bulkTagId) {
      setBulkStatus('error');
      setBulkMessage('タグを選択してください');
      return;
    }

    if (!bulkIds.trim()) {
      setBulkStatus('error');
      setBulkMessage('MoneyForward IDを入力してください');
      return;
    }

    const ids = bulkIds
      .split('\n')
      .map((id) => id.trim())
      .filter((id) => id);

    if (ids.length === 0) {
      setBulkStatus('error');
      setBulkMessage('有効なIDが入力されていません');
      return;
    }

    setBulkStatus('loading');
    setBulkMessage('');

    try {
      await assignTags.mutateAsync({ tagId: bulkTagId, moneyforwardIds: ids });

      setBulkStatus('success');
      setBulkMessage(`${ids.length}件の取引にタグを付与しました`);
      setBulkIds('');
      setBulkTagId(null);
    } catch (err) {
      setBulkStatus('error');
      setBulkMessage(err instanceof Error ? err.message : 'タグの一括付与に失敗しました');
    }
  }, [bulkTagId, bulkIds, assignTags]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">設定</h2>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-600">{error}</div>
      )}

      {/* Tag Management */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold">タグ管理</h3>

        {/* Add New Tag */}
        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <h4 className="mb-3 text-sm font-medium text-gray-700">新規タグ作成</h4>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-48">
              <label className="block text-sm text-gray-600 mb-1">タグ名</label>
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="タグ名を入力"
                className="w-full rounded border px-3 py-2"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">色</label>
              <select
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="rounded border px-3 py-2"
              >
                {TAG_COLORS.map((color) => (
                  <option key={color.value} value={color.value}>
                    {color.label}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="w-8 h-8 rounded"
              style={{ backgroundColor: newTagColor }}
            />
            <button
              onClick={handleCreate}
              disabled={createTag.isPending}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createTag.isPending ? '作成中...' : '作成'}
            </button>
          </div>
        </div>

        {/* Tag List */}
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="text-gray-600">読み込み中...</div>
          </div>
        ) : tags.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <div className="text-gray-500">タグがありません</div>
          </div>
        ) : (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-4 rounded-lg border p-3"
              >
                {editingTag?.id === tag.id ? (
                  // Edit mode
                  <>
                    <div
                      className="w-6 h-6 rounded flex-shrink-0"
                      style={{ backgroundColor: editColor }}
                    />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 rounded border px-2 py-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave();
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                    />
                    <select
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="rounded border px-2 py-1"
                    >
                      {TAG_COLORS.map((color) => (
                        <option key={color.value} value={color.value}>
                          {color.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleEditSave}
                      disabled={updateTag.isPending}
                      className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      保存
                    </button>
                    <button
                      onClick={handleEditCancel}
                      className="rounded bg-gray-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
                    >
                      キャンセル
                    </button>
                  </>
                ) : (
                  // View mode
                  <>
                    <div
                      className="w-6 h-6 rounded flex-shrink-0"
                      style={{ backgroundColor: tag.color || '#6b7280' }}
                    />
                    <span className="flex-1 font-medium">{tag.name}</span>
                    <button
                      onClick={() => handleEditStart(tag)}
                      className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(tag)}
                      disabled={deleteTag.isPending}
                      className="rounded bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200 disabled:opacity-50"
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Burden Ratio Management */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold">按分比率設定</h3>

        {ratioError && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-600">{ratioError}</div>
        )}

        {/* Create/Edit Form */}
        {(isCreatingRatio || editingRatio) && (
          <div className="mb-6 rounded-lg bg-gray-50 p-4">
            <h4 className="mb-3 text-sm font-medium text-gray-700">
              {editingRatio ? `${editingRatio.effective_month}の按分比率を編集` : '新規按分比率作成'}
            </h4>

            {!editingRatio && (
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">対象月</label>
                <input
                  type="month"
                  value={newMonth}
                  onChange={(e) => setNewMonth(e.target.value)}
                  className="rounded border px-3 py-2"
                />
              </div>
            )}

            <div className="space-y-3 mb-4">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-4">
                  <label className="w-24 text-sm font-medium">
                    {user.aliases[0] || user.name}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={ratioPercentages[user.id] || 0}
                    onChange={(e) => updateRatioPercent(user.id, e.target.value)}
                    className="w-24 rounded border px-3 py-2 text-right"
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-2 border-t">
                <span className="w-24 text-sm font-semibold">合計</span>
                <span
                  className={`w-24 text-right font-semibold ${
                    Math.abs(getTotalPercent() - 100) < 0.01 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {getTotalPercent().toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleRatioSave}
                disabled={createBurdenRatio.isPending || updateBurdenRatio.isPending}
                className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {createBurdenRatio.isPending || updateBurdenRatio.isPending
                  ? '保存中...'
                  : '保存'}
              </button>
              <button
                onClick={handleRatioCancel}
                className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
              >
                キャンセル
              </button>
              {!editingRatio && burdenRatios.length > 0 && (
                <button
                  onClick={handleCopyFromPrevious}
                  className="rounded bg-blue-100 px-4 py-2 text-blue-700 hover:bg-blue-200"
                >
                  前月からコピー
                </button>
              )}
            </div>
          </div>
        )}

        {/* Create Button */}
        {!isCreatingRatio && !editingRatio && (
          <button
            onClick={handleCreateRatioStart}
            className="mb-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            新規作成
          </button>
        )}

        {/* Burden Ratio List */}
        {ratiosLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="text-gray-600">読み込み中...</div>
          </div>
        ) : burdenRatios.length === 0 && !isCreatingRatio ? (
          <div className="flex h-32 items-center justify-center">
            <div className="text-gray-500">按分比率が設定されていません</div>
          </div>
        ) : (
          <div className="space-y-2">
            {burdenRatios.map((ratio) => (
              <div
                key={ratio.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <div className="font-medium">{ratio.effective_month}</div>
                  <div className="text-sm text-gray-600">{formatRatioSummary(ratio)}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditRatioStart(ratio)}
                    className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleRatioDelete(ratio)}
                    disabled={deleteBurdenRatio.isPending}
                    className="rounded bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Tagging Section */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold">一括タグ付け</h3>
        <p className="mb-4 text-sm text-gray-600">
          MoneyForward IDを1行に1つずつ入力し、選択したタグを一括で付与します。
        </p>

        {/* Status Message */}
        {bulkMessage && (
          <div
            className={`mb-4 rounded-lg p-4 ${
              bulkStatus === 'success'
                ? 'bg-green-50 text-green-700'
                : bulkStatus === 'error'
                ? 'bg-red-50 text-red-700'
                : ''
            }`}
          >
            {bulkMessage}
          </div>
        )}

        <div className="space-y-4">
          {/* Tag Selection */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              タグを選択
            </label>
            <select
              value={bulkTagId ?? ''}
              onChange={(e) => setBulkTagId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded border px-3 py-2"
              disabled={bulkStatus === 'loading'}
            >
              <option value="">-- タグを選択 --</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>

          {/* ID List */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              MoneyForward ID リスト
            </label>
            <textarea
              rows={10}
              placeholder={'IDを1行に1つずつ入力\n例:\nabc123...\ndef456...'}
              value={bulkIds}
              onChange={(e) => setBulkIds(e.target.value)}
              className="w-full rounded border px-3 py-2 font-mono text-sm"
              disabled={bulkStatus === 'loading'}
            />
            <p className="mt-1 text-xs text-gray-500">
              {bulkIds.split('\n').filter((id) => id.trim()).length}件のID
            </p>
          </div>

          {/* Execute Button */}
          <button
            onClick={handleBulkTag}
            disabled={bulkStatus === 'loading'}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {bulkStatus === 'loading' ? '処理中...' : 'タグを一括付与'}
          </button>
        </div>
      </div>
    </div>
  );
}
