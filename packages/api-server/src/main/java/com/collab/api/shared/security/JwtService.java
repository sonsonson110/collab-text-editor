package com.collab.api.shared.security;

import com.collab.api.shared.config.JwtProperties;
import com.collab.api.shared.exception.ApiException;
import com.collab.api.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Base64;
import java.util.Date;

/**
 * Core JWT signing and validation service.
 *
 * <p>All JWT operations are stateless — no database is involved. The security
 * guarantee comes entirely from the cryptographic signature; callers only need
 * to trust the key.
 *
 * <p><b>Token claim layout:</b>
 * <pre>
 * {
 *   "sub":   "&lt;userId UUID | guestId string&gt;",
 *   "email": "&lt;email — omitted for guest tokens&gt;",
 *   "role":  "AUTHENTICATED | GUEST",
 *   "iat":   &lt;issued-at epoch seconds&gt;,
 *   "exp":   &lt;expiry epoch seconds&gt;
 * }
 * </pre>
 *
 * <p><b>ASP.NET Core equivalent:</b> {@code JwtSecurityTokenHandler.WriteToken()}
 * and {@code JwtSecurityTokenHandler.ValidateToken()}.
 */
@Service
public class JwtService {

    public static final String CLAIM_ROLE = "role";
    public static final String CLAIM_DISPLAY_NAME = "displayName";
    public static final String CLAIM_EMAIL = "email";

    /** Role value embedded in tokens for password/OAuth authenticated users. */
    public static final String ROLE_AUTHENTICATED = "AUTHENTICATED";
    public static final String ROLE_GUEST = "GUEST";

    private final SecretKey signingKey;
    private final long expirationMs;
    private final long guestExpirationMs;

    public JwtService(JwtProperties properties) {
        byte[] keyBytes = Base64.getDecoder().decode(properties.secret());
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        this.expirationMs = properties.expirationMs();
        this.guestExpirationMs = properties.guestExpirationMs();
    }

    /**
     * Generates a signed JWT for an authenticated user.
     *
     * @param user The user to encode into the token.
     * @return A compact signed JWT string.
     */
    public String generateToken(User user) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim( CLAIM_EMAIL, user.getEmail())
                .claim(CLAIM_ROLE, ROLE_AUTHENTICATED)
                .claim(CLAIM_DISPLAY_NAME, user.getDisplayName())
                .issuedAt(new Date(now))
                .expiration(new Date(now + expirationMs))
                .signWith(signingKey)
                .compact();
    }

    /**
     * Generates a short-lived signed JWT for an anonymous guest session.
     *
     * <p>Guest tokens carry no {@code email} claim and use a separate, typically
     * longer expiry window so guests can rejoin without re-authenticating.
     *
     * @param guestId A caller-supplied identifier (e.g. {@code "guest-<uuid>"}).
     * @return A compact signed JWT string.
     */
    public String generateGuestToken(String guestId) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(guestId)
                .claim(CLAIM_ROLE, ROLE_GUEST)
                .issuedAt(new Date(now))
                .expiration(new Date(now + guestExpirationMs))
                .signWith(signingKey)
                .compact();
    }

    /**
     * Validates a JWT and returns its claims.
     *
     * <p>Validation checks the signature and the expiry time. Any tampered or
     * expired token causes an {@link ApiException} with {@code 401 UNAUTHORIZED}
     * — the filter chain will reject the request before it reaches any controller.
     *
     * @param token The compact JWT string from the {@code Authorization} header.
     * @return Parsed and verified {@link Claims}.
     * @throws ApiException {@code 401} if the token is invalid or expired.
     */
    public Claims validateToken(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (JwtException | IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
    }

    /**
     * Extracts the subject ({@code sub}) claim, which is either a user UUID or
     * a guest identifier string.
     *
     * @param claims Verified claims from {@link #validateToken(String)}.
     * @return The {@code sub} claim value.
     */
    public String extractSubject(Claims claims) {
        return claims.getSubject();
    }

    /**
     * Extracts the {@code role} claim from verified token claims.
     *
     * @param claims Verified claims from {@link #validateToken(String)}.
     * @return {@link #ROLE_AUTHENTICATED} or {@link #ROLE_GUEST}.
     */
    public String extractRole(Claims claims) {
        return claims.get(CLAIM_ROLE, String.class);
    }

    /**
     * Generates a short-lived signed JWT ticket for connecting to a specific room.
     *
     * <p>Claim layout:
     * <pre>
     * {
     *   "sub":           "&lt;userId UUID | guestId string&gt;",
     *   "roomId":        "&lt;room UUID string&gt;",
     *   "effectiveRole": "OWNER | EDITOR | VIEWER",
     *   "isMember":      true | false,
     *   "type":          "room_ticket",
     *   "iat":           &lt;issued-at epoch seconds&gt;,
     *   "exp":           &lt;expiry epoch seconds (5 minutes)&gt;
     * }
     * </pre>
     *
     * <p>{@code isMember} is {@code true} for any user who is an explicit DB member of the room
     * (OWNER or present in the {@code room_members} table), and {@code false} for connections
     * granted access solely by the room's public access mode.
     *
     * <p>The sync-server reads {@code isMember} when applying a PRIVATE access-mode change:
     * explicit members stay connected; public-access connections are closed with code 4403.
     *
     * @param subject       The user UUID or guest identifier.
     * @param roomId        The UUID string of the room.
     * @param effectiveRole The effective role (OWNER, EDITOR, VIEWER) the user has in the room.
     * @param isMember      {@code true} if the user is an explicit DB member; {@code false} for
     *                      connections derived from the room's public access mode.
     * @return A compact signed JWT string.
     */
    public String generateRoomTicket(String subject, String roomId, String effectiveRole, boolean isMember) {
        long now = System.currentTimeMillis();
        long ticketExpirationMs = 5 * 60 * 1000; // 5 minutes
        return Jwts.builder()
                .subject(subject)
                .claim("roomId", roomId)
                .claim("effectiveRole", effectiveRole)
                .claim("isMember", isMember)
                .claim("type", "room_ticket")
                .issuedAt(new Date(now))
                .expiration(new Date(now + ticketExpirationMs))
                .signWith(signingKey)
                .compact();
    }
}
