package com.collab.api.auth;

import com.collab.api.auth.dto.AuthResponse;
import com.collab.api.auth.dto.GuestTokenResponse;
import com.collab.api.auth.dto.LoginRequest;
import com.collab.api.auth.dto.RegisterRequest;
import com.collab.api.auth.event.UserRegisteredEvent;
import com.collab.api.shared.exception.ApiException;
import com.collab.api.shared.security.JwtService;
import com.collab.api.user.User;
import com.collab.api.user.UserRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Handles user registration and login for the password-based auth flow.
 *
 * <p>This service is deliberately narrow: it only knows about credentials and
 * identity. Cross-cutting concerns (e.g., sending a welcome email) are handled
 * by separate listeners that subscribe to {@link UserRegisteredEvent} — this
 * service never imports or calls them directly.
 */
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher eventPublisher;
    private final JwtService jwtService;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            ApplicationEventPublisher eventPublisher,
            JwtService jwtService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.eventPublisher = eventPublisher;
        this.jwtService = jwtService;
    }

    /**
     * Registers a new user with a BCrypt-hashed password and returns a signed JWT.
     *
     * <p>The JWT is generated after the entity is persisted so that the user's
     * UUID (assigned by the DB) is available as the {@code sub} claim.
     *
     * <p>Publishes {@link UserRegisteredEvent} after the user is persisted so
     * that the database write and any side effects (email, audit) are decoupled.
     *
     * @throws ApiException {@code 409 CONFLICT} if the email is already in use.
     */
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ApiException(HttpStatus.CONFLICT, "Email already in use");
        }

        User user = User.builder()
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .displayName(request.displayName())
                .build();

        userRepository.save(user);

        // Token is generated after save so user.getId() is populated.
        String token = jwtService.generateToken(user);

        // Publish the event AFTER the entity is saved but still within the
        // transaction. Listeners using @TransactionalEventListener(AFTER_COMMIT)
        // will fire once the commit succeeds, avoiding side effects on rollback.
        eventPublisher.publishEvent(new UserRegisteredEvent(user.getId(), user.getEmail()));

        return new AuthResponse(token, user.getId(), user.getDisplayName());
    }

    /**
     * Authenticates a user by verifying their BCrypt password hash and returns
     * a signed JWT. No database write is performed — the token is stateless.
     *
     * @throws ApiException {@code 401 UNAUTHORIZED} if credentials are invalid.
     *                      A generic message is used intentionally to avoid
     *                      leaking whether the email exists in the system.
     */
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }

        String token = jwtService.generateToken(user);

        return new AuthResponse(token, user.getId(), user.getDisplayName());
    }

    /**
     * Issues a short-lived guest JWT for an anonymous session.
     *
     * <p>No user account or credentials are required. The generated guest ID is
     * prefixed with {@code "guest-"} to distinguish it from user UUIDs in logs
     * and the Node sync-server's awareness state.
     *
     * @return A {@link GuestTokenResponse} containing the signed JWT and the guest ID.
     */
    public GuestTokenResponse issueGuestToken() {
        String guestId = "guest-" + UUID.randomUUID();
        String token = jwtService.generateGuestToken(guestId);
        return new GuestTokenResponse(token, guestId);
    }
}
