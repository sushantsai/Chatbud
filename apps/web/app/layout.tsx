import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { AppShell } from "./_components/app";
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const display = Manrope({ subsets: ["latin"], variable: "--font-display" });
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
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
