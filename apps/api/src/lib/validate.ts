import type { z } from 'zod';
import { errors } from '@vibeplay/shared';

/** Parse request data with a zod schema; throws a 422 ApiError with field details. */
export function parse<TSchema extends z.ZodType>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw errors.validation(
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
