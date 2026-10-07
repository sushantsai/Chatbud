"use client";
import { useEffect, useState } from "react";
import { supabase } from "../_lib/supabase";
import { useApp } from "./app";
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
  // The Google button appears only once Google sign-in is switched on for the project.
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    let active = true;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json())
      .then((settings) => active && setGoogle(!!settings.external?.google))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      {google && (
        <>
          <button
            type="button"
            className="button secondary full google"
            disabled={busy}
            onClick={() =>
              run(async () => {
                // Comes back to this same page, signed in.
                const { error } = await supabase!.auth.signInWithOAuth({
                  provider: "google",
                  options: {
                    redirectTo:
                      window.location.origin + window.location.pathname,
                  },
                });
                if (error) throw error;
              })
            }
          >
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
              />
            </svg>
            Continue with Google
          </button>
          <p className="auth-divider">or use your email</p>
        </>
      )}
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
