import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/import')({
  component: ImportPage,
});

function ImportPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">CSVインポート</h2>

      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-600">
          CSVインポート機能は Phase 4 で実装予定です。
        </p>
        <p className="mt-2 text-sm text-gray-500">
          この画面は admin ユーザーのみアクセス可能です。
        </p>
      </div>
    </div>
  );
}
