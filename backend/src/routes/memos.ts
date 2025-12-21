import { Hono } from 'hono';
import { ncb, type MonthlyMemo } from '../lib/ncb.js';
import type { AuthUser } from '../middleware/auth.js';

const HOUSEHOLD_ID = 1; // TODO: Get from user context

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

/**
 * GET /api/memos/:targetMonth
 * Get memo for a specific month (format: YYYY-MM)
 */
app.get('/:targetMonth', async (c) => {
  const targetMonth = c.req.param('targetMonth');

  const memos = await ncb.list<MonthlyMemo>('monthly_memos', {
    where: {
      household_id: HOUSEHOLD_ID,
      target_month: targetMonth,
    },
  });

  return c.json(memos[0] || null);
});

/**
 * PUT /api/memos/:targetMonth
 * Create or update memo for a specific month
 */
app.put('/:targetMonth', async (c) => {
  const targetMonth = c.req.param('targetMonth');
  const body = await c.req.json<{ memo_content: string }>();

  const result = await ncb.upsert<MonthlyMemo>(
    'monthly_memos',
    {
      household_id: HOUSEHOLD_ID,
      target_month: targetMonth,
      memo_content: body.memo_content,
    },
    ['household_id', 'target_month']
  );

  return c.json(result[0] || null);
});

export default app;
