import { Hono } from 'hono';
import {
  ncb,
  type TransactionShare,
  type TransactionShareOverride,
  type BurdenRatio,
  type BurdenRatioDetail,
} from '../lib/ncb.js';
import { requireAdmin, type AuthUser } from '../middleware/auth.js';

const HOUSEHOLD_ID = 1;

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

// All share modification routes require admin
app.use('/*', requireAdmin);

/**
 * PUT /api/shares/override
 * Create or update a share override
 */
app.put('/override', async (c) => {
  const body = await c.req.json<{
    transaction_id: number;
    user_id: number;
    amount: number;
  }>();

  const result = await ncb.upsert<TransactionShareOverride>(
    'transaction_share_overrides',
    {
      transaction_id: body.transaction_id,
      user_id: body.user_id,
      amount: body.amount,
    },
    ['transaction_id', 'user_id']
  );

  return c.json(result[0] || null);
});

/**
 * DELETE /api/shares/override
 * Delete a share override
 */
app.delete('/override', async (c) => {
  const transactionId = c.req.query('transaction_id');
  const userId = c.req.query('user_id');

  if (!transactionId || !userId) {
    return c.json({ error: 'Missing parameters' }, 400);
  }

  await ncb.delete('transaction_share_overrides', {
    transaction_id: Number(transactionId),
    user_id: Number(userId),
  });

  return c.json({ success: true });
});

/**
 * POST /api/shares/apply-default
 * Apply default burden ratio to all transactions for a month
 */
app.post('/apply-default', async (c) => {
  const body = await c.req.json<{
    year: string;
    month: string;
    transaction_ids: number[];
  }>();

  const { year, month, transaction_ids } = body;
  const targetMonth = `${year}-${month}`;

  // Get burden ratio for the month
  const ratios = await ncb.list<BurdenRatio>('burden_ratios', {
    where: {
      household_id: HOUSEHOLD_ID,
      target_month: targetMonth,
    },
  });

  if (ratios.length === 0) {
    return c.json({ error: 'No burden ratio found for this month' }, 404);
  }

  const ratioDetails = await ncb.list<BurdenRatioDetail>('burden_ratio_details', {
    where: { burden_ratio_id: ratios[0].id },
  });

  // Get transactions to update
  const transactions = await ncb.list<{ id: number; amount: number }>('transactions', {
    where: { id: { _in: transaction_ids } },
  });

  // Calculate and create/update shares
  const shares: Partial<TransactionShare>[] = [];
  for (const tx of transactions) {
    for (const detail of ratioDetails) {
      const amount = Math.round(Math.abs(tx.amount) * (detail.percentage / 100));
      shares.push({
        transaction_id: tx.id,
        user_id: detail.user_id,
        amount,
      });
    }
  }

  // Upsert shares in batches
  const batchSize = 100;
  for (let i = 0; i < shares.length; i += batchSize) {
    const batch = shares.slice(i, i + batchSize);
    await ncb.upsert('transaction_shares', batch, ['transaction_id', 'user_id']);
  }

  // Delete any existing overrides for these transactions
  for (const txId of transaction_ids) {
    await ncb.delete('transaction_share_overrides', {
      transaction_id: txId,
    });
  }

  return c.json({
    success: true,
    updated: transaction_ids.length,
  });
});

/**
 * POST /api/shares/save-batch
 * Save multiple share overrides at once
 */
app.post('/save-batch', async (c) => {
  const body = await c.req.json<{
    overrides: Array<{
      transaction_id: number;
      user_id: number;
      amount: number;
    }>;
  }>();

  const { overrides } = body;

  // Upsert overrides in batches
  const batchSize = 100;
  for (let i = 0; i < overrides.length; i += batchSize) {
    const batch = overrides.slice(i, i + batchSize);
    await ncb.upsert('transaction_share_overrides', batch, ['transaction_id', 'user_id']);
  }

  return c.json({
    success: true,
    saved: overrides.length,
  });
});

export default app;
