import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "AI-Native Skill Learning",
  description: "Evidence-backed skill learning",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
