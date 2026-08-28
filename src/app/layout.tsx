import type { Metadata } from "next";
import "./globals.css";
import "./student-theme.css";

export const metadata: Metadata = {
  title: "SukuuNova | School Operations",
  description: "Secure multi-tenant school management for Ghanaian schools."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
