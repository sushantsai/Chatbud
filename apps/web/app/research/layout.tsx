import type { Metadata } from "next";
import { ResearchGate } from "./_components/lib";
export const metadata: Metadata = {
  title: "Chatbud research",
  robots: { index: false, follow: false },
};
export default function ResearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ResearchGate>{children}</ResearchGate>;
}
