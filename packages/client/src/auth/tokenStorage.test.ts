import { describe, it, expect, beforeEach } from "vitest";
import {
  getToken,
  setToken,
  clearToken,
  isTokenExpired,
  decodePayload,
  getTokenRole,
} from "@/auth/tokenStorage";

// Mock localStorage for node test environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

/**
 * Builds a minimal compact JWT string with the given payload.
 * The signature segment is fake — we never verify it client-side.
 */
function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${header}.${body}.fakesig`;
}

describe("tokenStorage", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("getToken / setToken / clearToken", () => {
    it("returns null when nothing is stored", () => {
      expect(getToken()).toBeNull();
    });

    it("stores and retrieves a token", () => {
      setToken("abc.def.ghi");
      expect(getToken()).toBe("abc.def.ghi");
    });

    it("clears the stored token", () => {
      setToken("abc.def.ghi");
      clearToken();
      expect(getToken()).toBeNull();
    });
  });

  describe("decodePayload", () => {
    it("decodes a valid JWT payload", () => {
      const jwt = buildFakeJwt({ sub: "user-1", role: "GUEST", exp: 9999999999 });
      const payload = decodePayload(jwt);
      expect(payload).not.toBeNull();
      expect(payload!["sub"]).toBe("user-1");
      expect(payload!["role"]).toBe("GUEST");
    });

    it("returns null for a malformed token", () => {
      expect(decodePayload("not.a.jwt.with.extra.parts")).toBeNull();
      expect(decodePayload("twoparts")).toBeNull();
    });
  });

  describe("isTokenExpired", () => {
    it("returns false for a token with a future exp", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const jwt = buildFakeJwt({ sub: "u1", exp: futureExp });
      expect(isTokenExpired(jwt)).toBe(false);
    });

    it("returns true for a token with a past exp", () => {
      const pastExp = Math.floor(Date.now() / 1000) - 1;
      const jwt = buildFakeJwt({ sub: "u1", exp: pastExp });
      expect(isTokenExpired(jwt)).toBe(true);
    });

    it("returns true for a malformed token", () => {
      expect(isTokenExpired("invalid")).toBe(true);
    });
  });

  describe("getTokenRole", () => {
    it("returns GUEST role from stored guest token", () => {
      const jwt = buildFakeJwt({ sub: "guest-1", role: "GUEST", exp: 9999999999 });
      setToken(jwt);
      expect(getTokenRole()).toBe("GUEST");
    });

    it("returns AUTHENTICATED role from stored member token", () => {
      const jwt = buildFakeJwt({ sub: "user-uuid", role: "AUTHENTICATED", exp: 9999999999 });
      setToken(jwt);
      expect(getTokenRole()).toBe("AUTHENTICATED");
    });

    it("returns null when no token is stored", () => {
      expect(getTokenRole()).toBeNull();
    });
  });
});
