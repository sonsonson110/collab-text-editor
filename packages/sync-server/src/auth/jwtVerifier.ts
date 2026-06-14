import jwt from "jsonwebtoken";

/** The set of claims extracted from a verified JWT. */
export interface VerifiedClaims {
  /** The subject: a user UUID string or a `"guest-<uuid>"` string. */
  userId: string;
  /** `"AUTHENTICATED"` for registered users, `"GUEST"` for anonymous sessions. */
  role: string;
}

/**
 * Validates a compact JWT string against the shared HMAC secret.
 *
 * Reads the secret from the `JWT_SECRET` environment variable (base64-encoded,
 * identical to the value used by the Spring api-server). The secret is decoded
 * once at module load time so every call to {@link verifyToken} is synchronous
 * and allocation-free.
 *
 * @throws {Error} If `JWT_SECRET` is not set, the token is malformed, the
 *   signature is invalid, or the token has expired.
 */

const rawSecret = process.env.JWT_SECRET;
if (!rawSecret) {
  throw new Error(
    "[jwtVerifier] JWT_SECRET environment variable is not set. " +
      "Set it to the same base64-encoded secret used by the Spring api-server.",
  );
}

/** Raw bytes of the HMAC signing key, decoded once at startup. */
const SECRET_KEY: Buffer = Buffer.from(rawSecret, "base64");

/**
 * Verifies the JWT signature and expiry, then returns the embedded claims.
 *
 * @param token - Compact JWT string (three dot-separated Base64URL segments).
 * @returns `{ userId, role }` extracted from the `sub` and `role` claims.
 * @throws If the token is invalid, expired, or has a bad signature.
 */
export function verifyToken(token: string): VerifiedClaims {
  const payload = jwt.verify(token, SECRET_KEY, {
    algorithms: ["HS256", "HS384", "HS512"],
  }) as {
    sub: string;
    role: string;
  };

  return { userId: payload.sub, role: payload.role };
}

export interface TicketClaims {
  userId: string;
  effectiveRole: string;
}

export function verifyRoomTicket(token: string, expectedRoomId: string): TicketClaims {
  const payload = jwt.verify(token, SECRET_KEY, {
    algorithms: ["HS256", "HS384", "HS512"],
  }) as {
    sub: string;
    roomId: string;
    effectiveRole: string;
    type: string;
  };

  if (payload.type !== "room_ticket") {
    throw new Error("Invalid token type");
  }

  if (payload.roomId !== expectedRoomId) {
    throw new Error("Ticket does not match the requested room");
  }

  return { userId: payload.sub, effectiveRole: payload.effectiveRole };
}
