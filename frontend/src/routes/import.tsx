import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState, useCallback, useMemo } from 'react';
import { useImportParse, useImportCategories, useImportExecute, fetchApi } from '../lib/api';

export const Route = createFileRoute('/import')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData({
      queryKey: ['me'],
      queryFn: () => fetchApi<{ email: string; role: string }>('/auth/me'),
    });
    if (user.role !== 'admin') {
      throw redirect({ to: '/' });
    }
  },
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
  const [previewTab, setPreviewTab] = useState<'detail' | 'pivot' | 'fullPivot'>('detail');
  const [isDragging, setIsDragging] = useState(false);

  // Mutations
  const importParse = useImportParse();
  const importCategories = useImportCategories();
  const importExecute = useImportExecute();

  // Pivot summary (category-based)
  const pivotSummary = useMemo(() => {
    if (!parseResult?.transactions) return [];
    const summary: Record<string, { major: string; minor: string; count: number; amount: number }> = {};
    for (const tx of parseResult.transactions) {
      const key = `${tx.major_name}|${tx.minor_name}`;
      if (!summary[key]) {
        summary[key] = { major: tx.major_name, minor: tx.minor_name, count: 0, amount: 0 };
      }
      summary[key].count++;
      summary[key].amount += tx.amount;
    }
    return Object.values(summary).sort((a, b) => b.amount - a.amount);
  }, [parseResult?.transactions]);

  // Full pivot (status × category cross tabulation)
  const fullPivot = useMemo(() => {
    if (!parseResult?.transactions) return { statuses: [] as string[], categories: [] as string[], data: {} as Record<string, Record<string, number>> };
    const statusSet = new Set<string>();
    const categorySet = new Set<string>();
    const data: Record<string, Record<string, number>> = {};

    for (const tx of parseResult.transactions) {
      const status = tx.processing_status;
      const category = tx.major_name;
      statusSet.add(status);
      categorySet.add(category);

      if (!data[status]) data[status] = {};
      data[status][category] = (data[status][category] || 0) + Math.abs(tx.amount);
    }

    return {
      statuses: Array.from(statusSet).sort(),
      categories: Array.from(categorySet).sort(),
      data,
    };
  }, [parseResult?.transactions]);

  // Process files (shared logic for both input and drop)
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setError(null);
    let combinedContent = '';

    for (const file of fileArray) {
      // Validate file type
      if (!file.name.endsWith('.csv')) {
        setError(`CSVファイルのみ対応しています: ${file.name}`);
        return;
      }

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

  // Handle file input change
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
  }, [processFiles]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFiles(files);
    }
  }, [processFiles]);

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
          <h3 className="mb-4 text-lg font-semibold">CSVファイルをアップロード</h3>
          <p className="mb-4 text-sm text-gray-600">
            MoneyForward からエクスポートした CSV ファイルをドラッグ&ドロップするか、
            クリックして選択してください。複数ファイルに対応しています。
          </p>

          <div className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileChange}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <div className="pointer-events-none">
                <svg
                  className={`mx-auto h-12 w-12 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`}
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className={`mt-2 text-sm ${isDragging ? 'text-blue-600' : 'text-gray-600'}`}>
                  {isDragging
                    ? 'ここにドロップしてください'
                    : 'CSVファイルをドラッグ&ドロップ、またはクリックして選択'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  複数ファイル対応（Shift-JIS / UTF-8）
                </p>
              </div>
            </div>

            {csvContent && (
              <div className="rounded bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm font-medium text-green-800">
                    ファイル読み込み完了（{csvContent.split('\n').length - 1} 行）
                  </p>
                </div>
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

          {/* Transaction Preview with Tabs */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">取引プレビュー</h3>
              <div className="flex items-center gap-1 rounded-lg border bg-gray-100 p-1">
                <button
                  onClick={() => setPreviewTab('detail')}
                  className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                    previewTab === 'detail'
                      ? 'bg-white text-gray-900 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  詳細
                </button>
                <button
                  onClick={() => setPreviewTab('pivot')}
                  className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                    previewTab === 'pivot'
                      ? 'bg-white text-gray-900 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  ピボット集計
                </button>
                <button
                  onClick={() => setPreviewTab('fullPivot')}
                  className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                    previewTab === 'fullPivot'
                      ? 'bg-white text-gray-900 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  フルピボット
                </button>
              </div>
            </div>

            {/* Detail View */}
            {previewTab === 'detail' && (
              <div className="max-h-96 overflow-auto">
                <p className="mb-2 text-sm text-gray-500">先頭20件を表示</p>
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
            )}

            {/* Pivot Summary */}
            {previewTab === 'pivot' && (
              <div className="max-h-96 overflow-auto">
                <p className="mb-2 text-sm text-gray-500">カテゴリ別の合計金額</p>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 text-left">大項目</th>
                      <th className="px-2 py-1 text-left">中項目</th>
                      <th className="px-2 py-1 text-right">件数</th>
                      <th className="px-2 py-1 text-right">合計金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pivotSummary.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="px-2 py-1">{row.major}</td>
                        <td className="px-2 py-1">{row.minor}</td>
                        <td className="px-2 py-1 text-right">{row.count}</td>
                        <td className="px-2 py-1 text-right">¥{row.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-2 py-1" colSpan={2}>合計</td>
                      <td className="px-2 py-1 text-right">{pivotSummary.reduce((s, r) => s + r.count, 0)}</td>
                      <td className="px-2 py-1 text-right">¥{pivotSummary.reduce((s, r) => s + r.amount, 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Full Pivot */}
            {previewTab === 'fullPivot' && (
              <div className="max-h-96 overflow-auto">
                <p className="mb-2 text-sm text-gray-500">処理ステータス × カテゴリのクロス集計</p>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 text-left">ステータス</th>
                      {fullPivot.categories.map((cat) => (
                        <th key={cat} className="px-2 py-1 text-right">{cat}</th>
                      ))}
                      <th className="px-2 py-1 text-right font-bold">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullPivot.statuses.map((status) => {
                      const rowTotal = fullPivot.categories.reduce(
                        (sum, cat) => sum + (fullPivot.data[status]?.[cat] || 0),
                        0
                      );
                      return (
                        <tr key={status} className="border-b">
                          <td className="px-2 py-1 whitespace-nowrap">{status}</td>
                          {fullPivot.categories.map((cat) => (
                            <td key={cat} className="px-2 py-1 text-right">
                              {fullPivot.data[status]?.[cat]
                                ? `¥${fullPivot.data[status][cat].toLocaleString()}`
                                : '-'}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right font-semibold">¥{rowTotal.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-2 py-1">合計</td>
                      {fullPivot.categories.map((cat) => {
                        const colTotal = fullPivot.statuses.reduce(
                          (sum, status) => sum + (fullPivot.data[status]?.[cat] || 0),
                          0
                        );
                        return (
                          <td key={cat} className="px-2 py-1 text-right">
                            ¥{colTotal.toLocaleString()}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-right">
                        ¥{fullPivot.statuses.reduce(
                          (sum, status) =>
                            sum + fullPivot.categories.reduce(
                              (s, cat) => s + (fullPivot.data[status]?.[cat] || 0),
                              0
                            ),
                          0
                        ).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
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
