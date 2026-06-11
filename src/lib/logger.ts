import { config } from '@/config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default log levels depending on environment
const CURRENT_LOG_LEVEL: LogLevel = config.env.isProd ? 'info' : 'debug';
const isServer = typeof window === 'undefined';

/**
 * Recursively redacts sensitive variables from log parameters
 */
function redact(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  // Sensitive keys we do NOT want leaked in serverless log drains
  const sensitiveKeys = [
    'password',
    'token',
    'serviceRoleKey',
    'anonKey',
    'credentials',
    'otp',
    'secret',
    'authorization'
  ];

  if (Array.isArray(obj)) {
    return obj.map(item => redact(item));
  }

  const copy: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        copy[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        copy[key] = redact(obj[key]);
      } else {
        copy[key] = obj[key];
      }
    }
  }

  return copy;
}

function formatMeta(meta: any[]): any {
  if (meta.length === 0) return undefined;
  if (meta.length === 1) return redact(meta[0]);
  return redact(meta);
}

const logger = {
  log(level: LogLevel, message: string, ...meta: any[]) {
    // Only output if severity is above current configured level
    if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[CURRENT_LOG_LEVEL]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const metaData = formatMeta(meta);

    if (isServer) {
      if (config.env.isProd) {
        // Production: Structured JSON logging (ideal for Vercel Log Drains / Datadog / ELK)
        const logPayload = {
          timestamp,
          level: level.toUpperCase(),
          message,
          ...(metaData !== undefined ? { context: metaData } : {}),
        };
        console[level](JSON.stringify(logPayload));
      } else {
        // Development: Readable, colored console strings
        const prefix = {
          debug: '\x1b[36m[DEBUG]\x1b[0m',
          info: '\x1b[32m[INFO]\x1b[0m',
          warn: '\x1b[33m[WARN]\x1b[0m',
          error: '\x1b[31m[ERROR]\x1b[0m',
        }[level];
        
        if (metaData !== undefined) {
          console[level](`${prefix} ${timestamp} - ${message}`, metaData);
        } else {
          console[level](`${prefix} ${timestamp} - ${message}`);
        }
      }
    } else {
      // Browser Console: Pretty color-coded tag matching the level
      if (!config.env.isProd || level !== 'debug') {
        const prefix = `[${level.toUpperCase()}]`;
        const style = {
          debug: 'color: #06b6d4; font-weight: bold;',
          info: 'color: #10b981; font-weight: bold;',
          warn: 'color: #f59e0b; font-weight: bold;',
          error: 'color: #ef4444; font-weight: bold;',
        }[level];

        if (metaData !== undefined) {
          console[level](`%c${prefix}%c ${message}`, style, '', metaData);
        } else {
          console[level](`%c${prefix}%c ${message}`, style, '');
        }
      }
    }
  },

  debug(message: string, ...meta: any[]) {
    this.log('debug', message, ...meta);
  },

  info(message: string, ...meta: any[]) {
    this.log('info', message, ...meta);
  },

  warn(message: string, ...meta: any[]) {
    this.log('warn', message, ...meta);
  },

  error(message: string, ...meta: any[]) {
    this.log('error', message, ...meta);
  },
};

export default logger;
