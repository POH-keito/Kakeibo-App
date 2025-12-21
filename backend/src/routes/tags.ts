import { Hono } from 'hono';
import { ncb, type Tag, type TransactionTag } from '../lib/ncb.js';
import { requireAdmin, type AuthUser } from '../middleware/auth.js';

const HOUSEHOLD_ID = 1;

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

// All tag modification routes require admin
app.use('/*', requireAdmin);

/**
 * POST /api/tags
 * Create a new tag
 */
app.post('/', async (c) => {
  const body = await c.req.json<{ name: string; color?: string }>();

  if (!body.name || body.name.trim() === '') {
    return c.json({ error: 'Tag name is required' }, 400);
  }

  // Check for duplicate name
  const existing = await ncb.list<Tag>('tags', {
    where: {
      household_id: HOUSEHOLD_ID,
      name: body.name.trim(),
    },
  });

  if (existing.length > 0) {
    return c.json({ error: 'Tag with this name already exists' }, 400);
  }

  const created = await ncb.create<Tag>('tags', {
    household_id: HOUSEHOLD_ID,
    name: body.name.trim(),
    color: body.color || null,
  });

  return c.json(created[0] || null);
});

/**
 * PUT /api/tags/:id
 * Update a tag
 */
app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json<{ name?: string; color?: string }>();

  if (isNaN(id)) {
    return c.json({ error: 'Invalid tag ID' }, 400);
  }

  // Check if tag exists
  const existing = await ncb.list<Tag>('tags', {
    where: { id },
  });

  if (existing.length === 0) {
    return c.json({ error: 'Tag not found' }, 404);
  }

  // Check for duplicate name if name is being updated
  if (body.name && body.name.trim() !== existing[0].name) {
    const duplicate = await ncb.list<Tag>('tags', {
      where: {
        household_id: HOUSEHOLD_ID,
        name: body.name.trim(),
      },
    });

    if (duplicate.length > 0) {
      return c.json({ error: 'Tag with this name already exists' }, 400);
    }
  }

  const updateData: Partial<Tag> = {};
  if (body.name) updateData.name = body.name.trim();
  if (body.color !== undefined) updateData.color = body.color;

  const updated = await ncb.update<Tag>('tags', { id }, updateData);

  return c.json(updated[0] || null);
});

/**
 * DELETE /api/tags/:id
 * Delete a tag
 */
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);

  if (isNaN(id)) {
    return c.json({ error: 'Invalid tag ID' }, 400);
  }

  // First delete all transaction_tags referencing this tag
  await ncb.delete('transaction_tags', { tag_id: id });

  // Then delete the tag itself
  await ncb.delete('tags', { id });

  return c.json({ success: true });
});

/**
 * GET /api/tags/:id/transactions
 * Get transactions with this tag
 */
app.get('/:id/transactions', async (c) => {
  const id = parseInt(c.req.param('id'), 10);

  if (isNaN(id)) {
    return c.json({ error: 'Invalid tag ID' }, 400);
  }

  const transactionTags = await ncb.list<TransactionTag>('transaction_tags', {
    where: { tag_id: id },
  });

  return c.json({
    tag_id: id,
    transaction_count: transactionTags.length,
    transaction_ids: transactionTags.map((tt) => tt.transaction_id),
  });
});

/**
 * POST /api/tags/assign
 * Assign a tag to transactions
 */
app.post('/assign', async (c) => {
  const body = await c.req.json<{
    tag_id: number;
    transaction_ids: number[];
  }>();

  const { tag_id, transaction_ids } = body;

  if (!tag_id || !transaction_ids || transaction_ids.length === 0) {
    return c.json({ error: 'tag_id and transaction_ids are required' }, 400);
  }

  // Create transaction_tags entries
  const entries = transaction_ids.map((tx_id) => ({
    transaction_id: tx_id,
    tag_id,
  }));

  await ncb.upsert('transaction_tags', entries, ['transaction_id', 'tag_id']);

  return c.json({
    success: true,
    assigned: transaction_ids.length,
  });
});

/**
 * POST /api/tags/unassign
 * Remove a tag from transactions
 */
app.post('/unassign', async (c) => {
  const body = await c.req.json<{
    tag_id: number;
    transaction_ids: number[];
  }>();

  const { tag_id, transaction_ids } = body;

  if (!tag_id || !transaction_ids || transaction_ids.length === 0) {
    return c.json({ error: 'tag_id and transaction_ids are required' }, 400);
  }

  // Delete transaction_tags entries
  for (const tx_id of transaction_ids) {
    await ncb.delete('transaction_tags', {
      transaction_id: tx_id,
      tag_id,
    });
  }

  return c.json({
    success: true,
    unassigned: transaction_ids.length,
  });
});

export default app;
