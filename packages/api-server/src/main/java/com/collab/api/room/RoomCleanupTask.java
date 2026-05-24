package com.collab.api.room;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Scheduled task that periodically removes expired, unclaimed rooms from the database.
 *
 * <p>A room is eligible for deletion when:
 * <ul>
 *   <li>{@code owner_id IS NULL} — the room was never claimed by a Member, and</li>
 *   <li>{@code expires_at < NOW()} — the 24-hour guest window has elapsed.</li>
 * </ul>
 *
 * <p>Runs every hour. Enable scheduling by annotating the main application class
 * with {@code @EnableScheduling} (or the configuration class).
 */
@Component
public class RoomCleanupTask {

    private final RoomRepository roomRepository;

    public RoomCleanupTask(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    /**
     * Deletes all unclaimed rooms whose {@code expires_at} timestamp is in the past.
     * Runs at the top of every hour ({@code 0 0 * * * *}).
     */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void deleteExpiredRooms() {
        int deleted = roomRepository.deleteExpiredUnclaimedRooms(Instant.now());
        if (deleted > 0) {
            System.out.printf("[RoomCleanupTask] Deleted %d expired unclaimed room(s).%n", deleted);
        }
    }
}
