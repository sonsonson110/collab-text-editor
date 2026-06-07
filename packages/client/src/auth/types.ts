/**
 * Typed mirror of the Spring Boot {@code ErrorResponse} record returned by
 * {@code GlobalExceptionHandler} for all non-2xx responses.
 *
 * - Simple domain errors (401, 409, 500) populate only `status`, `error`, and `message`.
 * - Bean Validation failures (400) additionally include `fieldErrors` — one entry
 *   per constraint violation, keyed by the request field name.
 */
export interface ApiErrorResponse {
  status: number;
  /** HTTP status name, e.g. "BAD_REQUEST", "CONFLICT". */
  error: string;
  /** Short human-readable description of the error. */
  message: string;
  /**
   * Per-field constraint violations. Present only when the server returns a
   * 400 Validation failure; absent (undefined) for all other error types.
   */
  fieldErrors?: { field: string; message: string }[];
}
