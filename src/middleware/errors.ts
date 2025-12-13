import { Context } from 'hono';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function errorHandler(err: Error, c: Context) {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          message: err.message,
          statusCode: err.statusCode,
        },
      },
      err.statusCode
    );
  }

  // Unhandled errors
  return c.json(
    {
      error: {
        message: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : err.message,
        statusCode: 500,
      },
    },
    500
  );
}
