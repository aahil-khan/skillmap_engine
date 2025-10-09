/**
 * Global Error Handler Middleware
 * Catches all errors and sends standardized responses
 */

import logger from '../utils/logger.js';
import { AppError, createErrorResponse, isOperationalError } from '../utils/errors.js';

/**
 * Error handler middleware
 * Should be the last middleware in the chain
 */
export function errorHandler(error, req, res, next) {
  // Log the error
  logger.error('Error occurred', error, {
    requestId: req.id,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  });

  // Default to 500 server error
  let statusCode = 500;
  let errorResponse;

  // Handle operational errors (expected errors)
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorResponse = error.toJSON();
  } 
  // Handle Multer file upload errors
  else if (error.name === 'MulterError') {
    statusCode = 400;
    errorResponse = {
      success: false,
      error: {
        code: 'FILE_UPLOAD_ERROR',
        message: error.message,
      }
    };
  }
  // Handle JSON parsing errors
  else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    statusCode = 400;
    errorResponse = {
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      }
    };
  }
  // Handle Supabase errors
  else if (error.code && error.code.startsWith('PGRST')) {
    statusCode = 500;
    errorResponse = {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      }
    };
  }
  // Handle OpenAI errors
  else if (error.name === 'OpenAIError' || error.type === 'invalid_request_error') {
    statusCode = 502;
    errorResponse = {
      success: false,
      error: {
        code: 'OPENAI_ERROR',
        message: 'AI service error',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      }
    };
  }
  // Handle all other errors (programming errors)
  else {
    statusCode = 500;
    errorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' 
          ? 'An unexpected error occurred. Please try again later.'
          : error.message,
        ...(process.env.NODE_ENV === 'development' && { 
          details: error.stack 
        })
      }
    };

    // For programming errors, we should be alerted
    if (!isOperationalError(error)) {
      logger.error('UNHANDLED ERROR - NEEDS ATTENTION', error, {
        requestId: req.id,
        stack: error.stack,
      });
    }
  }

  // Send response
  res.status(statusCode).json(errorResponse);
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors and pass to error handler
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 * Should be placed before error handler middleware
 */
export function notFoundHandler(req, res, next) {
  const error = {
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
      availableEndpoints: [
        'GET /health',
        'POST /upload-resume',
        'POST /user-profile',
        'POST /analyze-skill-gaps',
        'POST /search-skills',
        'POST /convert-to-standalone',
        'POST /leetcode-stats',
        'GET /ats-score',
        'GET /skills',
        'GET /experience',
      ]
    }
  };

  logger.warn('Route not found', {
    requestId: req.id,
    method: req.method,
    path: req.path,
  });

  res.status(404).json(error);
}

/**
 * Request timeout handler
 */
export function timeoutHandler(timeoutMs = 30000) {
  return (req, res, next) => {
    // Set timeout
    req.setTimeout(timeoutMs, () => {
      const error = {
        success: false,
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Request timeout - operation took too long',
        }
      };
      
      logger.warn('Request timeout', {
        requestId: req.id,
        path: req.path,
        timeout: timeoutMs,
      });

      if (!res.headersSent) {
        res.status(504).json(error);
      }
    });

    next();
  };
}
