import { beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

describe("jwtVerifier", () => {
  const secretBase64 = "XtVWcilMyRXDU/NTpTCsZp/V5yqM8Cv8BXNwnZ8fFyY=";
  const secretBytes = Buffer.from(secretBase64, "base64");

  // Set the env var before importing the module (module reads it at load time).
  beforeAll(() => {
    process.env.JWT_SECRET = secretBase64;
  });

  /**
   * Dynamically imports the module under test so the `JWT_SECRET` env var
   * is already set when the module-level guard runs.
   */
  async function loadVerifier() {
    const mod = await import("./jwtVerifier.js");
    return mod.verifyToken;
  }

  it("verifies an HS256 token", async () => {
    const verifyToken = await loadVerifier();
    const token = jwt.sign(
      { sub: "user-1", role: "AUTHENTICATED" },
      secretBytes,
      {
        algorithm: "HS256",
        expiresIn: "1h",
      },
    );
    const claims = verifyToken(token);
    expect(claims.userId).toBe("user-1");
    expect(claims.role).toBe("AUTHENTICATED");
  });

  it("verifies an HS384 token (production key length)", async () => {
    const verifyToken = await loadVerifier();
    const token = jwt.sign({ sub: "guest-abc", role: "GUEST" }, secretBytes, {
      algorithm: "HS384",
      expiresIn: "1h",
    });
    const claims = verifyToken(token);
    expect(claims.userId).toBe("guest-abc");
    expect(claims.role).toBe("GUEST");
  });

  it("verifies an HS512 token", async () => {
    const verifyToken = await loadVerifier();
    const token = jwt.sign(
      { sub: "user-2", role: "AUTHENTICATED" },
      secretBytes,
      {
        algorithm: "HS512",
        expiresIn: "1h",
      },
    );
    const claims = verifyToken(token);
    expect(claims.userId).toBe("user-2");
    expect(claims.role).toBe("AUTHENTICATED");
  });

  it("rejects an expired token", async () => {
    const verifyToken = await loadVerifier();
    const token = jwt.sign({ sub: "user-3", role: "GUEST" }, secretBytes, {
      algorithm: "HS256",
      expiresIn: "-10s",
    });
    expect(() => verifyToken(token)).toThrow();
  });

  it("rejects a token signed with the wrong key", async () => {
    const verifyToken = await loadVerifier();
    const wrongKey = Buffer.from("wrong-secret-key-that-is-long-enough!!");
    const token = jwt.sign({ sub: "user-4", role: "GUEST" }, wrongKey, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    expect(() => verifyToken(token)).toThrow();
  });
});
