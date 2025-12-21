import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/ai')({
  component: AIPage,
});

function AIPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">AI分析</h2>

      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-600">
          AI分析機能は Phase 3 で実装予定です。
        </p>
      </div>
    </div>
  );
}
