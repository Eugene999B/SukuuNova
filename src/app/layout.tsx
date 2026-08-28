import type { Metadata } from "next";
import "./globals.css";
import "./student-theme.css";

export const metadata: Metadata = {
  title: "SukuuNova | School Operations",
  description: "Secure multi-tenant school management for Ghanaian schools.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  },
  openGraph: {
    title: "SukuuNova | School Operations",
    description: "One beautiful system for the whole school.",
    siteName: "SukuuNova",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
