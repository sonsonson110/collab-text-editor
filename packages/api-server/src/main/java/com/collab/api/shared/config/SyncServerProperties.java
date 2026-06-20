package com.collab.api.shared.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.sync-server.*} from {@code application.yaml} / environment variables.
 *
 * <p>Used by {@link com.collab.api.room.SyncServerNotifier} to POST permission-change
 * events to the sync-server's internal HTTP endpoint after room permission mutations.
 *
 * <p>Set via the environment variable {@code SYNC_SERVER_BASE_URL} in production.
 * Defaults to {@code http://localhost:1235} (sync-server internal HTTP port) for local dev.
 *
 * @param baseUrl The base URL of the sync-server's internal HTTP listener.
 */
@ConfigurationProperties(prefix = "app.sync-server")
public record SyncServerProperties(String baseUrl) {}
