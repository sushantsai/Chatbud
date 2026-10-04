"use client";
import { ShieldCheck } from "lucide-react";
import { useApp } from "../../_components/app";
import { professions } from "../../_components/ui";
import { usePro } from "../_components/gate";
import { ProfileName } from "../_components/sections";
export default function ProProfile() {
  const { dashboard } = useApp();
  const { workspace } = usePro();
  return (
    <>
      <ProfileName />
      <section className="panel">
        <h2>Verification</h2>
        <div className="application-status">
          <ShieldCheck size={19} />
          <div>
            <strong>Verified and approved</strong>
            <p>
              Approved to practise on Chatbud as:{" "}
              {workspace.professions
                .map((p: string) => professions[p] || p)
                .join(", ")}
              .
            </p>
          </div>
        </div>
        <p className="section-copy">
          To add a profession or change your registration details, contact the
          Chatbud team so the change can be verified.
        </p>
      </section>
      <section className="panel">
        <h2>About your practice</h2>
        <p className="section-copy">
          Shown on your public profile. It was reviewed with your application,
          so changes go through the Chatbud team.
        </p>
        <p className="case-bio">{dashboard.providerApplication?.bio}</p>
      </section>
    </>
  );
}
