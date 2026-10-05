"use client";
import { useState } from "react";
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
  return (
    <>
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
