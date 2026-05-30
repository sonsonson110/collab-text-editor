import { useState } from "react";
import { setToken } from "@/auth/tokenStorage";

interface AuthResponse {
  token: string;
  userId: string;
  displayName: string;
}

interface Props {
  /**
   * Called with the new Member JWT after successful login/register.
   * The parent is responsible for claiming the room and reconnecting the WS.
   */
  onSuccess: (memberToken: string) => void;
  /** Called when the user closes the modal without authenticating. */
  onClose: () => void;
}

type Mode = "login" | "register";

/**
 * Modal that lets a guest sign in or register.
 *
 * On success, passes the Member JWT to `onSuccess` so the parent can:
 *   1. Persist the token.
 *   2. Call `POST /api/rooms/:id/claim` with the stored creator secret.
 *   3. Reconnect the WebSocket with the new token.
 */
export function AuthModal({ onSuccess, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, displayName };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as AuthResponse | { message: string };

      if (!response.ok) {
        const msg = "message" in data ? data.message : "Authentication failed";
        setError(msg);
        setLoading(false);
        return;
      }

      const { token } = data as AuthResponse;
      setToken(token);
      onSuccess(token);
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to save room"
    >
      <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded-xl p-6 shadow-2xl">
        <button
          id="auth-modal-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 text-lg leading-none"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-white font-semibold text-base mb-1">
          {mode === "login" ? "Sign in" : "Create account"}
        </h2>
        <p className="text-neutral-400 text-xs mb-5">
          Save this room permanently to your account.
        </p>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3">
          {mode === "register" && (
            <input
              id="auth-display-name"
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); }}
              required
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
            />
          )}
          <input
            id="auth-email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); }}
            required
            className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            id="auth-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); }}
            required
            className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
          />
          {error !== null && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? "Please wait…"
              : mode === "login"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-neutral-500 text-xs">
          {mode === "login" ? "No account?" : "Already have one?"}{" "}
          <button
            id="auth-mode-toggle-btn"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
