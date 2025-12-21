import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '../lib/api';
import type { Tag } from '../lib/types';

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
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].value);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [error, setError] = useState<string | null>(null);

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

      {/* Additional Settings Placeholder */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold">その他の設定</h3>
        <p className="text-gray-600">
          カテゴリ編集、按分比率のデフォルト設定などは今後追加予定です。
        </p>
      </div>
    </div>
  );
}
