import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  ncb,
  type TransactionShare,
  type TransactionShareOverride,
  type BurdenRatio,
  type BurdenRatioDetail,
} from '../lib/ncb.js';
import { requireAdmin, type AuthUser } from '../middleware/auth.js';

// Validation schemas
const overrideBodySchema = z.object({
  moneyforward_id: z.string().min(1),
  user_id: z.number().int().positive(),
  value: z.number(),
  override_type: z.enum(['PERCENT', 'FIXED_AMOUNT']).optional(),
});

const deleteOverrideQuerySchema = z.object({
  moneyforward_id: z.string().min(1),
  user_id: z.string().regex(/^\d+$/),
});

const applyDefaultSchema = z.object({
  year: z.string().regex(/^\d{4}$/),
  month: z.string().regex(/^(0[1-9]|1[0-2])$/),
  moneyforward_ids: z.array(z.string().min(1)).min(1),
});

const saveBatchSchema = z.object({
  overrides: z.array(overrideBodySchema).min(1),
});

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
app.put('/override', zValidator('json', overrideBodySchema), async (c) => {
  const body = c.req.valid('json');

  const result = await ncb.upsert<TransactionShareOverride>(
    'transaction_share_overrides',
    {
      moneyforward_id: body.moneyforward_id,
      user_id: body.user_id,
      override_type: body.override_type || 'FIXED_AMOUNT',
      value: body.value,
    },
    ['moneyforward_id', 'user_id']
  );

  return c.json(result[0] || null);
});

/**
 * DELETE /api/shares/override
 * Delete a share override
 */
app.delete('/override', zValidator('query', deleteOverrideQuerySchema), async (c) => {
  const query = c.req.valid('query');

  await ncb.delete('transaction_share_overrides', {
    moneyforward_id: { _eq: query.moneyforward_id },
    user_id: { _eq: Number(query.user_id) },
  });

  return c.json({ success: true });
});

/**
 * POST /api/shares/apply-default
 * Apply default burden ratio to all transactions for a month
 */
app.post('/apply-default', zValidator('json', applyDefaultSchema), async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;
  const { year, month, moneyforward_ids } = c.req.valid('json');
  const effectiveMonth = `${year}-${month}`;

  // Get burden ratio for the month
  const ratios = await ncb.list<BurdenRatio>('burden_ratios', {
    where: {
      household_id: householdId,
      effective_month: effectiveMonth,
    },
  });

  if (ratios.length === 0) {
    return c.json({ error: 'No burden ratio found for this month' }, 404);
  }

  const ratioDetails = await ncb.list<BurdenRatioDetail>('burden_ratio_details', {
    where: { burden_ratio_id: ratios[0].id },
  });

  // Get transactions to update
  const transactions = await ncb.list<{ moneyforward_id: string; amount: number }>('transactions', {
    where: { moneyforward_id: { _in: moneyforward_ids } },
  });

  // Calculate and create/update shares
  const shares: Partial<TransactionShare>[] = [];
  for (const tx of transactions) {
    for (const detail of ratioDetails) {
      const shareAmount = Math.round(Math.abs(tx.amount) * (detail.ratio_percent / 100));
      shares.push({
        moneyforward_id: tx.moneyforward_id,
        user_id: detail.user_id,
        share_amount: shareAmount,
      });
    }
  }

  // Upsert shares in batches
  const batchSize = 100;
  for (let i = 0; i < shares.length; i += batchSize) {
    const batch = shares.slice(i, i + batchSize);
    await ncb.upsert('transaction_shares', batch, ['moneyforward_id', 'user_id']);
  }

  // Delete any existing overrides for these transactions
  for (const mfId of moneyforward_ids) {
    await ncb.delete('transaction_share_overrides', {
      moneyforward_id: { _eq: mfId },
    });
  }

  return c.json({
    success: true,
    updated: moneyforward_ids.length,
  });
});

/**
 * POST /api/shares/save-batch
 * Save multiple share overrides at once
 */
app.post('/save-batch', zValidator('json', saveBatchSchema), async (c) => {
  const { overrides } = c.req.valid('json');

  // Add default override_type
  const normalizedOverrides = overrides.map((o) => ({
    ...o,
    override_type: o.override_type || 'FIXED_AMOUNT',
  }));

  // Upsert overrides in batches
  const batchSize = 100;
  for (let i = 0; i < normalizedOverrides.length; i += batchSize) {
    const batch = normalizedOverrides.slice(i, i + batchSize);
    await ncb.upsert('transaction_share_overrides', batch, ['moneyforward_id', 'user_id']);
  }

  return c.json({
    success: true,
    saved: overrides.length,
  });
});

export default app;
