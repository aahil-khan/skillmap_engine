/**
 * Logger Utility for SkillMap Engine
 * Provides structured logging with different levels
 * Replaces console.log/console.error throughout the application
 */

import fs from 'fs';
import path from 'path';

// Log levels
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

// Color codes for console output
const COLORS = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[90m', // Gray
  RESET: '\x1b[0m',
};

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'INFO';
    this.environment = process.env.NODE_ENV || 'development';
    this.logToFile = process.env.LOG_TO_FILE === 'true';
    
    // Create logs directory if logging to file
    if (this.logToFile) {
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    }
  }

  /**
   * Check if log level should be logged
   */
  shouldLog(level) {
    const levels = Object.keys(LOG_LEVELS);
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  /**
   * Format log message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logObject = {
      timestamp,
      level,
      message,
      ...meta,
    };

    // In production, return JSON format
    if (this.environment === 'production') {
      return JSON.stringify(logObject);
    }

    // In development, return human-readable format
    const color = COLORS[level] || COLORS.RESET;
    let formattedMessage = `${color}[${timestamp}] [${level}]${COLORS.RESET} ${message}`;
    
    if (Object.keys(meta).length > 0) {
      formattedMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }

    return formattedMessage;
  }

  /**
   * Write log to file
   */
  writeToFile(level, formattedMessage) {
    if (!this.logToFile) return;

    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(process.cwd(), 'logs', `${date}.log`);
    const errorLogFile = path.join(process.cwd(), 'logs', `${date}-error.log`);

    // Write to main log file
    fs.appendFileSync(logFile, formattedMessage + '\n');

    // Write errors to separate error log file
    if (level === 'ERROR') {
      fs.appendFileSync(errorLogFile, formattedMessage + '\n');
    }
  }

  /**
   * Core logging method
   */
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    
    // Write to console
    if (level === 'ERROR') {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    // Write to file if enabled
    this.writeToFile(level, formattedMessage);
  }

  /**
   * Error level logging
   */
  error(message, error = null, meta = {}) {
    const errorMeta = {
      ...meta,
      ...(error && {
        error: {
          message: error.message,
          code: error.code,
          stack: this.environment === 'development' ? error.stack : undefined,
        }
      })
    };
    this.log(LOG_LEVELS.ERROR, message, errorMeta);
  }

  /**
   * Warning level logging
   */
  warn(message, meta = {}) {
    this.log(LOG_LEVELS.WARN, message, meta);
  }

  /**
   * Info level logging
   */
  info(message, meta = {}) {
    this.log(LOG_LEVELS.INFO, message, meta);
  }

  /**
   * Debug level logging
   */
  debug(message, meta = {}) {
    this.log(LOG_LEVELS.DEBUG, message, meta);
  }

  /**
   * Log HTTP request
   */
  request(req, meta = {}) {
    this.info('HTTP Request', {
      method: req.method,
      path: req.path,
      requestId: req.id,
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      ...meta,
    });
  }

  /**
   * Log HTTP response
   */
  response(req, res, duration, meta = {}) {
    const level = res.statusCode >= 400 ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO;
    this.log(level, 'HTTP Response', {
      method: req.method,
      path: req.path,
      requestId: req.id,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
      ...meta,
    });
  }

  /**
   * Log external service call
   */
  externalCall(serviceName, operation, meta = {}) {
    this.info(`External Service Call: ${serviceName}`, {
      service: serviceName,
      operation,
      ...meta,
    });
  }

  /**
   * Log external service response
   */
  externalResponse(serviceName, success, duration, meta = {}) {
    const level = success ? LOG_LEVELS.INFO : LOG_LEVELS.ERROR;
    this.log(level, `External Service Response: ${serviceName}`, {
      service: serviceName,
      success,
      duration: `${duration}ms`,
      ...meta,
    });
  }

  /**
   * Log database query
   */
  dbQuery(operation, table, meta = {}) {
    this.debug('Database Query', {
      operation,
      table,
      ...meta,
    });
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;
