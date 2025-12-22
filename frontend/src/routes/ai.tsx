import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import {
  useTransactions,
  useCategories,
  useUsers,
  useMonthlySummary,
  useAIAnalysis,
  calculateCategorySummary,
} from '../lib/api';
import type { ChatMessage } from '../lib/types';

export const Route = createFileRoute('/ai')({
  component: AIPage,
});

function AIPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: transactions = [] } = useTransactions(year, month, false);
  const { data: categories = [] } = useCategories();
  const { data: users = [] } = useUsers();
  const { data: summary } = useMonthlySummary(year, month, false);

  const aiAnalysis = useAIAnalysis();

  // Calculate category summary for AI
  const categorySummary = useMemo(
    () => calculateCategorySummary(transactions, categories),
    [transactions, categories]
  );

  // Build summary for AI
  const aiSummary = useMemo(() => {
    const byCategory: Record<string, number> = {};
    Object.entries(categorySummary).forEach(([name, data]) => {
      byCategory[name] = data.amount;
    });

    const userShares: Record<string, number> = {};
    if (summary?.userShares) {
      Object.entries(summary.userShares).forEach(([userId, amount]) => {
        const user = users.find((u) => u.id === Number(userId));
        const name = user?.aliases[0] || user?.name || `User ${userId}`;
        userShares[name] = amount;
      });
    }

    return {
      totalSpending: summary?.totalSpending || 0,
      byCategory,
      userShares,
    };
  }, [categorySummary, summary, users]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleStartAnalysis = async () => {
    setChatHistory([]);
    try {
      const result = await aiAnalysis.mutateAsync({
        summary: aiSummary,
        month: `${year}年${month}月`,
      });
      setChatHistory(result.history);
    } catch (error) {
      console.error('AI analysis error:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || aiAnalysis.isPending) return;

    const message = userInput;
    setUserInput('');

    try {
      const result = await aiAnalysis.mutateAsync({
        summary: aiSummary,
        month: `${year}年${month}月`,
        history: chatHistory,
        userMessage: message,
      });
      setChatHistory(result.history);
    } catch (error) {
      console.error('AI analysis error:', error);
    }
  };

  const years = Array.from({ length: 3 }, (_, i) => (now.getFullYear() - i).toString());
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">AI分析</h2>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-4 shadow">
        <select
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            setChatHistory([]);
          }}
          className="rounded border px-3 py-2"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setChatHistory([]);
          }}
          className="rounded border px-3 py-2"
        >
          {months.map((m) => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>

        <button
          onClick={handleStartAnalysis}
          disabled={aiAnalysis.isPending}
          className="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {chatHistory.length === 0 ? 'AIで分析開始' : '再分析'}
        </button>
      </div>

      {/* Summary Preview */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">分析対象データ</h3>
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <span className="text-gray-500">総支出:</span>{' '}
            <span className="font-medium">¥{aiSummary.totalSpending.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-500">カテゴリ数:</span>{' '}
            <span className="font-medium">{Object.keys(aiSummary.byCategory).length}</span>
          </div>
          <div>
            <span className="text-gray-500">ユーザー数:</span>{' '}
            <span className="font-medium">{Object.keys(aiSummary.userShares).length}</span>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex h-[500px] flex-col rounded-lg bg-white shadow">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {chatHistory.length === 0 ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              「AIで分析開始」ボタンをクリックして分析を開始してください
            </div>
          ) : (
            <div className="space-y-4">
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap text-sm">
                        {msg.parts[0]?.text}
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        <Markdown>{msg.parts[0]?.text || ''}</Markdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {aiAnalysis.isPending && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-gray-100 p-3 text-gray-500">
                    分析中...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        {chatHistory.length > 0 && (
          <div className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="質問を入力..."
                className="flex-1 rounded border px-3 py-2"
                disabled={aiAnalysis.isPending}
              />
              <button
                onClick={handleSendMessage}
                disabled={aiAnalysis.isPending || !userInput.trim()}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                送信
              </button>
            </div>
          </div>
        )}
      </div>

      {aiAnalysis.isError && (
        <div className="rounded-lg bg-red-50 p-4 text-red-600">
          エラーが発生しました。しばらくしてから再試行してください。
        </div>
      )}
    </div>
  );
}
