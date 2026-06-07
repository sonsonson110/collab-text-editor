import { useState, useEffect, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { setToken } from "@/auth/tokenStorage";
import type { ApiErrorResponse } from "@/auth/types";
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

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  displayName: z.string().optional(),
});

const registerSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(50, "Display name must be 50 characters or fewer"),
});

interface FormFields {
  email: string;
  password: string;
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthResponse {
  token: string;
  userId: string;
  displayName: string;
}

type Mode = "login" | "register";

interface Props {
  /**
   * Called with the new Member JWT after successful login/register.
   * The parent is responsible for claiming the room and reconnecting the WS.
   */
  onSuccess: (memberToken: string) => void;
  /** Called when the user closes the modal without authenticating. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal that lets a guest sign in or register.
 *
 * On success, passes the Member JWT to `onSuccess` so the parent can:
 *   1. Persist the token.
 *   2. Call `POST /api/rooms/:id/claim` with the stored creator secret.
 *   3. Reconnect the WebSocket with the new token.
 *
 * Uses React Hook Form + Zod for client-side validation and maps the server's
 * `fieldErrors[]` array back to individual field errors when the API returns
 * a 400 Validation failure. Domain errors (401, 409, 500) are surfaced as a
 * root error shown below the form fields.
 */
export function AuthModal({ onSuccess, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("login");

  const resolver = useMemo(() => {
    return mode === "login"
      ? (zodResolver(loginSchema) as Resolver<FormFields>)
      : (zodResolver(registerSchema) as Resolver<FormFields>);
  }, [mode]);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({
    resolver,
    defaultValues: { email: "", password: "", displayName: "" },
  });

  /**
   * Reset form fields when swapping between login and register modes.
   */
  useEffect(() => {
    reset({ email: "", password: "", displayName: "" });
  }, [mode, reset]);

  async function onSubmit(values: FormFields) {
    const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      mode === "login"
        ? { email: values.email, password: values.password }
        : values;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = (await response.json()) as AuthResponse;
        setToken(data.token);
        onSuccess(data.token);
        return;
      }

      // Parse the structured error body emitted by GlobalExceptionHandler.
      const err = (await response.json()) as ApiErrorResponse;

      if (err.fieldErrors && err.fieldErrors.length > 0) {
        // Map each server-side constraint violation to its form field so the
        // user sees the error directly beneath the offending input.
        err.fieldErrors.forEach(({ field, message }) => {
          setError(field as keyof FormFields, { message });
        });
      } else {
        // Generic domain error (401 wrong password, 409 duplicate email, …)
        // — shown as a single banner below the last field.
        setError("root", {
          message: err.message ?? "Authentication failed",
        });
      }
    } catch {
      setError("root", { message: "Network error — please try again" });
    }
  }

  function handleModeToggle() {
    // clearErrors is called implicitly by reset() inside the useEffect,
    // but we clear eagerly here so the UI reacts before the effect fires.
    clearErrors();
    setMode(mode === "login" ? "register" : "login");
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

        <form
          onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}
          className="flex flex-col gap-3 pt-2"
        >
          {mode === "register" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-display-name">Display name</Label>
              <Input
                id="auth-display-name"
                type="text"
                placeholder="Display name"
                aria-invalid={!!errors.displayName}
                {...register("displayName")}
              />
              {errors.displayName && (
                <p className="text-destructive text-xs">
                  {errors.displayName.message}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-destructive text-xs">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-destructive text-xs">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Root error — domain errors (401, 409, 500) and network failures */}
          {errors.root && (
            <p className="text-destructive text-xs">{errors.root.message}</p>
          )}

          <Button
            id="auth-submit-btn"
            type="submit"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting
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
            onClick={handleModeToggle}
            className="text-primary underline hover:text-primary/80 transition-colors"
          >
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
