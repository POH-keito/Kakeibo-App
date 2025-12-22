import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Legend, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useUsers, useMonthlySummary } from '../lib/api';

export const Route = createFileRoute('/comparison')({
  component: ComparisonPage,
});

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444'];

function ComparisonPage() {
  const { data: users = [] } = useUsers();

  // Get last 4 months
  const months = useMemo(() => {
    const result: { year: string; month: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push({
        year: date.getFullYear().toString(),
        month: (date.getMonth() + 1).toString().padStart(2, '0'),
        label: `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}`,
      });
    }
    return result.reverse();
  }, []);

  // Fetch summary data for all months
  const sum0 = useMonthlySummary(months[0]?.year || '', months[0]?.month || '', false);
  const sum1 = useMonthlySummary(months[1]?.year || '', months[1]?.month || '', false);
  const sum2 = useMonthlySummary(months[2]?.year || '', months[2]?.month || '', false);
  const sum3 = useMonthlySummary(months[3]?.year || '', months[3]?.month || '', false);

  const summaryQueries = [sum0, sum1, sum2, sum3];

  const isLoading = summaryQueries.some((q) => q.isLoading);
  const isError = summaryQueries.some((q) => q.isError);
  const errorMessage = summaryQueries.find((q) => q.error)?.error?.message;

  // Category totals from backend summary (already filtered for 按分_家計)
  const categoryByMonth = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};

    summaryQueries.forEach((query, idx) => {
      const summary = query.data;
      const monthLabel = months[idx].label;

      if (summary?.byCategory) {
        Object.entries(summary.byCategory).forEach(([majorName, amount]) => {
          if (!result[majorName]) {
            result[majorName] = {};
          }
          result[majorName][monthLabel] = amount;
        });
      }
    });

    return result;
  }, [summaryQueries, months]);

  // Cost type totals from backend summary
  const costTypeByMonth = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};

    summaryQueries.forEach((query, idx) => {
      const summary = query.data;
      const monthLabel = months[idx].label;

      if (summary?.byCostType) {
        Object.entries(summary.byCostType).forEach(([costType, amount]) => {
          if (!result[costType]) {
            result[costType] = {};
          }
          result[costType][monthLabel] = amount;
        });
      }
    });

    return result;
  }, [summaryQueries, months]);

  // User shares by month
  const userSharesByMonth = useMemo(() => {
    const result: Record<number, Record<string, number>> = {};

    summaryQueries.forEach((query, idx) => {
      const summary = query.data;
      const monthLabel = months[idx].label;

      if (summary?.userShares) {
        Object.entries(summary.userShares).forEach(([userIdStr, amount]) => {
          const userId = Number(userIdStr);
          if (!result[userId]) {
            result[userId] = {};
          }
          result[userId][monthLabel] = amount;
        });
      }
    });

    return result;
  }, [summaryQueries, months]);

  // Transform data for line chart
  const lineChartData = useMemo(() => {
    return months.map(m => ({
      month: m.label,
      ...Object.fromEntries(
        users.map(u => [
          u.aliases[0] || u.name,
          userSharesByMonth[u.id]?.[m.label] || 0
        ])
      )
    }));
  }, [months, users, userSharesByMonth]);

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-lg text-red-600">
          データの取得に失敗しました: {errorMessage || '不明なエラー'}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-lg text-gray-600">読み込み中...</div>
      </div>
    );
  }

  // Calculate month-over-month change
  const getChange = (current: number, previous: number) => {
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">月次比較</h2>
          <p className="mt-1 text-sm text-gray-500">過去4ヶ月の支出推移を比較</p>
        </div>
      </div>

      {/* Category Comparison Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-6 py-4">
          <h3 className="text-lg font-bold tracking-tight text-gray-900">カテゴリ別月次推移</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">カテゴリ</th>
                {months.map((m) => (
                  <th key={m.label} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {Object.entries(categoryByMonth)
                .sort(([, a], [, b]) => {
                  const totalA = Object.values(a).reduce((sum, v) => sum + v, 0);
                  const totalB = Object.values(b).reduce((sum, v) => sum + v, 0);
                  return totalB - totalA;
                })
                .map(([majorName, monthData]) => (
                  <tr key={majorName} className="transition-colors hover:bg-blue-50/30">
                    <td className="px-6 py-3">
                      <span className="font-medium text-gray-900">{majorName}</span>
                    </td>
                    {months.map((m, mIdx) => {
                      const amount = monthData[m.label] || 0;
                      const prevAmount = mIdx > 0 ? (monthData[months[mIdx - 1].label] || 0) : 0;
                      const change = mIdx > 0 ? getChange(amount, prevAmount) : null;

                      return (
                        <td key={m.label} className="px-4 py-3 text-right">
                          <div className="font-medium text-gray-900">¥{amount.toLocaleString()}</div>
                          {change !== null && (
                            <div className={`text-xs ${change > 0 ? 'text-red-500' : change < 0 ? 'text-green-500' : 'text-gray-400'}`}>
                              {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change).toFixed(0)}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Type Comparison - Visual Bars */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-6 py-4">
          <h3 className="text-lg font-bold tracking-tight text-gray-900">固定費 vs 変動費</h3>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            {months.map((m) => {
              const fixed = costTypeByMonth['固定']?.[m.label] || 0;
              const variable = costTypeByMonth['変動']?.[m.label] || 0;
              const total = fixed + variable;
              const fixedPercent = total > 0 ? (fixed / total) * 100 : 0;
              const variablePercent = total > 0 ? (variable / total) * 100 : 0;

              return (
                <div key={m.label} className="group">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{m.label}</span>
                    <span className="text-sm font-bold text-gray-900">¥{total.toLocaleString()}</span>
                  </div>
                  <div className="flex h-10 w-full overflow-hidden rounded-xl bg-gray-100">
                    <div
                      className="flex items-center justify-center bg-gradient-to-r from-blue-500 to-blue-600 text-xs font-medium text-white transition-all duration-300 group-hover:from-blue-600 group-hover:to-blue-700"
                      style={{ width: `${fixedPercent}%` }}
                    >
                      {fixedPercent > 15 && (
                        <span className="drop-shadow">¥{fixed.toLocaleString()}</span>
                      )}
                    </div>
                    <div
                      className="flex items-center justify-center bg-gradient-to-r from-emerald-500 to-emerald-600 text-xs font-medium text-white transition-all duration-300 group-hover:from-emerald-600 group-hover:to-emerald-700"
                      style={{ width: `${variablePercent}%` }}
                    >
                      {variablePercent > 15 && (
                        <span className="drop-shadow">¥{variable.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 flex gap-6 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-gradient-to-r from-blue-500 to-blue-600" />
              <span className="text-sm font-medium text-gray-600">固定費</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-gradient-to-r from-emerald-500 to-emerald-600" />
              <span className="text-sm font-medium text-gray-600">変動費</span>
            </div>
          </div>
        </div>
      </div>

      {/* User Shares Chart */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-6 py-4">
          <h3 className="text-lg font-bold tracking-tight text-gray-900">ユーザー別負担推移</h3>
        </div>
        <div className="p-6">
          {/* Line Chart */}
          <div className="mb-8 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `¥${(v/1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v) => `¥${Number(v).toLocaleString()}`}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                {users.map((user, idx) => (
                  <Line
                    key={user.id}
                    type="monotone"
                    dataKey={user.aliases[0] || user.name}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">ユーザー</th>
                  {months.map((m) => (
                    <th key={m.label} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user, idx) => (
                  <tr key={user.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                        />
                        <span className="font-medium text-gray-900">{user.aliases[0] || user.name}</span>
                      </div>
                    </td>
                    {months.map((m) => (
                      <td key={m.label} className="px-4 py-3 text-right font-medium text-gray-900">
                        ¥{(userSharesByMonth[user.id]?.[m.label] || 0).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
