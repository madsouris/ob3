import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ApiErrorCode =
  | 'invalid_token'
  | 'host_not_allowed'
  | 'cross_origin'
  | 'invalid_json'
  | 'validation_failed'
  | 'invalid_id'
  | 'unknown_id'
  | 'unknown_issue'
  | 'unknown_type'
  | 'file_changed_on_disk'
  | 'write_locked'
  | 'not_a_task'
  | 'invalid_move'
  | 'invalid_duplicate'
  | 'conflict'
  | 'not_found'
  | 'payload_too_large'
  | 'path_escape'
  | 'config_invalid'
  | 'internal';

/** Every failure leaves the API as `{ error: { code, message, details? } }` (docs/07). */
export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const errorBody = (code: ApiErrorCode, message: string, details?: unknown): unknown => ({
  error: {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  },
});
