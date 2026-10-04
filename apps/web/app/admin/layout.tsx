import type { Metadata } from "next";
import { TeamGate } from "./_components/gate";
export const metadata: Metadata = {
  title: "Chatbud team",
  robots: { index: false, follow: false },
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TeamGate>{children}</TeamGate>;
}
