"use client";
import { useState } from "react";
import { supabase } from "../_lib/supabase";
import { useApp } from "./app";
export function PhoneVerification({ done }: { done: () => void | Promise<void> }) {
  const { token, run, busy, setError } = useApp();
  const [phone, setPhone] = useState("+977"),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false);
  return (
    <section className="panel">
      <h2>Phone verification</h2>
      <p>
        {token
          ? "Verify a phone number on this signed-in account. Your care account is kept; accounts are never silently merged."
          : "Use a phone OTP to sign in or create your account. If you already use an email care account, sign in to that account first to link your phone."}
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            if (!supabase) throw Error("Phone sign-in is not configured.");
            if (!sent) {
              const { error } = token
                ? await supabase.auth.updateUser({ phone })
                : await supabase.auth.signInWithOtp({ phone });
              if (error) throw error;
              setSent(true);
            } else {
              const { error } = await supabase.auth.verifyOtp({
                phone,
                token: code,
                type: token ? "phone_change" : "sms",
              });
              if (error) throw error;
              await done();
            }
          });
        }}
      >
        <label>
          Phone · international format
          <input
            type="tel"
            required
            pattern="\+[1-9][0-9]{7,14}"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={sent}
          />
        </label>
        {sent && (
          <label>
            SMS code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              required
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}
        <button className="button" disabled={busy}>
          {sent ? "Verify phone" : "Send OTP"}
        </button>
        {sent && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSent(false);
              setCode("");
            }}
          >
            Change phone number
          </button>
        )}
      </form>
      <p className="workflow-note">
        OTP delivery requires Chatbud’s SMS provider to be configured. No test
        code is accepted in the live app.
      </p>
    </section>
  );
}
