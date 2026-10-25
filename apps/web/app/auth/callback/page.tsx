"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../_lib/supabase";
import { googleReturnKey, safeAuthReturnPath } from "../../_lib/oauth";
export default function GoogleCallback() {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function finish() {
      try {
        if (!supabase) throw new Error("Sign-in is temporarily unavailable.");
        const url = new URL(window.location.href);
        const fragment = new URLSearchParams(url.hash.slice(1));
        if (url.searchParams.has("error") || fragment.has("error"))
          throw new Error(
            "Google sign-in was cancelled or could not be completed. Please try again.",
          );
        // The SDK exchanges PKCE once during initialization. Await its result,
        // rather than exchanging the same authorization code a second time.
        const initialized = await supabase.auth.initialize();
        if (initialized.error)
          throw new Error(
            "The sign-in link expired or was already used. Please start Google sign-in again in this browser.",
          );
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user)
          throw new Error(
            "We could not finish signing you in. Please start again.",
          );
        if (!active) return;
        let destination = "/";
        try {
          destination = safeAuthReturnPath(
            sessionStorage.getItem(googleReturnKey),
          );
          sessionStorage.removeItem(googleReturnKey);
        } catch {}
        window.location.replace(destination);
      } catch (cause) {
        // Do not leave authorization codes or provider errors in the visible URL.
        window.history.replaceState(null, "", "/auth/callback");
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Please try signing in again.",
          );
      }
    }
    finish();
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel oauth-result">
      <h2>
        {error ? "Let’s try signing in again" : "Completing your sign-in"}
      </h2>
      {error ? (
        <>
          <p className="form-error" role="alert">
            {error}
          </p>
          <Link href="/" className="button">
            Back to Chatbud
          </Link>
        </>
      ) : (
        <p role="status">
          Please wait while we securely complete your Google sign-in…
        </p>
      )}
    </section>
  );
}
