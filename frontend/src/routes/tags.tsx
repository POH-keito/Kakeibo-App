import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/tags')({
  component: TagsPage,
});

function TagsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">タグ集計</h2>

      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-600">
          タグ集計機能は Phase 3 で実装予定です。
        </p>
      </div>
    </div>
  );
}
