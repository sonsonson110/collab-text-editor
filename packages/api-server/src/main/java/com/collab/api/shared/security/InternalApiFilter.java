package com.collab.api.shared.security;

import com.collab.api.shared.config.InternalApiProperties;
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
 * Authenticates requests to {@code /api/internal/**} routes using a shared secret header.
 *
 * <p>The sync-server attaches {@code x-internal-secret: <secret>} on every call to
 * internal endpoints (e.g. snapshot persistence). This filter validates the header
 * and, on success, sets a {@code ROLE_SERVICE} authority in the security context so
 * that {@code @PreAuthorize("hasRole('SERVICE')")} guards on internal controllers work.
 *
 * <p>Requests to non-internal paths are passed through unchanged — the
 * {@link JwtAuthenticationFilter} handles those.
 *
 * <p>This filter runs <em>before</em> {@link JwtAuthenticationFilter} in the security
 * chain so that internal routes bypass JWT parsing entirely.
 */
@Component
public class InternalApiFilter extends OncePerRequestFilter {

    private static final String INTERNAL_SECRET_HEADER = "x-internal-secret";
    private static final String INTERNAL_PATH_PREFIX = "/api/internal/";

    private final InternalApiProperties properties;

    public InternalApiFilter(InternalApiProperties properties) {
        this.properties = properties;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Only activate this filter for /api/internal/** paths
        return !request.getRequestURI().startsWith(INTERNAL_PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String providedSecret = request.getHeader(INTERNAL_SECRET_HEADER);

        if (providedSecret == null || !providedSecret.equals(properties.secret())) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Missing or invalid internal secret");
            return;
        }

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                        "sync-server",
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_SERVICE"))
                );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }
}
