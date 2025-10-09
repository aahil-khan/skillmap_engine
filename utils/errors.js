/**
 * Custom Error Classes for SkillMap Engine
 * Provides standardized error handling across the application
 */

/**
 * Base Application Error
 * All custom errors extend from this class
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguishes operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(process.env.NODE_ENV === 'development' && this.details && { details: this.details }),
      }
    };
  }
}

/**
 * Validation Error - 400 Bad Request
 * Used when user input is invalid
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication Error - 401 Unauthorized
 * Used when user is not authenticated
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Authorization Error - 403 Forbidden
 * Used when user is authenticated but not authorized
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions', details = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

/**
 * Not Found Error - 404
 * Used when a resource is not found
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource', details = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
  }
}

/**
 * Conflict Error - 409
 * Used when there's a conflict (e.g., duplicate resource)
 */
export class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * Rate Limit Error - 429
 * Used when rate limit is exceeded
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_ERROR', { retryAfter });
  }
}

/**
 * External Service Error - 502 Bad Gateway
 * Used when external services (OpenAI, Qdrant, etc.) fail
 */
export class ExternalServiceError extends AppError {
  constructor(serviceName, message, details = null) {
    super(`${serviceName} service error: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', {
      service: serviceName,
      originalError: details
    });
  }
}

/**
 * Database Error - 500
 * Used when database operations fail
 */
export class DatabaseError extends AppError {
  constructor(message, details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * File Processing Error - 422
 * Used when file processing fails
 */
export class FileProcessingError extends AppError {
  constructor(message, details = null) {
    super(message, 422, 'FILE_PROCESSING_ERROR', details);
  }
}

/**
 * Helper function to create consistent error responses
 */
export function createErrorResponse(error, includeStack = false) {
  const response = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
    }
  };

  // Only include details in development
  if (process.env.NODE_ENV === 'development') {
    if (error.details) {
      response.error.details = error.details;
    }
    if (includeStack && error.stack) {
      response.error.stack = error.stack;
    }
  }

  return response;
}

/**
 * Helper to check if error is operational (expected) or programming error
 */
export function isOperationalError(error) {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
