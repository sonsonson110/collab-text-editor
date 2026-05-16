package com.collab.api.auth;

import com.collab.api.auth.dto.AuthResponse;
import com.collab.api.auth.dto.GuestTokenResponse;
import com.collab.api.auth.dto.LoginRequest;
import com.collab.api.auth.dto.RegisterRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for the password-based authentication flow and guest sessions.
 *
 * <p>This controller is intentionally thin: it validates the request body,
 * delegates all logic to {@link AuthService}, and maps the result to an
 * HTTP response. No business logic lives here.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * Registers a new user account.
     *
     * <p>{@code @Valid} triggers Bean Validation on the request body. If any
     * constraint fails, {@link com.collab.api.shared.exception.GlobalExceptionHandler}
     * intercepts the {@code MethodArgumentNotValidException} and returns a
     * structured {@code 400} response before this method body executes.
     *
     * @return {@code 201 Created} with the auth token and user details.
     */
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Authenticates an existing user.
     *
     * @return {@code 200 OK} with the auth token and user details.
     */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    /**
     * Issues a short-lived guest JWT for unauthenticated users.
     *
     * <p>No account or credentials are required. The returned token is signed
     * with {@code role=GUEST} and expires after {@code app.jwt.guest-expiration-ms}.
     * This endpoint is public — no {@code Authorization} header needed.
     *
     * @return {@code 200 OK} with the guest JWT and the generated guest identifier.
     */
    @PostMapping("/guest")
    public ResponseEntity<GuestTokenResponse> guest() {
        GuestTokenResponse response = authService.issueGuestToken();
        return ResponseEntity.ok(response);
    }
}
