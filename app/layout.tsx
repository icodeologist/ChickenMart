import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MainNav } from "@/components/main-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chicken Mart",
  description: "Chicken shop cashflow and profit tracker",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col"><MainNav />{children}</body>
    </html>
  );
}
