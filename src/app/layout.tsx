import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SukuuNova",
  description: "Secure multi-tenant school management foundation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
