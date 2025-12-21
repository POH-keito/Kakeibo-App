import { Hono } from 'hono';
import { ncb, type Category, type User, type UserAlias, type Tag } from '../lib/ncb.js';
import type { AuthUser } from '../middleware/auth.js';

const HOUSEHOLD_ID = 1; // TODO: Get from user context

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

/**
 * GET /api/master/categories
 * Returns all categories for the household
 */
app.get('/categories', async (c) => {
  const categories = await ncb.list<Category>('categories', {
    where: { household_id: HOUSEHOLD_ID },
    order_by: [{ major_name: 'asc' }, { minor_name: 'asc' }],
  });
  return c.json(categories);
});

/**
 * GET /api/master/users
 * Returns all users with their aliases
 */
app.get('/users', async (c) => {
  const [users, aliases] = await Promise.all([
    ncb.list<User>('users', {
      where: { household_id: HOUSEHOLD_ID },
    }),
    ncb.list<UserAlias>('user_aliases', {}),
  ]);

  // Combine users with their aliases
  const usersWithAliases = users.map((user) => ({
    ...user,
    aliases: aliases.filter((a) => a.user_id === user.id).map((a) => a.alias),
  }));

  return c.json(usersWithAliases);
});

/**
 * GET /api/master/tags
 * Returns all tags for the household
 */
app.get('/tags', async (c) => {
  const tags = await ncb.list<Tag>('tags', {
    where: { household_id: HOUSEHOLD_ID },
    order_by: { name: 'asc' },
  });
  return c.json(tags);
});

export default app;
