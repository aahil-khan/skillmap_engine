# Backend Error Handling Implementation Guide

## ✅ What's Been Implemented

We've implemented a comprehensive error handling system for the SkillMap Engine backend that includes:

### 1. Custom Error Classes (`utils/errors.js`)

- **AppError**: Base error class for all custom errors
- **ValidationError**: For invalid user input (400)
- **AuthenticationError**: For authentication failures (401)
- **AuthorizationError**: For permission issues (403)
- **NotFoundError**: For missing resources (404)
- **ConflictError**: For duplicate resources (409)
- **RateLimitError**: For rate limit exceeded (429)
- **ExternalServiceError**: For OpenAI/Qdrant failures (502)
- **DatabaseError**: For database operations (500)
- **FileProcessingError**: For file upload/processing issues (422)

### 2. Structured Logging (`utils/logger.js`)

Replaces all `console.log` and `console.error` with:

- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Structured Format**: JSON in production, human-readable in development
- **Request Tracking**: Includes request ID, user ID, duration
- **File Logging**: Optional log files with daily rotation
- **External Service Tracking**: Logs OpenAI and Qdrant calls

### 3. Middleware (`middleware/`)

**Error Handler** (`errorHandler.js`):
- Catches all errors and sends standardized responses
- Handles Multer, JSON parsing, Supabase, and OpenAI errors
- Distinguishes operational vs programming errors
- Provides detailed errors in development, user-friendly in production

**Request Logger** (`requestLogger.js`):
- Adds unique request IDs to all requests
- Logs all incoming requests and responses
- Tracks slow requests (>3 seconds)
- Includes X-Request-Id header in responses

### 4. Updated Routes

All routes now use:
- `asyncHandler` wrapper for automatic error handling
- Proper error classes instead of manual status codes
- Logger instead of console.log
- Validation checks that throw ValidationError

## 🚀 How to Use

### Environment Variables

Add to your `.env` file:

```bash
# Logging Configuration
LOG_LEVEL=INFO          # DEBUG, INFO, WARN, ERROR
LOG_TO_FILE=false       # true to enable file logging
NODE_ENV=development    # development or production

# CORS Configuration
CORS_ORIGIN=http://localhost:3000  # Comma-separated for multiple origins
```

### Using Error Classes in Your Code

```javascript
import { ValidationError, NotFoundError, ExternalServiceError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// Validation error
if (!username) {
  throw new ValidationError('Username is required');
}

// Not found error
if (!user) {
  throw new NotFoundError('User profile');
}

// External service error
try {
  const result = await openai.chat.completions.create(...);
} catch (error) {
  throw new ExternalServiceError('OpenAI', error.message, error);
}

// Logging
logger.info('Processing started', { userId, requestId: req.id });
logger.error('Operation failed', error, { userId });
logger.debug('Debug info', { data });
```

### Wrapping Route Handlers

All async routes should use `asyncHandler`:

```javascript
app.post('/my-route', authenticate, asyncHandler(async (req, res) => {
  // Your code here
  // Any thrown error will be caught automatically
  const result = await someAsyncOperation();
  res.json({ success: true, result });
}));
```

## 📊 Error Response Format

### Development
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Username is required",
    "details": "Additional technical details",
    "stack": "Error stack trace"
  }
}
```

### Production
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Username is required"
  }
}
```

## 📝 Log Format

### Development (Console)
```
[2025-10-09T12:34:56.789Z] [INFO] Processing resume
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "requestId": "abc-123-def",
  "filename": "resume.pdf"
}
```

### Production (JSON)
```json
{
  "timestamp": "2025-10-09T12:34:56.789Z",
  "level": "INFO",
  "message": "Processing resume",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "requestId": "abc-123-def",
  "filename": "resume.pdf"
}
```

## 🔍 Request Tracking

Every request now includes:
- **X-Request-Id** header in response
- **Request logging** with timing
- **Slow request detection** (>3s threshold)
- **User context** in all logs

Example tracking flow:
```
[INFO] HTTP Request { method: 'POST', path: '/upload-resume', requestId: 'abc-123', userId: 'user-456' }
[INFO] Processing uploaded file { filename: 'resume.pdf', userId: 'user-456', requestId: 'abc-123' }
[INFO] Resume processed successfully { userId: 'user-456', requestId: 'abc-123' }
[INFO] HTTP Response { statusCode: 200, duration: '2341ms', requestId: 'abc-123' }
```

## ⚠️ Breaking Changes

### Before
```javascript
if (!file) {
  return res.status(400).json({ error: 'No file uploaded' });
}
console.log('Processing file');
```

### After
```javascript
if (!file) {
  throw new ValidationError('No file uploaded');
}
logger.info('Processing file', { filename: file.name, requestId: req.id });
```

## 🎯 Best Practices

1. **Always throw errors, don't return responses** in wrapped handlers
2. **Use appropriate error classes** for different scenarios
3. **Include context in logs** (userId, requestId, relevant data)
4. **Log external service calls** with duration tracking
5. **Don't log sensitive data** (passwords, tokens, personal info)

## 🧪 Testing Error Handling

### Test Validation Error
```bash
curl -X POST http://localhost:5005/user-profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
# Should return 400 with ValidationError
```

### Test Not Found Error
```bash
curl -X GET http://localhost:5005/nonexistent-route
# Should return 404 with available endpoints list
```

### Check Request ID
```bash
curl -I http://localhost:5005/health
# Look for X-Request-Id in response headers
```

## 📁 File Logging

When `LOG_TO_FILE=true`, logs are saved to:
- `logs/YYYY-MM-DD.log` - All logs
- `logs/YYYY-MM-DD-error.log` - Error logs only

Log files are created automatically in the `logs/` directory.

## 🔄 Migration Checklist

- [x] Replace `console.log` with `logger.info/debug`
- [x] Replace `console.error` with `logger.error`
- [x] Replace manual status code responses with error classes
- [x] Wrap all async routes with `asyncHandler`
- [x] Add validation checks that throw errors
- [x] Include request context in logs
- [x] Add authentication to unprotected routes
- [x] Update environment variables
- [ ] Update frontend to handle new error format
- [ ] Add monitoring/alerting for production errors
- [ ] Set up log aggregation (optional)

## 🚦 Next Steps

1. **Update Frontend**: Modify error handling to work with new format
2. **Add Tests**: Write unit tests for error scenarios
3. **Set up Monitoring**: Integrate with Sentry/DataDog for error tracking
4. **Add Validation Schemas**: Use Zod for comprehensive input validation
5. **Document API Errors**: Add error codes to API documentation

## 💡 Tips

- Set `LOG_LEVEL=DEBUG` during development for verbose logging
- Set `LOG_LEVEL=WARN` in production to reduce noise
- Use request IDs to trace requests across logs
- Monitor slow request logs to identify performance issues
- Keep error messages user-friendly in production

---

**Last Updated**: October 9, 2025  
**Version**: 1.0.0
