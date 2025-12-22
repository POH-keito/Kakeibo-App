import type { Context, Next } from 'hono';
import { AppError, type ErrorResponse } from '../lib/errors.js';

/**
 * Global error handler middleware
 * Catches all errors and returns structured JSON responses
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    // Handle known AppError instances
    if (err instanceof AppError) {
      const response: ErrorResponse = {
        error: {
          message: err.message,
          code: err.code,
          statusCode: err.statusCode,
        },
      };

      // Structured logging
      console.error('[AppError]', {
        timestamp: new Date().toISOString(),
        statusCode: err.statusCode,
        code: err.code,
        message: err.message,
        path: c.req.path,
        method: c.req.method,
      });

      return c.json(response, err.statusCode as 400 | 401 | 403 | 404 | 500);
    }

    // Handle unknown errors
    const error = err as Error;
    const response: ErrorResponse = {
      error: {
        message: 'サーバーエラーが発生しました',
        code: 'INTERNAL_SERVER_ERROR',
        statusCode: 500,
      },
    };

    // Structured logging for unknown errors
    console.error('[UnknownError]', {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      path: c.req.path,
      method: c.req.method,
    });

    return c.json(response, 500);
  }
}
