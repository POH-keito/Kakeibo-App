import { hc } from 'hono/client';
import type { AppType } from '../../../backend/src/index.js';

// Hono RPC client for type-safe API calls
export const client = hc<AppType>('/');

// Helper for fetching with credentials
export async function fetchApi<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}
