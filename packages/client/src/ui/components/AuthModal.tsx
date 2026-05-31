import { useState } from "react";
import { setToken } from "@/auth/tokenStorage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "login" ? "Sign in" : "Create account"}
          </DialogTitle>
          <DialogDescription>
            Save this room permanently to your account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3 pt-2">
          {mode === "register" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-display-name">Display name</Label>
              <Input
                id="auth-display-name"
                type="text"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); }}
                required
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); }}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
            />
          </div>
          {error !== null && (
            <p className="text-destructive text-xs">{error}</p>
          )}
          <Button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading
              ? "Please wait…"
              : mode === "login"
              ? "Sign in"
              : "Create account"}
          </Button>
        </form>

        <p className="text-center text-muted-foreground text-xs mt-2">
          {mode === "login" ? "No account?" : "Already have one?"}{" "}
          <button
            id="auth-mode-toggle-btn"
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-primary underline hover:text-primary/80 transition-colors"
          >
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
