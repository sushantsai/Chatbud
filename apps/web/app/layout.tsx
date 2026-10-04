import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "./_components/app";
export const metadata: Metadata = {
  title: "Chatbud · Your digital health & wellbeing companion",
  description:
    "Find mental-health, nutrition and fitness professionals, manage your care, and explore trusted health products in Nepal.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
