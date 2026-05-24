package com.collab.api.shared.config;

import com.collab.api.shared.security.InternalApiFilter;
import com.collab.api.shared.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Central Spring Security configuration for the REST API.
 *
 * <p>Design goals (Phase 2 — stateless JWT):
 * <ul>
 *   <li>Stateless session — no server-side session state; every request must
 *       carry its own credentials in the {@code Authorization: Bearer} header.</li>
 *   <li>CSRF disabled — CSRF protection is only needed for cookie-based browser
 *       sessions. A stateless token API has no cookies to protect.</li>
 *   <li>No DB lookup per request — {@link JwtAuthenticationFilter} validates
 *       the JWT cryptographically; it never hits the database.</li>
 * </ul>
 *
 * <p>Phase 3 addition: {@link InternalApiFilter} authenticates {@code /api/internal/**}
 * routes via a shared secret header ({@code x-internal-secret}) instead of JWT.
 * These routes are used exclusively by the sync-server for snapshot persistence.
 *
 * <p>{@code @EnableMethodSecurity} activates {@code @PreAuthorize} /
 * {@code @PostAuthorize} so individual service methods can be secured by role
 * in Phase 4 without any further configuration change here.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final InternalApiFilter internalApiFilter;

    public SecurityConfig(
            JwtAuthenticationFilter jwtAuthenticationFilter,
            InternalApiFilter internalApiFilter
    ) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.internalApiFilter = internalApiFilter;
    }

    /**
     * Defines the HTTP security filter chain applied to every incoming request.
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                .authorizeHttpRequests(auth -> auth
                        // Public auth endpoints
                        .requestMatchers(HttpMethod.POST, "/api/auth/register").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/guest").permitAll()
                        // Internal routes are authenticated by InternalApiFilter, not JWT
                        .requestMatchers("/api/internal/**").permitAll()
                        // All other requests require a valid JWT
                        .anyRequest().authenticated()
                )

                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, authException) ->
                                response.sendError(jakarta.servlet.http.HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized"))
                )

                // InternalApiFilter runs first so internal routes never reach JWT parsing
                .addFilterBefore(internalApiFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(jwtAuthenticationFilter, InternalApiFilter.class);

        return http.build();
    }

    /**
     * Prevents Spring Boot from auto-registering {@link JwtAuthenticationFilter}
     * in the servlet filter chain a second time (it is already registered inside
     * the Spring Security filter chain above).
     */
    @Bean
    public org.springframework.boot.web.servlet.FilterRegistrationBean<JwtAuthenticationFilter>
            jwtAuthenticationFilterRegistration() {
        var registration =
                new org.springframework.boot.web.servlet.FilterRegistrationBean<>(jwtAuthenticationFilter);
        registration.setEnabled(false);
        return registration;
    }

    /**
     * Prevents Spring Boot from auto-registering {@link InternalApiFilter}
     * in the servlet filter chain a second time.
     */
    @Bean
    public org.springframework.boot.web.servlet.FilterRegistrationBean<InternalApiFilter>
            internalApiFilterRegistration() {
        var registration =
                new org.springframework.boot.web.servlet.FilterRegistrationBean<>(internalApiFilter);
        registration.setEnabled(false);
        return registration;
    }

    /**
     * Registers BCrypt as the application-wide password hashing strategy.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
