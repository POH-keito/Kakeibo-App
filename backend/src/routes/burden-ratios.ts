import { Hono } from 'hono';
import { ncb, type BurdenRatio, type BurdenRatioDetail } from '../lib/ncb.js';
import type { AuthUser } from '../middleware/auth.js';

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

/**
 * GET /api/burden-ratios
 * List all burden ratios for the household with details
 */
app.get('/', async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;

  // Fetch all burden ratios for the household
  const ratios = await ncb.list<BurdenRatio>('burden_ratios', {
    where: { household_id: householdId },
    order_by: { effective_month: 'desc' },
  });

  // Fetch all details for these ratios
  if (ratios.length === 0) {
    return c.json([]);
  }

  const ratioIds = ratios.map((r) => r.id);
  const allDetails = await ncb.list<BurdenRatioDetail>('burden_ratio_details', {
    where: { burden_ratio_id: { _in: ratioIds } },
  });

  // Group details by burden_ratio_id
  const detailsMap = new Map<number, BurdenRatioDetail[]>();
  allDetails.forEach((detail) => {
    if (!detailsMap.has(detail.burden_ratio_id)) {
      detailsMap.set(detail.burden_ratio_id, []);
    }
    detailsMap.get(detail.burden_ratio_id)!.push(detail);
  });

  // Combine ratios with their details
  const enrichedRatios = ratios.map((ratio) => ({
    ...ratio,
    details: detailsMap.get(ratio.id) || [],
  }));

  return c.json(enrichedRatios);
});

/**
 * POST /api/burden-ratios
 * Create a new burden ratio with details
 * Body: { effective_month: string, details: Array<{ user_id: number, ratio_percent: number }> }
 */
app.post('/', async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;

  const body = await c.req.json<{
    effective_month: string;
    details: Array<{ user_id: number; ratio_percent: number }>;
  }>();

  // Validate total equals 100%
  const total = body.details.reduce((sum, d) => sum + d.ratio_percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    return c.json({ error: '合計が100%である必要があります' }, 400);
  }

  // Check if ratio already exists for this month
  const existing = await ncb.list<BurdenRatio>('burden_ratios', {
    where: {
      household_id: householdId,
      effective_month: body.effective_month,
    },
  });

  if (existing.length > 0) {
    return c.json({ error: 'この月の按分比率は既に存在します' }, 400);
  }

  // Create burden ratio
  const [ratio] = await ncb.create<BurdenRatio>('burden_ratios', {
    household_id: householdId,
    effective_month: body.effective_month,
  });

  // Create details
  const detailsData = body.details.map((d) => ({
    burden_ratio_id: ratio.id,
    user_id: d.user_id,
    ratio_percent: d.ratio_percent,
  }));

  const details = await ncb.create<BurdenRatioDetail>(
    'burden_ratio_details',
    detailsData
  );

  return c.json({
    ...ratio,
    details,
  });
});

/**
 * PUT /api/burden-ratios/:id
 * Update burden ratio details
 * Body: { details: Array<{ user_id: number, ratio_percent: number }> }
 */
app.put('/:id', async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;
  const id = parseInt(c.req.param('id'));

  const body = await c.req.json<{
    details: Array<{ user_id: number; ratio_percent: number }>;
  }>();

  // Validate total equals 100%
  const total = body.details.reduce((sum, d) => sum + d.ratio_percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    return c.json({ error: '合計が100%である必要があります' }, 400);
  }

  // Verify ratio belongs to household
  const ratios = await ncb.list<BurdenRatio>('burden_ratios', {
    where: { id, household_id: householdId },
  });

  if (ratios.length === 0) {
    return c.json({ error: '按分比率が見つかりません' }, 404);
  }

  // Delete existing details
  await ncb.delete('burden_ratio_details', {
    burden_ratio_id: id,
  });

  // Create new details
  const detailsData = body.details.map((d) => ({
    burden_ratio_id: id,
    user_id: d.user_id,
    ratio_percent: d.ratio_percent,
  }));

  const details = await ncb.create<BurdenRatioDetail>(
    'burden_ratio_details',
    detailsData
  );

  return c.json({
    ...ratios[0],
    details,
  });
});

/**
 * DELETE /api/burden-ratios/:id
 * Delete burden ratio and its details
 */
app.delete('/:id', async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;
  const id = parseInt(c.req.param('id'));

  // Verify ratio belongs to household
  const ratios = await ncb.list<BurdenRatio>('burden_ratios', {
    where: { id, household_id: householdId },
  });

  if (ratios.length === 0) {
    return c.json({ error: '按分比率が見つかりません' }, 404);
  }

  // Delete details first
  await ncb.delete('burden_ratio_details', {
    burden_ratio_id: id,
  });

  // Delete ratio
  await ncb.delete('burden_ratios', { id });

  return c.json({ success: true });
});

export default app;
