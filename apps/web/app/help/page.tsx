"use client";
import Link from "next/link";
import { SupportDesk } from "../_components/support";
export default function Help() {
  return (
    <>
      <section className="panel">
        <h2>Need help getting started?</h2>
        <p className="section-copy">
          The AI assistant can help with finding care, booking questions and
          order tracking.
        </p>
        <Link className="button secondary" href="/assistant">
          Open AI assistant
        </Link>
      </section>
      <SupportDesk as="CLIENT" />
    </>
  );
}
