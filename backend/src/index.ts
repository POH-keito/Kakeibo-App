import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware, type AuthUser } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import masterRoutes from './routes/master.js';
import transactionRoutes from './routes/transactions.js';
import memoRoutes from './routes/memos.js';
import aiRoutes from './routes/ai.js';
import sharesRoutes from './routes/shares.js';
import importRoutes from './routes/import.js';
import tagsRoutes from './routes/tags.js';

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

// Route handlers
api.route('/master', masterRoutes);
api.route('/transactions', transactionRoutes);
api.route('/memos', memoRoutes);
api.route('/ai', aiRoutes);
api.route('/shares', sharesRoutes);
api.route('/import', importRoutes);
api.route('/tags', tagsRoutes);

// Export type for RPC client
export type AppType = typeof app;

// Start server
const port = Number(process.env.PORT) || 8080;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
