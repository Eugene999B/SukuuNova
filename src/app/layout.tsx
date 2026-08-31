import type { Metadata } from "next";
import "./globals.css";
import "./design-tokens.css";
import "./ui-system.css";
import "./student-theme.css";
import "./visual-system.css";
import "./typography.css";
import "./public-theme.css";
import "../components/app-shell.css";
import "./login/login.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PublicThemeGate } from "@/components/PublicThemeGate";

export const metadata: Metadata = {
  title: "SukuuNova | School Operations",
  description: "Secure multi-tenant school management for Ghanaian schools.",
  icons: {
    icon: "/brand/sukuunova-favicon.svg",
    apple: "/brand/sukuunova-favicon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ThemeProvider><PublicThemeGate />{children}</ThemeProvider></body></html>;
}
