package com.collab.api.snapshot;

import com.collab.api.room.RoomRepository;
import com.collab.api.room.entity.Room;
import com.collab.api.room.entity.AccessMode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_OCTET_STREAM;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SnapshotControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    RoomRepository roomRepository;

    private static final String INTERNAL_SECRET = "change-me-in-production"; // Matches test application.yaml

    private UUID createRealRoom() {
        var room = Room.builder()
                .slug(UUID.randomUUID().toString().substring(0, 8))
                .accessMode(AccessMode.PUBLIC_EDIT)
                .build();
        return roomRepository.save(room).getId();
    }

    @Test
    void putSnapshot_validSecret_returns200() throws Exception {
        var roomId = createRealRoom();
        var snapshotData = new byte[]{1, 2, 3, 4};

        mockMvc.perform(put("/api/internal/rooms/" + roomId + "/snapshot")
                        .header("x-internal-secret", INTERNAL_SECRET)
                        .contentType(APPLICATION_OCTET_STREAM)
                        .content(snapshotData))
                .andExpect(status().isOk());
    }

    @Test
    void putSnapshot_missingSecret_returns401() throws Exception {
        var roomId = createRealRoom();
        var snapshotData = new byte[]{1, 2, 3, 4};

        mockMvc.perform(put("/api/internal/rooms/" + roomId + "/snapshot")
                        .contentType(APPLICATION_OCTET_STREAM)
                        .content(snapshotData))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void putSnapshot_invalidSecret_returns401() throws Exception {
        var roomId = createRealRoom();
        var snapshotData = new byte[]{1, 2, 3, 4};

        mockMvc.perform(put("/api/internal/rooms/" + roomId + "/snapshot")
                        .header("x-internal-secret", "wrong-secret")
                        .contentType(APPLICATION_OCTET_STREAM)
                        .content(snapshotData))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getSnapshot_notExists_returns204() throws Exception {
        var roomId = createRealRoom();

        mockMvc.perform(get("/api/internal/rooms/" + roomId + "/snapshot")
                        .header("x-internal-secret", INTERNAL_SECRET))
                .andExpect(status().isNoContent());
    }

    @Test
    void getSnapshot_exists_returnsBinary() throws Exception {
        var roomId = createRealRoom();
        var snapshotData = new byte[]{1, 2, 3, 4};

        mockMvc.perform(put("/api/internal/rooms/" + roomId + "/snapshot")
                        .header("x-internal-secret", INTERNAL_SECRET)
                        .contentType(APPLICATION_OCTET_STREAM)
                        .content(snapshotData))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/internal/rooms/" + roomId + "/snapshot")
                        .header("x-internal-secret", INTERNAL_SECRET))
                .andExpect(status().isOk())
                .andExpect(content().contentType(APPLICATION_OCTET_STREAM))
                .andExpect(content().bytes(snapshotData));
    }
}
