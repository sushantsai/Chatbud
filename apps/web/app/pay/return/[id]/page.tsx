"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CircleCheck, CircleX, Clock } from "lucide-react";
import { useApp } from "../../../_components/app";
import { SignInPrompt } from "../../../_components/ui";
// Where the payment provider sends the client back to. The server asks the
// provider what happened; nothing in this page's address is trusted.
export default function PayReturn() {
  const { id } = useParams<{ id: string }>();
  const { api, token, mode, openAuth } = useApp();
  const [status, setStatus] = useState("CHECKING");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (mode !== "live" || !token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    api("pay/verify", "POST", { paymentId: id })
      .then((result) => {
        if (!active) return;
        setStatus(result.status);
        // A payment still in progress is checked again, a few times.
        if (result.status === "PENDING" && tries < 5)
          timer = setTimeout(() => setTries(tries + 1), 4000);
      })
      .catch(() => active && setStatus("ERROR"));
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, token, mode, tries]);
  if (mode === "live" && !token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in again to see the result of your payment.
      </SignInPrompt>
    );
  const view: Record<string, [any, string, string]> = {
    CHECKING: [Clock, "Checking your payment…", "This takes a few seconds."],
    SUCCEEDED: [
      CircleCheck,
      "Payment received",
      "Your request has gone to the professional. They have 24 hours to confirm, and you will see it under Appointments.",
    ],
    PENDING: [
      Clock,
      "Your payment is still being processed",
      "We will keep checking. You can also look under Appointments in a few minutes. You have not been charged twice.",
    ],
    FAILED: [
      CircleX,
      "The payment did not go through",
      "No booking was paid for. You can try again from Appointments while your time is still held.",
    ],
    LAPSED: [
      Clock,
      "Paid, but the time was no longer held",
      "Your payment arrived after the 30-minute hold ended. It will be refunded in full, and you can book a new time.",
    ],
    DUPLICATE: [
      CircleCheck,
      "This booking was already paid",
      "A second payment was received and will be returned to you by the Chatbud team.",
    ],
    ERROR: [
      CircleX,
      "We could not check your payment",
      "Open Appointments to see whether it is marked paid. If money left your account and it is not, contact us through Help.",
    ],
  };
  const [Icon, title, detail] = view[status] || view.ERROR;
  return (
    <section
      className={`empty pay-result ${status.toLowerCase()}`}
      role="status"
    >
      <Icon size={40} />
      <h2>{title}</h2>
      <p>{detail}</p>
      <Link className="button" href="/appointments">
        Go to appointments
      </Link>
    </section>
  );
}
