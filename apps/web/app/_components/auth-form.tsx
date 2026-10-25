"use client";
import { useState } from "react";
import { supabase } from "../_lib/supabase";
import { useApp } from "./app";
import { googleReturnKey, safeAuthReturnPath } from "../_lib/oauth";
// One account system, several doors: the customer dialog, the professional portal and the team portal.
export function AuthForm({
  allowSignup = true,
  done,
}: {
  allowSignup?: boolean;
  done?: () => void;
}) {
  const { run, busy, error, setNotice, setError } = useApp();
  const [authMode, setAuthMode] = useState("signin");
  return (
    <>
      <button
        className="button google-signin full"
        disabled={busy}
        onClick={() =>
          run(async () => {
            if (!supabase)
              throw new Error("Account service is not configured.");
            const response = await fetch("/api/auth/providers", {
              cache: "no-store",
            });
            const providers = await response.json();
            if (!response.ok || !providers.google)
              throw new Error(
                "Google sign-in is temporarily unavailable. Please use your email and password.",
              );
            try {
              sessionStorage.setItem(
                googleReturnKey,
                safeAuthReturnPath(
                  window.location.pathname +
                    window.location.search +
                    window.location.hash,
                ),
              );
            } catch {}
            const { error: googleError } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                scopes: "openid email profile",
                queryParams: { prompt: "select_account" },
              },
            });
            if (googleError)
              throw new Error(
                "Google sign-in could not be started. Please try again.",
              );
          })
        }
      >
        <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.2 3-7.4Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.4L6.4 10A6 6 0 0 1 12 5.9Z"
          />
        </svg>
        Continue with Google
      </button>
      <div className="auth-divider">
        <span>or use your email</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(async () => {
            if (!supabase)
              throw new Error("Account service is not configured.");
            const email = String(f.get("email")),
              password = String(f.get("password"));
            if (authMode === "signup") {
              const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                  data: { display_name: String(f.get("name")) },
                  emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
              });
              // The sign-up service's own wording is not meant for customers.
              if (error?.code === "over_email_send_rate_limit")
                throw new Error(
                  "We cannot send verification emails right now. Please try again in an hour.",
                );
              if (error?.code === "email_address_invalid")
                throw new Error(
                  "We could not send a verification email to that address. Check it and try again.",
                );
              if (error) throw error;
              // When email verification is switched off the account is signed in straight away.
              setNotice(
                data.session
                  ? "Your account is ready."
                  : "Check your email to verify your account before signing in.",
              );
            } else {
              const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
              });
              if (error) throw error;
              setNotice("Welcome back.");
            }
            done?.();
          });
        }}
      >
        {authMode === "signup" && (
          <label>
            Your name
            <input name="name" required maxLength={100} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={10}
            required
            autoComplete={
              authMode === "signup" ? "new-password" : "current-password"
            }
          />
        </label>
        <button className="button full" disabled={busy}>
          {busy
            ? "Please wait…"
            : authMode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
      {allowSignup && (
        <button
          className="text-button auth-switch"
          onClick={() => {
            setAuthMode(authMode === "signup" ? "signin" : "signup");
            setError("");
          }}
        >
          {authMode === "signup"
            ? "Already have an account? Sign in"
            : "New to Chatbud? Create an account"}
        </button>
      )}
    </>
  );
}
