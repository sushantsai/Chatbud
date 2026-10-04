import type { Metadata } from "next";
import { ProGate } from "./_components/gate";
export const metadata: Metadata = {
  title: "Chatbud for professionals",
  description:
    "Apply to practise on Chatbud and manage your appointments, clients, services and profile.",
};
export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <ProGate>{children}</ProGate>;
}
