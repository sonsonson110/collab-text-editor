package com.collab.api.snapshot;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Internal controller for Yjs document snapshot persistence.
 *
 * <p><b>These endpoints are exclusively for the sync-server.</b> They are secured
 * by the {@link com.collab.api.shared.security.InternalApiFilter} which requires
 * the {@code x-internal-secret} header — no JWT is accepted on {@code /api/internal/**}.
 *
 * <p>The sync-server:
 * <ol>
 *   <li>Calls {@code GET /api/internal/rooms/:id/snapshot} on room initialisation to
 *       hydrate the in-memory Y.Doc with the last persisted state.</li>
 *   <li>Calls {@code PUT /api/internal/rooms/:id/snapshot} periodically (debounced +
 *       60s ceiling) and on room teardown to persist the current document state.</li>
 * </ol>
 */
@RestController
@RequestMapping("/api/internal/rooms")
@PreAuthorize("hasRole('SERVICE')")
public class SnapshotController {

    private final SnapshotService snapshotService;

    public SnapshotController(SnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    /**
     * Persists (or replaces) the Yjs binary snapshot for the specified room.
     *
     * @param id   The room's UUID.
     * @param data Raw binary body — {@code Y.encodeStateAsUpdate(doc)} output from the sync-server.
     * @return {@code 200 OK} on success.
     */
    @PutMapping(value = "/{id}/snapshot", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<Void> putSnapshot(
            @PathVariable UUID id,
            @RequestBody byte[] data
    ) {
        snapshotService.upsertSnapshot(id, data);
        return ResponseEntity.ok().build();
    }

    /**
     * Returns the latest binary snapshot for the specified room.
     *
     * @param id The room's UUID.
     * @return {@code 200 OK} with binary body if a snapshot exists,
     *         {@code 204 No Content} if no snapshot has been saved yet.
     */
    @GetMapping(value = "/{id}/snapshot", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<byte[]> getSnapshot(@PathVariable UUID id) {
        return snapshotService.getSnapshot(id)
                .map(data -> ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .body(data))
                .orElse(ResponseEntity.status(HttpStatus.NO_CONTENT).build());
    }
}
