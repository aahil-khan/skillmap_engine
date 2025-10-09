/**
 * Request Logger Middleware
 * Logs all incoming requests and responses with timing
 */

import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Add request ID to all requests
 */
export function requestId(req, res, next) {
  req.id = uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/**
 * Log incoming requests
 */
export function requestLogger(req, res, next) {
  // Record start time
  req.startTime = Date.now();

  // Log request
  logger.request(req);

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - req.startTime;
    logger.response(req, res, duration);
    res.send = originalSend;
    return res.send(data);
  };

  next();
}

/**
 * Log slow requests
 */
export function slowRequestLogger(thresholdMs = 3000) {
  return (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      if (duration > thresholdMs) {
        logger.warn('Slow request detected', {
          requestId: req.id,
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          threshold: `${thresholdMs}ms`,
        });
      }
    });

    next();
  };
}
