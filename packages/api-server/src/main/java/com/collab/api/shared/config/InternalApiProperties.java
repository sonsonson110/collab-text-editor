package com.collab.api.shared.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.internal-api.*} from {@code application.yaml} / environment variables.
 *
 * <p>The {@code secret} value is shared between the api-server and sync-server.
 * The sync-server attaches it as an {@code x-internal-secret} HTTP header on
 * every call to {@code /api/internal/**} routes.
 *
 * <p>Set via the environment variable {@code APP_INTERNAL_API_SECRET} in production.
 * Never commit the raw value to source control.
 *
 * @param secret The shared secret string that authorises sync-server → api-server calls.
 */
@ConfigurationProperties(prefix = "app.internal-api")
public record InternalApiProperties(String secret) {}
