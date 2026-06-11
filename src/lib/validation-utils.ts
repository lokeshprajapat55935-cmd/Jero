import { z } from 'zod';
import { createErrorResponse } from './api-utils';

/**
 * Validate request body against a schema
 */
export async function validateRequest<T>(request: Request, schema: z.Schema<T>): Promise<{ data?: T; error?: any }> {
  try {
    const body = await request.json();
    const validatedData = schema.parse(body);
    return { data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: createErrorResponse('Validation error', 400, error.issues) };
    }
    return { error: createErrorResponse('Invalid request body', 400) };
  }
}
