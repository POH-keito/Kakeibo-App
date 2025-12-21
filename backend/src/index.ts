import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware, type AuthUser } from './middleware/auth.js';
import authRoutes from './routes/auth.js';

// Create app with type variables for context
const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

// Global middleware
app.use('*', logger());
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  })
);

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok' }));

// API routes
const api = app.basePath('/api');

// Auth routes (some endpoints don't need auth)
api.route('/auth', authRoutes);

// Protected routes - require authentication
api.use('/*', authMiddleware);

// Placeholder routes (will be implemented in later phases)
api.get('/transactions', (c) => {
  return c.json({ message: 'Transactions endpoint - Phase 4' });
});

api.get('/tags', (c) => {
  return c.json({ message: 'Tags endpoint - Phase 4' });
});

// Export type for RPC client
export type AppType = typeof app;

// Start server
const port = Number(process.env.PORT) || 8080;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
