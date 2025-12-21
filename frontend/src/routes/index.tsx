import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import {
  useTransactions,
  useCategories,
  useUsers,
  useMonthlySummary,
  useBurdenRatio,
  useMonthlyMemo,
  useSaveMonthlyMemo,
  calculateCostTypeSummary,
  calculateCategorySummary,
} from '../lib/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

export const Route = createFileRoute('/')({
  component: DashboardPage,
});

// Color palette for pie chart
const COLORS = [
  '#2b6cb0', // Blue
  '#4299e1', // Light Blue
  '#2f855a', // Green
  '#e53e3e', // Red
  '#d69e2e', // Yellow
  '#805ad5', // Purple
  '#38b2ac', // Teal
  '#ed8936', // Orange
  '#dd6b20', // Dark Orange
  '#718096', // Gray
];

function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [includeTagged, setIncludeTagged] = useState(false);

  const targetMonth = `${year}-${month}`;

  const { data: transactions = [], isLoading: txLoading } = useTransactions(year, month, includeTagged);
  const { data: categories = [] } = useCategories();
  const { data: users = [] } = useUsers();
  const { data: summary } = useMonthlySummary(year, month, includeTagged);
  const { data: burdenRatio } = useBurdenRatio(year, month);
  const { data: memo } = useMonthlyMemo(targetMonth);
  const saveMemo = useSaveMonthlyMemo();

  const [memoContent, setMemoContent] = useState('');
  const [memoSaveStatus, setMemoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Sync memo content when loaded
  useMemo(() => {
    if (memo?.memo_content !== undefined) {
      setMemoContent(memo.memo_content);
    }
  }, [memo?.memo_content]);

  // Category summary for pie chart
  const categorySummary = useMemo(
    () => calculateCategorySummary(transactions, categories),
    [transactions, categories]
  );

  // Cost type breakdown
  const costTypeSummary = useMemo(
    () => calculateCostTypeSummary(transactions, categories),
    [transactions, categories]
  );

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

  const handleSaveMemo = async () => {
    setMemoSaveStatus('saving');
    try {
      await saveMemo.mutateAsync({ targetMonth, content: memoContent });
      setMemoSaveStatus('saved');
      setTimeout(() => setMemoSaveStatus('idle'), 2000);
    } catch {
      setMemoSaveStatus('error');
    }
  };

  const years = Array.from({ length: 3 }, (_, i) => (now.getFullYear() - i).toString());
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-4 shadow">
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
            checked={includeTagged}
            onChange={(e) => setIncludeTagged(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">タグ付き取引を含める</span>
        </label>

        {ratioDisplay && (
          <div className="ml-auto text-sm text-gray-600">
            今月のデフォルト按分: {ratioDisplay}
          </div>
        )}
      </div>

      {txLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-lg text-gray-600">読み込み中...</div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              title="総支出"
              amount={summary?.totalSpending || 0}
              className="bg-blue-50"
            />
            {users.map((user) => (
              <SummaryCard
                key={user.id}
                title={user.aliases[0] || user.name}
                amount={summary?.userShares[user.id] || 0}
              />
            ))}
          </div>

          {/* Category Pie Chart & Cost Type Breakdown */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Category Summary */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold">カテゴリ別支出</h3>
              <div className="space-y-2">
                {Object.entries(categorySummary)
                  .sort(([, a], [, b]) => b.amount - a.amount)
                  .map(([majorName, data]) => (
                    <div key={majorName} className="flex justify-between border-b py-2">
                      <span>{majorName}</span>
                      <span className="font-medium">
                        ¥{data.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Cost Type Breakdown */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold">コストタイプ別内訳</h3>
              <CostTypeTree data={costTypeSummary} />
            </div>
          </div>

          {/* Monthly Memo */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">月次メモ</h3>
              <div className="flex items-center gap-2">
                {memoSaveStatus === 'saving' && (
                  <span className="text-sm text-gray-500">保存中...</span>
                )}
                {memoSaveStatus === 'saved' && (
                  <span className="text-sm text-green-600">保存完了</span>
                )}
                {memoSaveStatus === 'error' && (
                  <span className="text-sm text-red-600">エラー</span>
                )}
                <button
                  onClick={handleSaveMemo}
                  disabled={memoSaveStatus === 'saving'}
                  className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
            <textarea
              value={memoContent}
              onChange={(e) => setMemoContent(e.target.value)}
              placeholder="この月のメモを入力..."
              className="h-32 w-full rounded border p-3"
            />
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  amount,
  className = '',
}: {
  title: string;
  amount: number;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-white p-6 shadow ${className}`}>
      <h3 className="text-sm font-medium text-gray-600">{title}</h3>
      <p className="mt-2 text-2xl font-bold">¥{amount.toLocaleString()}</p>
    </div>
  );
}

function CostTypeTree({
  data,
}: {
  data: Record<string, { amount: number; majors: Record<string, { amount: number; minors: Record<string, number> }> }>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpanded(next);
  };

  return (
    <div className="space-y-1">
      {Object.entries(data)
        .sort(([, a], [, b]) => b.amount - a.amount)
        .map(([costType, costTypeData]) => (
          <div key={costType}>
            <button
              onClick={() => toggle(costType)}
              className="flex w-full justify-between rounded px-2 py-1 text-left hover:bg-gray-100"
            >
              <span className="font-medium">{costType}</span>
              <span>¥{costTypeData.amount.toLocaleString()}</span>
            </button>

            {expanded.has(costType) && (
              <div className="ml-4 border-l-2 border-gray-200 pl-2">
                {Object.entries(costTypeData.majors)
                  .sort(([, a], [, b]) => b.amount - a.amount)
                  .map(([majorName, majorData]) => (
                    <div key={majorName}>
                      <button
                        onClick={() => toggle(`${costType}-${majorName}`)}
                        className="flex w-full justify-between rounded px-2 py-1 text-left text-sm hover:bg-gray-50"
                      >
                        <span>{majorName}</span>
                        <span>¥{majorData.amount.toLocaleString()}</span>
                      </button>

                      {expanded.has(`${costType}-${majorName}`) && (
                        <div className="ml-4 border-l border-gray-100 pl-2">
                          {Object.entries(majorData.minors)
                            .sort(([, a], [, b]) => b - a)
                            .map(([minorName, amount]) => (
                              <div
                                key={minorName}
                                className="flex justify-between px-2 py-0.5 text-xs text-gray-600"
                              >
                                <span>{minorName}</span>
                                <span>¥{amount.toLocaleString()}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
