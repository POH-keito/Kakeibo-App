/**
 * Custom error classes for unified error handling
 */

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(400, message, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '認証が必要です', code = 'UNAUTHORIZED') {
    super(401, message, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'アクセス権限がありません', code = 'FORBIDDEN') {
    super(403, message, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'リソースが見つかりません', code = 'NOT_FOUND') {
    super(404, message, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'データの競合が発生しました', code = 'CONFLICT') {
    super(409, message, code);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'サーバーエラーが発生しました', code = 'INTERNAL_SERVER_ERROR') {
    super(500, message, code);
  }
}

/**
 * Error response format
 */
export interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    statusCode: number;
    details?: unknown;
  };
}
