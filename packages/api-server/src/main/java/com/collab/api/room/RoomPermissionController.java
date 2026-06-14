package com.collab.api.room;

import com.collab.api.room.dto.AddMemberRequest;
import com.collab.api.room.dto.RoomMemberResponse;
import com.collab.api.room.dto.UpdateAccessModeRequest;
import com.collab.api.room.dto.UpdateMemberRoleRequest;
import com.collab.api.room.entity.RoomMember;
import com.collab.api.user.User;
import com.collab.api.user.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/rooms/{roomId}")
@PreAuthorize("hasRole('AUTHENTICATED')")
public class RoomPermissionController {

    private final RoomService roomService;
    private final UserService userService;

    public RoomPermissionController(RoomService roomService, UserService userService) {
        this.roomService = roomService;
        this.userService = userService;
    }

    @PatchMapping("/access-mode")
    public ResponseEntity<Void> updateAccessMode(
            @PathVariable UUID roomId,
            @RequestBody UpdateAccessModeRequest request,
            Authentication authentication
    ) {
        UUID callerId = UUID.fromString(authentication.getName());
        roomService.updateAccessMode(roomId, callerId, request.accessMode());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/members")
    public ResponseEntity<List<RoomMemberResponse>> getMembers(
            @PathVariable UUID roomId,
            Authentication authentication
    ) {
        UUID callerId = UUID.fromString(authentication.getName());
        List<RoomMember> members = roomService.getRoomMembers(roomId, callerId);
        
        List<UUID> userIds = members.stream().map(RoomMember::getUserId).toList();
        Map<UUID, User> userMap = userService.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        List<RoomMemberResponse> responses = members.stream().map(m -> {
            User u = userMap.get(m.getUserId());
            return new RoomMemberResponse(
                    m.getId(),
                    m.getRoomId(),
                    m.getUserId(),
                    u != null ? u.getEmail() : null,
                    u != null ? u.getDisplayName() : null,
                    m.getRole().name(),
                    m.getJoinedAt()
            );
        }).toList();

        return ResponseEntity.ok(responses);
    }

    @PostMapping("/members")
    public ResponseEntity<RoomMemberResponse> addMember(
            @PathVariable UUID roomId,
            @RequestBody AddMemberRequest request,
            Authentication authentication
    ) {
        UUID callerId = UUID.fromString(authentication.getName());
        RoomMember member = roomService.addMember(roomId, callerId, request.email(), request.role());
        
        User u = userService.findById(member.getUserId()).orElse(null);
        return ResponseEntity.ok(new RoomMemberResponse(
                member.getId(),
                member.getRoomId(),
                member.getUserId(),
                u != null ? u.getEmail() : null,
                u != null ? u.getDisplayName() : null,
                member.getRole().name(),
                member.getJoinedAt()
        ));
    }

    @PatchMapping("/members/{userId}")
    public ResponseEntity<RoomMemberResponse> updateMemberRole(
            @PathVariable UUID roomId,
            @PathVariable UUID userId,
            @RequestBody UpdateMemberRoleRequest request,
            Authentication authentication
    ) {
        UUID callerId = UUID.fromString(authentication.getName());
        RoomMember member = roomService.updateMemberRole(roomId, callerId, userId, request.role());

        User u = userService.findById(member.getUserId()).orElse(null);
        return ResponseEntity.ok(new RoomMemberResponse(
                member.getId(),
                member.getRoomId(),
                member.getUserId(),
                u != null ? u.getEmail() : null,
                u != null ? u.getDisplayName() : null,
                member.getRole().name(),
                member.getJoinedAt()
        ));
    }

    @DeleteMapping("/members/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable UUID roomId,
            @PathVariable UUID userId,
            Authentication authentication
    ) {
        UUID callerId = UUID.fromString(authentication.getName());
        roomService.removeMember(roomId, callerId, userId);
        return ResponseEntity.ok().build();
    }
}
