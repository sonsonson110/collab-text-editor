package com.collab.api.shared.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;

/**
 * Centralised exception-to-HTTP-response mapper for all REST controllers.
 *
 * <p>{@code @RestControllerAdvice} makes this class intercept exceptions thrown
 * by any {@code @RestController} in the application — equivalent to global
 * exception middleware in ASP.NET Core. Controllers themselves never deal with
 * error serialization or status codes.
 *
 * <p>Handler priority (Spring evaluates in specificity order):
 * <ol>
 *   <li>{@link ApiException} — known domain errors with an explicit HTTP status.</li>
 *   <li>{@link MethodArgumentNotValidException} — Bean Validation ({@code @Valid}) failures.</li>
 *   <li>{@link Exception} — catch-all; always returns 500 without leaking internals.</li>
 * </ol>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Handles all known domain errors thrown via {@link ApiException}.
     *
     * <p>The exception already carries the intended HTTP status, so this handler
     * simply mirrors it back in the response.
     */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex) {
        HttpStatus status = ex.getStatus();
        ErrorResponse body = ErrorResponse.of(status.value(), status.name(), ex.getMessage());
        return ResponseEntity.status(status).body(body);
    }

    /**
     * Handles {@code @Valid} annotation failures on request bodies.
     *
     * <p>Collects every field-level constraint violation into a flat list so the
     * client can display all problems at once rather than fixing them one at a time.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException ex) {
        List<ErrorResponse.FieldError> fieldErrors = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(fe -> new ErrorResponse.FieldError(fe.getField(), fe.getDefaultMessage()))
                .toList();

        ErrorResponse body = new ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.name(),
                "Validation failed",
                fieldErrors
        );
        return ResponseEntity.badRequest().body(body);
    }

    /**
     * Handles method-level security violations (@PreAuthorize).
     *
     * <p>Normally handled by Spring Security's ExceptionTranslationFilter, but
     * our catch-all Exception handler intercepts it first. We explicitly map it
     * to 403 Forbidden.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDeniedException(AccessDeniedException ex) {
        ErrorResponse body = ErrorResponse.of(
                HttpStatus.FORBIDDEN.value(),
                HttpStatus.FORBIDDEN.name(),
                "Access denied"
        );
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    /**
     * Catch-all handler for any unhandled exception.
     *
     * <p>Logs the full stack trace server-side (essential for debugging) but
     * returns only a generic message to the client so internal details are never
     * leaked to callers.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpectedException(Exception ex) {
        log.error("Unhandled exception", ex);
        ErrorResponse body = ErrorResponse.of(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                HttpStatus.INTERNAL_SERVER_ERROR.name(),
                "An unexpected error occurred"
        );
        return ResponseEntity.internalServerError().body(body);
    }
}
