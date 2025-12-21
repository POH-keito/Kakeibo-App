import { Hono } from 'hono';
import type { AuthUser } from '../middleware/auth.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface AnalysisRequest {
  summary: {
    totalSpending: number;
    byCategory: Record<string, number>;
    userShares: Record<string, number>;
  };
  month: string;
  history?: ChatMessage[];
  userMessage?: string;
}

const SYSTEM_PROMPT = `あなたは家計アドバイザーです。
2人世帯（夫婦）の家計を分析し、アドバイスを提供してください。

「按分」とは、共通費用を世帯メンバーで分担する仕組みです。
例えば、食費が10万円で按分が60:40なら、一方が6万円、もう一方が4万円を負担します。

アドバイスは以下の観点で行ってください：
1. 支出の傾向分析
2. カテゴリ別の評価
3. 節約のヒント
4. 良い点の指摘

回答は親しみやすく、具体的なアドバイスを含めてください。`;

/**
 * POST /api/ai/analyze
 * Start or continue AI analysis conversation
 */
app.post('/analyze', async (c) => {
  if (!GEMINI_API_KEY) {
    return c.json({ error: 'Gemini API key not configured' }, 500);
  }

  const body = await c.req.json<AnalysisRequest>();
  const { summary, month, history = [], userMessage } = body;

  // Build conversation
  const contents: ChatMessage[] = [];

  // Add initial analysis context if no history
  if (history.length === 0) {
    const contextMessage = `
以下は${month}の家計データです：

【総支出】${summary.totalSpending.toLocaleString()}円

【カテゴリ別支出】
${Object.entries(summary.byCategory)
  .map(([category, amount]) => `- ${category}: ${amount.toLocaleString()}円`)
  .join('\n')}

【ユーザー別負担額】
${Object.entries(summary.userShares)
  .map(([user, amount]) => `- ${user}: ${amount.toLocaleString()}円`)
  .join('\n')}

この家計データを分析して、アドバイスをください。
`;
    contents.push({
      role: 'user',
      parts: [{ text: contextMessage }],
    });
  } else {
    // Add history
    contents.push(...history);

    // Add new user message
    if (userMessage) {
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', error);
      return c.json({ error: 'AI analysis failed' }, 500);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Return updated history
    const updatedHistory: ChatMessage[] = [
      ...contents,
      {
        role: 'model',
        parts: [{ text: aiResponse }],
      },
    ];

    return c.json({
      response: aiResponse,
      history: updatedHistory,
    });
  } catch (error) {
    console.error('AI analysis error:', error);
    return c.json({ error: 'AI analysis failed' }, 500);
  }
});

export default app;
