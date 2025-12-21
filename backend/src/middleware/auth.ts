import { createMiddleware } from 'hono/factory';

// Hardcoded roles for now (as discussed)
const ADMIN_EMAILS = ['keito@fukushi.ma'];
const VIEWER_EMAILS = ['waka@fukushi.ma'];

export type UserRole = 'admin' | 'viewer';

export interface AuthUser {
  email: string;
  role: UserRole;
}

/**
 * Authentication middleware that reads IAP headers from Cloud Run
 * In development, uses DEV_USER_EMAIL environment variable
 */
export const authMiddleware = createMiddleware<{
  Variables: {
    user: AuthUser;
  };
}>(async (c, next) => {
  // Get email from IAP header or development environment variable
  let email: string | undefined;

  if (process.env.NODE_ENV === 'development') {
    email = process.env.DEV_USER_EMAIL || 'keito@fukushi.ma';
  } else {
    // Cloud Run IAP header format: "accounts.google.com:email@example.com"
    const iapHeader = c.req.header('X-Goog-Authenticated-User-Email');
    email = iapHeader?.replace('accounts.google.com:', '');
  }

  if (!email) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Determine role
  let role: UserRole;
  if (ADMIN_EMAILS.includes(email)) {
    role = 'admin';
  } else if (VIEWER_EMAILS.includes(email)) {
    role = 'viewer';
  } else {
    // Unknown email - deny access
    return c.json({ error: 'Forbidden' }, 403);
  }

  c.set('user', { email, role });
  await next();
});

/**
 * Middleware to require admin role
 */
export const requireAdmin = createMiddleware<{
  Variables: {
    user: AuthUser;
  };
}>(async (c, next) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  await next();
});
