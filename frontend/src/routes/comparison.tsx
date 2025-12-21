import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/comparison')({
  component: ComparisonPage,
});

function ComparisonPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">月次比較</h2>

      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-600">
          月次比較機能は Phase 3 で実装予定です。
        </p>
      </div>
    </div>
  );
}
