"use client";
import { WorkQueue } from "./_components/work-queue";
import { useApp } from "../_components/app";
import Link from "next/link";
export default function TeamHome() {
  const { dashboard } = useApp();
  return dashboard.roles.some((r: string) =>
    ["SUPPORT", "FINANCE"].includes(r),
  ) ? (
    <WorkQueue />
  ) : (
    <section className="panel">
      <h1>Team workspace</h1>
      <p>Open your permitted work area.</p>
      <div className="workflow-actions">
        <Link href="/admin/applications">Professional verification</Link>
        <Link href="/admin/catalogue">Catalogue</Link>
        <Link href="/admin/team">Permissions</Link>
      </div>
    </section>
  );
}
