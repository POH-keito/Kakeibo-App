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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">月次比較</h2>

      {/* Category Comparison Table */}
      <div className="overflow-x-auto rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold">カテゴリ別月次推移</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-2 text-left">カテゴリ</th>
              {months.map((m) => (
                <th key={m.label} className="px-4 py-2 text-right">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(categoryByMonth)
              .sort(([, a], [, b]) => {
                const totalA = Object.values(a).reduce((sum, v) => sum + v, 0);
                const totalB = Object.values(b).reduce((sum, v) => sum + v, 0);
                return totalB - totalA;
              })
              .map(([majorName, monthData]) => (
                <tr key={majorName} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{majorName}</td>
                  {months.map((m) => (
                    <td key={m.label} className="px-4 py-2 text-right">
                      ¥{(monthData[m.label] || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Cost Type Chart (Stacked Bar representation) */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold">固定費 vs 変動費</h3>
        <div className="space-y-4">
          {months.map((m) => {
            const fixed = costTypeByMonth['固定']?.[m.label] || 0;
            const variable = costTypeByMonth['変動']?.[m.label] || 0;
            const total = fixed + variable;
            const fixedPercent = total > 0 ? (fixed / total) * 100 : 0;
            const variablePercent = total > 0 ? (variable / total) * 100 : 0;

            return (
              <div key={m.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{m.label}</span>
                  <span>¥{total.toLocaleString()}</span>
                </div>
                <div className="flex h-8 w-full overflow-hidden rounded">
                  <div
                    className="flex items-center justify-center bg-blue-500 text-xs text-white"
                    style={{ width: `${fixedPercent}%` }}
                  >
                    {fixedPercent > 10 && `固定 ¥${fixed.toLocaleString()}`}
                  </div>
                  <div
                    className="flex items-center justify-center bg-green-500 text-xs text-white"
                    style={{ width: `${variablePercent}%` }}
                  >
                    {variablePercent > 10 && `変動 ¥${variable.toLocaleString()}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-4 text-sm">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-blue-500" />
            <span>固定費</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-green-500" />
            <span>変動費</span>
          </div>
        </div>
      </div>

      {/* User Shares Chart */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold">ユーザー別負担推移</h3>

        {/* Line Chart */}
        <div className="mb-8 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => `¥${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
              <Legend />
              {users.map((user, idx) => (
                <Line
                  key={user.id}
                  type="monotone"
                  dataKey={user.aliases[0] || user.name}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-2 text-left">ユーザー</th>
              {months.map((m) => (
                <th key={m.label} className="px-4 py-2 text-right">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{user.aliases[0] || user.name}</td>
                {months.map((m) => (
                  <td key={m.label} className="px-4 py-2 text-right">
                    ¥{(userSharesByMonth[user.id]?.[m.label] || 0).toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
