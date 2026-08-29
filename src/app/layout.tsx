import type { Metadata } from "next";
import "./globals.css";
import "./student-theme.css";
import "./visual-system.css";
import "./sukuunova-bright.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "SukuuNova | School Operations",
  description: "Secure multi-tenant school management for Ghanaian schools.",
  icons: {
    icon: "/brand/sukuunova-favicon.svg",
    apple: "/brand/sukuunova-favicon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
