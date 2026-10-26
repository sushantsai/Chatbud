"use client";
import { SupportCases } from "../_components/notifications";
import { SupportDesk } from "../_components/support";
export default function Help() {
  return (
    <>
      <SupportCases />
      <SupportDesk as="CLIENT" />
    </>
  );
}
