import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { useImportParse, useImportCategories, useImportExecute } from '../lib/api';

export const Route = createFileRoute('/import')({
  component: ImportPage,
});

interface ParsedTransaction {
  moneyforward_id: string;
  transaction_date: string;
  content: string;
  amount: number;
  major_name: string;
  minor_name: string;
  memo: string | null;
  financial_institution: string;
  is_calculation_target: boolean;
  is_transfer: boolean;
  processing_status: string;
  applied_burden_ratio_id: number | null;
  applied_exclusion_rule_id: number | null;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  newCategories: { major_name: string; minor_name: string }[];
  transactions: ParsedTransaction[];
}

function ImportPage() {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [csvContent, setCsvContent] = useState<string>('');
  const [parseResult, setParseResult] = useState<ImportResult | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [newCategoryTypes, setNewCategoryTypes] = useState<Record<string, string>>({});

  // Mutations
  const importParse = useImportParse();
  const importCategories = useImportCategories();
  const importExecute = useImportExecute();

  // Handle file upload
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    let combinedContent = '';

    for (const file of Array.from(files)) {
      try {
        // MoneyForward CSV is Shift-JIS encoded
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder('shift-jis');
        const text = decoder.decode(buffer);
        combinedContent += text + '\n';
      } catch {
        setError(`ファイル読み込みエラー: ${file.name}`);
        return;
      }
    }

    setCsvContent(combinedContent);
  }, []);

  // Parse CSV
  const handleParse = async () => {
    if (!csvContent) return;

    setError(null);
    try {
      const result = await importParse.mutateAsync(csvContent);
      setParseResult(result);

      // Initialize category types
      const types: Record<string, string> = {};
      result.newCategories.forEach((cat) => {
        types[`${cat.major_name}|${cat.minor_name}`] = '変動';
      });
      setNewCategoryTypes(types);

      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV解析エラー');
    }
  };

  // Create new categories
  const handleCreateCategories = async () => {
    if (!parseResult?.newCategories.length) return;

    try {
      const categories = parseResult.newCategories.map((cat) => ({
        major_name: cat.major_name,
        minor_name: cat.minor_name,
        cost_type: newCategoryTypes[`${cat.major_name}|${cat.minor_name}`] || '変動',
      }));

      await importCategories.mutateAsync(categories);

      // Re-parse to update
      await handleParse();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'カテゴリ作成エラー');
    }
  };

  // Execute import
  const handleImport = async () => {
    if (!parseResult) return;

    setStep('importing');
    setProgress(0);

    try {
      const result = await importExecute.mutateAsync(parseResult.transactions);
      setImportResult(result);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'インポートエラー');
      setStep('preview');
    }
  };

  // Reset
  const handleReset = () => {
    setStep('upload');
    setCsvContent('');
    setParseResult(null);
    setImportResult(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">CSVインポート</h2>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-600">{error}</div>
      )}

      {step === 'upload' && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold">CSVファイルを選択</h3>
          <p className="mb-4 text-sm text-gray-600">
            MoneyForward からエクスポートした CSV ファイルを選択してください。
            複数ファイルを同時に選択できます。
          </p>

          <div className="space-y-4">
            <input
              type="file"
              accept=".csv"
              multiple
              onChange={handleFileChange}
              className="block w-full rounded border p-2"
            />

            {csvContent && (
              <div className="rounded bg-gray-50 p-4">
                <p className="text-sm text-gray-600">
                  ファイル読み込み完了 ({csvContent.split('\n').length - 1} 行)
                </p>
                <button
                  onClick={handleParse}
                  className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  解析する
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'preview' && parseResult && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold">解析結果</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded bg-green-50 p-4">
                <div className="text-2xl font-bold text-green-700">{parseResult.created}</div>
                <div className="text-sm text-green-600">新規作成</div>
              </div>
              <div className="rounded bg-yellow-50 p-4">
                <div className="text-2xl font-bold text-yellow-700">{parseResult.updated}</div>
                <div className="text-sm text-yellow-600">更新</div>
              </div>
              <div className="rounded bg-gray-50 p-4">
                <div className="text-2xl font-bold text-gray-700">{parseResult.skipped}</div>
                <div className="text-sm text-gray-600">スキップ</div>
              </div>
            </div>
          </div>

          {/* New Categories */}
          {parseResult.newCategories.length > 0 && (
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold">
                新規カテゴリ ({parseResult.newCategories.length}件)
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                以下の新しいカテゴリが検出されました。コストタイプを選択して作成してください。
              </p>
              <div className="space-y-2">
                {parseResult.newCategories.map((cat) => {
                  const key = `${cat.major_name}|${cat.minor_name}`;
                  return (
                    <div key={key} className="flex items-center gap-4 rounded bg-gray-50 p-3">
                      <span className="flex-1">
                        {cat.major_name} &gt; {cat.minor_name}
                      </span>
                      <select
                        value={newCategoryTypes[key] || '変動'}
                        onChange={(e) =>
                          setNewCategoryTypes((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="rounded border px-2 py-1"
                      >
                        <option value="固定">固定</option>
                        <option value="変動">変動</option>
                      </select>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleCreateCategories}
                className="mt-4 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
              >
                カテゴリを作成
              </button>
            </div>
          )}

          {/* Transaction Preview */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold">
              取引プレビュー (先頭20件)
            </h3>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="px-2 py-1 text-left">日付</th>
                    <th className="px-2 py-1 text-left">内容</th>
                    <th className="px-2 py-1 text-left">カテゴリ</th>
                    <th className="px-2 py-1 text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.transactions.slice(0, 20).map((tx, idx) => (
                    <tr key={idx} className={tx.processing_status.startsWith('集計除外') ? 'text-gray-400' : ''}>
                      <td className="px-2 py-1">{tx.transaction_date}</td>
                      <td className="px-2 py-1">{tx.content}</td>
                      <td className="px-2 py-1">{tx.major_name} &gt; {tx.minor_name}</td>
                      <td className="px-2 py-1 text-right">¥{tx.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleReset}
              className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
            >
              やり直す
            </button>
            <button
              onClick={handleImport}
              disabled={parseResult.newCategories.length > 0}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {parseResult.newCategories.length > 0
                ? '先にカテゴリを作成してください'
                : 'インポート実行'}
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold">インポート中...</h3>
          <div className="h-4 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-600">処理中... しばらくお待ちください</p>
        </div>
      )}

      {step === 'done' && importResult && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-green-700">インポート完了</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded bg-green-50 p-4">
              <div className="text-2xl font-bold text-green-700">{importResult.created}</div>
              <div className="text-sm text-green-600">件 新規作成</div>
            </div>
            <div className="rounded bg-yellow-50 p-4">
              <div className="text-2xl font-bold text-yellow-700">{importResult.updated}</div>
              <div className="text-sm text-yellow-600">件 更新</div>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="mt-6 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            新しいファイルをインポート
          </button>
        </div>
      )}
    </div>
  );
}
