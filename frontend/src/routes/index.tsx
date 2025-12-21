import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">ダッシュボード</h2>

      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-600">
          ダッシュボード機能は Phase 3 で実装予定です。
        </p>
      </div>

      {/* Placeholder cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="font-semibold text-gray-900">総支出</h3>
          <p className="mt-2 text-3xl font-bold text-primary">-</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="font-semibold text-gray-900">ユーザー1</h3>
          <p className="mt-2 text-3xl font-bold text-gray-700">-</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="font-semibold text-gray-900">ユーザー2</h3>
          <p className="mt-2 text-3xl font-bold text-gray-700">-</p>
        </div>
      </div>
    </div>
  );
}
