import { Transaction, Category } from '../lib/types';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  categories: Category[];
  title: string;
  filterContext?: {
    type: 'category' | 'costType' | 'user';
    majorName?: string;
    minorName?: string;
    costType?: string;
    userId?: number;
  };
}

export function TransactionModal({
  isOpen,
  onClose,
  transactions,
  categories,
  title,
  filterContext,
}: TransactionModalProps) {
  if (!isOpen) return null;

  // Filter transactions based on context
  const filteredTransactions = transactions.filter((tx) => {
    // Only include household transactions (按分_家計)
    if (tx.processing_status !== '按分_家計') return false;

    if (!filterContext) return true;

    const category = categories.find((c) => c.id === tx.category_id);
    // Default values when no category (matching backend logic)
    const costType = category?.cost_type || '変動';
    const majorName = category?.major_name || '未分類';
    const minorName = category?.minor_name || '未分類';

    switch (filterContext.type) {
      case 'category':
        if (filterContext.minorName) {
          return (
            majorName === filterContext.majorName &&
            minorName === filterContext.minorName
          );
        }
        return majorName === filterContext.majorName;

      case 'costType':
        if (filterContext.minorName) {
          return (
            costType === filterContext.costType &&
            majorName === filterContext.majorName &&
            minorName === filterContext.minorName
          );
        }
        if (filterContext.majorName) {
          return (
            costType === filterContext.costType &&
            majorName === filterContext.majorName
          );
        }
        return costType === filterContext.costType;

      default:
        return true;
    }
  });

  // Sort by date (newest first)
  const sortedTransactions = [...filteredTransactions].sort(
    (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100"
            aria-label="閉じる"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {sortedTransactions.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              該当する取引がありません
            </div>
          ) : (
            <div className="space-y-2">
              <div className="mb-2 text-sm text-gray-600">
                {sortedTransactions.length}件の取引
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-sm">
                    <th className="p-2">日付</th>
                    <th className="p-2">内容</th>
                    <th className="p-2">カテゴリ</th>
                    <th className="p-2 text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTransactions.map((tx) => {
                    const category = categories.find((c) => c.id === tx.category_id);
                    return (
                      <tr key={tx.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 text-sm">
                          {new Date(tx.transaction_date).toLocaleDateString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-2 text-sm">
                          <div>{tx.content}</div>
                          {tx.memo && (
                            <div className="text-xs text-gray-500">{tx.memo}</div>
                          )}
                        </td>
                        <td className="p-2 text-sm">
                          <div>{category?.major_name}</div>
                          {category?.minor_name && (
                            <div className="text-xs text-gray-500">
                              {category.minor_name}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right text-sm font-medium">
                          ¥{Math.abs(tx.amount).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t p-4">
          <button
            onClick={onClose}
            className="rounded bg-gray-200 px-4 py-2 hover:bg-gray-300"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
