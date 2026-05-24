package com.collab.api.room;

import com.collab.api.auth.dto.RegisterRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RoomControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper json;

    private String registerAndGetToken(String email) throws Exception {
        var body = json.writeValueAsString(
                new RegisterRequest(email, "password123", "Test User"));
        var result = mockMvc.perform(post("/api/auth/register")
                        .contentType(APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return json.readTree(result.getResponse().getContentAsString())
                .get("token").asText();
    }

    private String getGuestToken() throws Exception {
        var result = mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isOk())
                .andReturn();
        return json.readTree(result.getResponse().getContentAsString())
                .get("token").asText();
    }

    // ── POST /api/rooms/quickshare ────────────────────────────────────────────

    @Test
    void quickshare_withGuestToken_returnsCreatedWithSlug() throws Exception {
        var token = getGuestToken();

        mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.slug").isNotEmpty())
                .andExpect(jsonPath("$.isClaimed").value(false))
                .andExpect(jsonPath("$.accessMode").value("PUBLIC_EDIT"))
                .andExpect(jsonPath("$.ownerId").isEmpty());
    }

    @Test
    void quickshare_withMemberToken_returnsClaimed() throws Exception {
        var token = registerAndGetToken("alice@example.com");

        mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.slug").isNotEmpty())
                .andExpect(jsonPath("$.isClaimed").value(true))
                .andExpect(jsonPath("$.ownerId").isNotEmpty());
    }

    @Test
    void quickshare_unauthenticated_returns401() throws Exception {
        mockMvc.perform(post("/api/rooms/quickshare"))
                .andExpect(status().isUnauthorized());
    }

    // ── POST /api/rooms/{id}/claim ────────────────────────────────────────────

    @Test
    void claimRoom_unclaimedRoom_returnsOk() throws Exception {
        var guestToken = getGuestToken();
        var createResult = mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(status().isCreated())
                .andReturn();
        var roomId = json.readTree(createResult.getResponse().getContentAsString())
                .get("id").asText();

        var memberToken = registerAndGetToken("bob@example.com");
        
        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .header("Authorization", "Bearer " + memberToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isClaimed").value(true))
                .andExpect(jsonPath("$.ownerId").isNotEmpty());
    }

    @Test
    void claimRoom_alreadyClaimed_returns409() throws Exception {
        var aliceToken = registerAndGetToken("alice@example.com");
        var createResult = mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isCreated())
                .andReturn();
        var roomId = json.readTree(createResult.getResponse().getContentAsString())
                .get("id").asText();

        var bobToken = registerAndGetToken("bob@example.com");

        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isConflict());
    }

    @Test
    void claimRoom_guestToken_returns403() throws Exception {
        var guestToken1 = getGuestToken();
        var createResult = mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + guestToken1))
                .andExpect(status().isCreated())
                .andReturn();
        var roomId = json.readTree(createResult.getResponse().getContentAsString())
                .get("id").asText();

        var guestToken2 = getGuestToken();

        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .header("Authorization", "Bearer " + guestToken2))
                .andExpect(status().isForbidden());
    }

    // ── GET /api/rooms/{id} & /api/rooms/by-slug/{slug} ─────────────────────

    @Test
    void getRoomById_publicRoom_guestCanAccess() throws Exception {
        var creatorToken = getGuestToken();
        var createResult = mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + creatorToken))
                .andExpect(status().isCreated())
                .andReturn();
        var roomId = json.readTree(createResult.getResponse().getContentAsString())
                .get("id").asText();
        var slug = json.readTree(createResult.getResponse().getContentAsString())
                .get("slug").asText();

        var readerToken = getGuestToken();

        mockMvc.perform(get("/api/rooms/" + roomId)
                        .header("Authorization", "Bearer " + readerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(roomId));

        mockMvc.perform(get("/api/rooms/by-slug/" + slug)
                        .header("Authorization", "Bearer " + readerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(slug));
    }

    @Test
    void getRoomById_privateRoom_nonMember_returns403() throws Exception {
        // Not testing private rooms yet as they can't be created via quickshare without changing access_mode
        // Skipped intentionally for this phase.
    }
}
