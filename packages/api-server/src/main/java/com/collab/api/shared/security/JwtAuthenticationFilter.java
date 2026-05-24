package com.collab.api.shared.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Stateless JWT authentication filter — Phase 2 replacement for the
 * Phase-1 {@code BearerTokenFilter}.
 *
 * <p>Reads the {@code Authorization: Bearer <token>} header, validates the
 * JWT signature and expiry via {@link JwtService}, and — on success — builds a
 * {@link UsernamePasswordAuthenticationToken} whose:
 * <ul>
 *   <li>principal name is the {@code sub} claim (a user UUID or guest identifier), and</li>
 *   <li>authorities include {@code ROLE_AUTHENTICATED} or {@code ROLE_GUEST} from
 *       the {@code role} claim — enabling role-based access checks via
 *       {@code @PreAuthorize("hasRole('AUTHENTICATED')")}.</li>
 * </ul>
 *
 * <p><b>No database call is made.</b> The cryptographic signature guarantees
 * authenticity; the expiry claim guarantees freshness. Any invalid or expired
 * token is silently ignored here — Spring Security will reject the request
 * downstream because no authentication is set on the context.
 *
 * <p><b>ASP.NET Core equivalent:</b> the JWT bearer middleware registered via
 * {@code AddAuthentication().AddJwtBearer()}.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String header = request.getHeader("Authorization");

        if (header != null && header.startsWith(BEARER_PREFIX)) {
            String token = header.substring(BEARER_PREFIX.length());

            try {
                Claims claims = jwtService.validateToken(token);
                String subject = jwtService.extractSubject(claims);
                String role = jwtService.extractRole(claims);

                // Map the JWT role claim to a Spring Security authority so that
                // @PreAuthorize("hasRole('AUTHENTICATED')") works on endpoints
                // that require a full member identity.
                List<SimpleGrantedAuthority> authorities = List.of(
                        new SimpleGrantedAuthority("ROLE_" + role)
                );

                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                subject,
                                null,
                                authorities
                        );
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (Exception ignored) {
                // Invalid or expired token — leave the SecurityContext empty.
                // Spring Security will reject the request downstream with 401.
            }
        }

        filterChain.doFilter(request, response);
    }
}
