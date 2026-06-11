import { NextResponse } from 'next/server';
import { z } from 'zod';
import logger from '@/lib/logger';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function withApiErrorHandler(
  handler: (request: Request, ...args: any[]) => Promise<Response>
) {
  return async (request: Request, ...args: any[]): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error: any) {
      const url = request.url;
      const method = request.method;

      if (error instanceof ApiError || error.name === 'ApiError') {
        logger.error(`API Error [${method} ${url}]: ${error.message}`, error.details);
        return NextResponse.json(
          { error: error.message, details: error.details },
          { status: error.statusCode || error.status || 400 }
        );
      }

      if (error instanceof z.ZodError) {
        logger.warn(`Validation Error [${method} ${url}]`, error.flatten());
        return NextResponse.json(
          { error: 'Validation Error', details: error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      // Handle Supabase errors
      if (error.code && error.message) {
        logger.error(`Supabase Error [${method} ${url}]: ${error.message}`, error);
        return NextResponse.json(
          { error: 'Database error occurred' },
          { status: 500 }
        );
      }

      // Unhandled Internal Server Errors
      logger.error(`Unhandled Internal Error [${method} ${url}]`, error);
      return NextResponse.json(
        { error: 'Internal server error occurred. Please try again later.' },
        { status: 500 }
      );
    }
  };
}
