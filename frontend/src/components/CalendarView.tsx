import { useState, useMemo } from 'react';
import type { Transaction, Tag, TransactionTag } from '../lib/types';

interface CalendarViewProps {
  year: string;
  month: string;
  transactions: Transaction[];
  tags: Tag[];
  transactionTags: TransactionTag[];
  onDayClick: (date: string, dayTransactions: Transaction[]) => void;
}

export function CalendarView({
  year,
  month,
  transactions,
  onDayClick,
}: CalendarViewProps) {
  // Get calendar data
  const { days, startDay } = useMemo(() => {
    const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1);
    const lastDay = new Date(parseInt(year), parseInt(month), 0);
    const daysInMonth = lastDay.getDate();

    // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    // Convert to Monday start (0 = Monday, ..., 6 = Sunday)
    let startDay = firstDay.getDay() - 1;
    if (startDay === -1) startDay = 6;

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return { days, startDay };
  }, [year, month]);

  // Group transactions by date
  const transactionsByDate = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};

    transactions.forEach((tx) => {
      const date = tx.transaction_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(tx);
    });

    return grouped;
  }, [transactions]);

  // Calculate daily totals
  const getDayTotal = (day: number) => {
    const dateStr = `${year}-${month.padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTxs = transactionsByDate[dateStr] || [];
    return dayTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  };

  // Handle day click
  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${month.padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTxs = transactionsByDate[dateStr] || [];
    if (dayTxs.length > 0) {
      onDayClick(dateStr, dayTxs);
    }
  };

  const weekDays = ['月', '火', '水', '木', '金', '土', '日'];

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      {/* Calendar header */}
      <div className="grid grid-cols-7 border-b bg-gray-50">
        {weekDays.map((day) => (
          <div key={day} className="px-2 py-3 text-center text-sm font-medium text-gray-700">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {/* Empty cells for days before month start */}
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} className="border-b border-r bg-gray-50 p-2" />
        ))}

        {/* Days of the month */}
        {days.map((day) => {
          const total = getDayTotal(day);
          const dateStr = `${year}-${month.padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayTxs = transactionsByDate[dateStr] || [];
          const hasTransactions = dayTxs.length > 0;

          return (
            <div
              key={day}
              onClick={() => handleDayClick(day)}
              className={`min-h-[100px] border-b border-r p-2 ${
                hasTransactions ? 'cursor-pointer hover:bg-blue-50' : ''
              }`}
            >
              <div className="text-right text-sm font-medium text-gray-700">{day}</div>
              {hasTransactions && (
                <div className="mt-1 space-y-1">
                  <div className="text-xs text-gray-500">{dayTxs.length}件</div>
                  <div className="text-right text-sm font-semibold text-gray-900">
                    ¥{total.toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DayTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  transactions: Transaction[];
  tags: Tag[];
  transactionTags: TransactionTag[];
  onSave: (changes: { moneyforward_id: string; tag_ids: number[] }[]) => Promise<void>;
}

export function DayTransactionModal({
  isOpen,
  onClose,
  date,
  transactions,
  tags,
  transactionTags,
  onSave,
}: DayTransactionModalProps) {
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, Set<number>>
  >(new Map());
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  // Get tags for a transaction
  const getTransactionTags = (moneyforwardId: string): Set<number> => {
    if (pendingChanges.has(moneyforwardId)) {
      return pendingChanges.get(moneyforwardId)!;
    }
    const existingTags = transactionTags
      .filter((tt) => tt.moneyforward_id === moneyforwardId)
      .map((tt) => tt.tag_id);
    return new Set(existingTags);
  };

  // Toggle tag for a transaction
  const toggleTag = (moneyforwardId: string, tagId: number) => {
    const current = getTransactionTags(moneyforwardId);
    const next = new Set(current);

    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }

    const newChanges = new Map(pendingChanges);
    newChanges.set(moneyforwardId, next);
    setPendingChanges(newChanges);
  };

  // Save changes
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changes = Array.from(pendingChanges.entries()).map(([moneyforward_id, tag_ids]) => ({
        moneyforward_id,
        tag_ids: Array.from(tag_ids),
      }));

      await onSave(changes);
      setPendingChanges(new Map());
      onClose();
    } catch (error) {
      console.error('Failed to save tag changes:', error);
      alert('タグの保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = pendingChanges.size > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {date} の取引にタグを付ける
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={isSaving}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {transactions.length === 0 ? (
            <div className="py-8 text-center text-gray-500">取引がありません</div>
          ) : (
            <div className="space-y-4">
              {transactions.map((tx) => {
                const txTags = getTransactionTags(tx.moneyforward_id);
                return (
                  <div key={tx.id} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{tx.content}</div>
                        <div className="mt-1 text-sm text-gray-500">
                          {tx.transaction_date}
                        </div>
                      </div>
                      <div className="text-right font-semibold text-gray-900">
                        ¥{Math.abs(tx.amount).toLocaleString()}
                      </div>
                    </div>

                    {/* Tag selector */}
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => {
                        const isSelected = txTags.has(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tx.moneyforward_id, tag.id)}
                            className={`flex items-center gap-2 rounded px-3 py-1 text-sm transition-colors ${
                              isSelected
                                ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: tag.color || '#888' }}
                            />
                            <span>{tag.name}</span>
                            {isSelected && <span className="font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-gray-50 px-6 py-4">
          <div className="text-sm text-gray-600">
            {hasChanges ? `${pendingChanges.size}件の変更` : '変更なし'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="rounded bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? '保存中...' : 'タグの変更を保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
