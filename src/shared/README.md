# Shared Modules

This directory contains shared modules used across Lambda functions.

## Logger Module

The Logger module provides structured logging with automatic sanitization of sensitive data.

### Features

- **Structured JSON Logging**: All logs are output in JSON format for CloudWatch
- **Configurable Log Levels**: DEBUG, INFO, WARN, ERROR
- **Automatic Sanitization**: Removes sensitive data (tokens, keys, payloads) from logs
- **Context Support**: Include requestId, timestamp, functionName in all logs
- **Environment Variable Support**: Configure log level via `LOG_LEVEL` environment variable
- **Performance Metrics**: Log execution time and other metrics

### Usage

```typescript
import { createLogger, LogLevel, LogContext } from './shared/logger';

// Create logger instance
const logger = createLogger(LogLevel.INFO);

// Basic logging
logger.info('Lambda function invoked');
logger.warn('Warning message');
logger.error('Error occurred', new Error('Something went wrong'));
logger.debug('Debug information'); // Only logs if level is DEBUG

// Logging with context
const context: LogContext = {
  requestId: 'abc-123-def-456',
  timestamp: new Date().toISOString(),
  functionName: 'lambda-encryption',
  operation: 'encrypt',
  executionTime: 250
};

logger.info('Operation completed', context);
```

### Sanitization

The logger automatically sanitizes sensitive fields:

- `payload`, `token`, `token_jwe`, `jweToken`
- `privateKey`, `publicKey`, `key`
- `secret`, `password`, `passphrase`
- `authorization`, `auth`, `bearer`
- JWK private key components: `d`, `p`, `q`, `dp`, `dq`, `qi`
- Credit card data: `ssn`, `creditCard`, `cvv`, `pin`

Sensitive fields are replaced with `[REDACTED]` in log output.

### Configuration

Set the log level using environment variables:

```bash
LOG_LEVEL=DEBUG  # Show all logs
LOG_LEVEL=INFO   # Show INFO, WARN, ERROR (default)
LOG_LEVEL=WARN   # Show WARN, ERROR
LOG_LEVEL=ERROR  # Show ERROR only
```

### Requirements Validation

This module validates the following requirements:

- **6.1**: Logs each invocation with timestamp, request ID and result
- **6.2**: Logs error type and context without exposing sensitive data
- **6.3**: Logs performance metrics including execution time
- **6.5**: Does not log Payload content, Token_JWE, or encryption keys
- **9.4**: Adjusts log level based on LOG_LEVEL environment variable

### Testing

Run tests:

```bash
npm test -- src/shared/logger.test.ts
```

See `logger.example.ts` for more usage examples.
