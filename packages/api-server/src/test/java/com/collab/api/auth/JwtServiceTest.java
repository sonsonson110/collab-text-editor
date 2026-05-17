package com.collab.api.auth;

import com.collab.api.shared.config.JwtProperties;
import com.collab.api.shared.exception.ApiException;
import com.collab.api.shared.security.JwtService;
import com.collab.api.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import javax.crypto.SecretKey;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link JwtService}.
 *
 * <p>No Spring context is loaded — this is a plain JUnit test class. Each test
 * creates its own {@link JwtService} instance directly to keep startup time
 * near-zero and to validate behaviour in complete isolation.
 *
 * <p>A fixed 256-bit Base64 key is used throughout so the tests are deterministic
 * and reproducible across environments.
 */
class JwtServiceTest {

    /**
     * A stable 256-bit (32-byte) Base64-encoded key used only in tests.
     * Never commit real secrets — this value is intentionally synthetic.
     */
    private static final String TEST_SECRET =
            "dGVzdC1zZWNyZXQta2V5LXRoYXQtaXMtMzItYnl0ZXMhIQ==";

    private static final long ONE_HOUR_MS = 3_600_000L;
    private static final long ONE_DAY_MS  = 86_400_000L;

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        var properties = new JwtProperties(TEST_SECRET, ONE_HOUR_MS, ONE_DAY_MS);
        jwtService = new JwtService(properties);
    }

    // ── generateToken ─────────────────────────────────────────────────────────

    @Test
    void generateToken_validUser_returnsSignedJwt() {
        var user = buildUser("alice@example.com");

        var token = jwtService.generateToken(user);

        // Must be a compact three-part JWT (header.payload.signature)
        assertThat(token).matches("^[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_.+/=]*$");

        Claims claims = jwtService.validateToken(token);
        assertThat(jwtService.extractSubject(claims)).isEqualTo(user.getId().toString());
        assertThat(jwtService.extractRole(claims)).isEqualTo(JwtService.ROLE_AUTHENTICATED);
        assertThat(claims.get("email", String.class)).isEqualTo("alice@example.com");
    }

    // ── generateGuestToken ────────────────────────────────────────────────────

    @Test
    void generateGuestToken_returnsGuestRole() {
        var guestId = "guest-" + UUID.randomUUID();

        var token = jwtService.generateGuestToken(guestId);

        Claims claims = jwtService.validateToken(token);
        assertThat(jwtService.extractSubject(claims)).isEqualTo(guestId);
        assertThat(jwtService.extractRole(claims)).isEqualTo(JwtService.ROLE_GUEST);
        // Guest tokens must not carry an email claim
        assertThat(claims.get("email", String.class)).isNull();
    }

    // ── validateToken ─────────────────────────────────────────────────────────

    @Test
    void validateToken_expiredToken_throwsApiException() {
        // Build a token that expired 1 second ago using the same key
        var token = buildExpiredToken();

        assertThatThrownBy(() -> jwtService.validateToken(token))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getStatus())
                        .isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void validateToken_tamperedSignature_throwsApiException() {
        var user = buildUser("bob@example.com");
        var token = jwtService.generateToken(user);

        // Corrupt the last character of the signature segment
        var tamperedToken = token.substring(0, token.length() - 1) + "X";

        assertThatThrownBy(() -> jwtService.validateToken(tamperedToken))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getStatus())
                        .isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /** Builds a minimal {@link User} with a stable UUID and the given email. */
    private User buildUser(String email) {
        var user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(email);
        user.setDisplayName("Test User");
        return user;
    }

    /**
     * Constructs a syntactically valid but already-expired JWT using the same
     * signing key as the {@link JwtService} under test, so the expiry check
     * path is exercised independently from any signature failure.
     */
    private String buildExpiredToken() {
        byte[] keyBytes = Base64.getDecoder().decode(TEST_SECRET);
        SecretKey key = Keys.hmacShaKeyFor(keyBytes);

        long past = System.currentTimeMillis() - 5_000L; // 5 seconds ago
        return Jwts.builder()
                .subject("expired-user")
                .claim(JwtService.CLAIM_ROLE, JwtService.ROLE_AUTHENTICATED)
                .issuedAt(new Date(past - 1_000L))
                .expiration(new Date(past))
                .signWith(key)
                .compact();
    }
}
