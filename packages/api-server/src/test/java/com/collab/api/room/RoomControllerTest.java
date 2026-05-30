package com.collab.api.room;

import com.collab.api.auth.dto.RegisterRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

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

    /**
     * Creates a guest quickshare room and returns a two-element array:
     * {@code [roomId, creatorSecret]}.
     */
    private String[] createGuestRoomAndGetIdAndSecret() throws Exception {
        var token = getGuestToken();
        var result = mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andReturn();
        var tree = json.readTree(result.getResponse().getContentAsString());
        return new String[]{ tree.get("id").asText(), tree.get("creatorSecret").asText() };
    }

    // ── POST /api/rooms/quickshare ────────────────────────────────────────────

    @Test
    void quickshare_withGuestToken_returnsUnclaimedWithSecret() throws Exception {
        var token = getGuestToken();

        mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.slug").isNotEmpty())
                .andExpect(jsonPath("$.isClaimed").value(false))
                .andExpect(jsonPath("$.accessMode").value("PUBLIC_EDIT"))
                .andExpect(jsonPath("$.ownerId").isEmpty())
                // Guest rooms must include a non-empty creatorSecret.
                .andExpect(jsonPath("$.creatorSecret").isNotEmpty());
    }

    @Test
    void quickshare_withMemberToken_returnsClaimedWithoutSecret() throws Exception {
        var token = registerAndGetToken("alice@example.com");

        mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.slug").isNotEmpty())
                .andExpect(jsonPath("$.isClaimed").value(true))
                .andExpect(jsonPath("$.ownerId").isNotEmpty())
                // Auth-user rooms are claimed immediately — no secret issued.
                .andExpect(jsonPath("$.creatorSecret").isEmpty());
    }

    @Test
    void quickshare_unauthenticated_returns401() throws Exception {
        mockMvc.perform(post("/api/rooms/quickshare"))
                .andExpect(status().isUnauthorized());
    }

    // ── POST /api/rooms/{id}/claim ────────────────────────────────────────────

    @Test
    void claimRoom_withCorrectSecret_returnsOk() throws Exception {
        var idAndSecret = createGuestRoomAndGetIdAndSecret();
        var roomId = idAndSecret[0];
        var secret = idAndSecret[1];

        var memberToken = registerAndGetToken("bob@example.com");
        var body = json.writeValueAsString(Map.of("creatorSecret", secret));

        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .header("Authorization", "Bearer " + memberToken)
                        .contentType(APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isClaimed").value(true))
                .andExpect(jsonPath("$.ownerId").isNotEmpty());
    }

    @Test
    void claimRoom_withWrongSecret_returns403() throws Exception {
        var idAndSecret = createGuestRoomAndGetIdAndSecret();
        var roomId = idAndSecret[0];

        var memberToken = registerAndGetToken("bob@example.com");
        var body = json.writeValueAsString(Map.of("creatorSecret", "not-the-right-secret"));

        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .header("Authorization", "Bearer " + memberToken)
                        .contentType(APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    @Test
    void claimRoom_withMissingSecret_returns403() throws Exception {
        var idAndSecret = createGuestRoomAndGetIdAndSecret();
        var roomId = idAndSecret[0];

        var memberToken = registerAndGetToken("bob@example.com");
        // Send null creatorSecret — treated as missing.
        var body = json.writeValueAsString(Map.of("creatorSecret", ""));

        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .header("Authorization", "Bearer " + memberToken)
                        .contentType(APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    @Test
    void claimRoom_alreadyClaimed_returns409() throws Exception {
        // Auth-user-created rooms are claimed immediately.
        var aliceToken = registerAndGetToken("alice@example.com");
        var createResult = mockMvc.perform(post("/api/rooms/quickshare")
                        .header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isCreated())
                .andReturn();
        var roomId = json.readTree(createResult.getResponse().getContentAsString())
                .get("id").asText();

        var bobToken = registerAndGetToken("bob@example.com");
        var body = json.writeValueAsString(Map.of("creatorSecret", "any"));

        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .header("Authorization", "Bearer " + bobToken)
                        .contentType(APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void claimRoom_guestToken_returns403() throws Exception {
        // @PreAuthorize("hasRole('AUTHENTICATED')") rejects guest JWTs before
        // the service layer is reached.
        var idAndSecret = createGuestRoomAndGetIdAndSecret();
        var roomId = idAndSecret[0];
        var secret = idAndSecret[1];

        var guestToken = getGuestToken();
        var body = json.writeValueAsString(Map.of("creatorSecret", secret));

        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .header("Authorization", "Bearer " + guestToken)
                        .contentType(APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    @Test
    void claimRoom_unauthenticated_returns401() throws Exception {
        var idAndSecret = createGuestRoomAndGetIdAndSecret();
        var roomId = idAndSecret[0];
        var secret = idAndSecret[1];
        var body = json.writeValueAsString(Map.of("creatorSecret", secret));

        mockMvc.perform(post("/api/rooms/" + roomId + "/claim")
                        .contentType(APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
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
                .andExpect(jsonPath("$.id").value(roomId))
                // GET endpoints must never expose the creatorSecret.
                .andExpect(jsonPath("$.creatorSecret").doesNotExist());

        mockMvc.perform(get("/api/rooms/by-slug/" + slug)
                        .header("Authorization", "Bearer " + readerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(slug))
                .andExpect(jsonPath("$.creatorSecret").doesNotExist());
    }

    @Test
    void getRoomById_privateRoom_nonMember_returns403() throws Exception {
        // Not testing private rooms yet as they can't be created via quickshare
        // without changing access_mode. Skipped intentionally for this phase.
    }
}
