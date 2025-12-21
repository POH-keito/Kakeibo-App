import { Hono } from 'hono';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

/**
 * GET /api/auth/me
 * Returns the current user's email and role
 */
app.get('/me', authMiddleware, (c) => {
  const user = c.get('user');
  return c.json(user);
});

export default app;
