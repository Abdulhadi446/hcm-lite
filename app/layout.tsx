import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "HCM Lite",
  title: {
    default: "HCM Lite — AI-assisted HR, attendance, leave and payroll",
    template: "%s · HCM Lite",
  },
  description:
    "Role-aware HCM for Admin, HR and Employee: employee records, attendance with grace and half-day rules, leave balances, working-day payroll with payslip PDFs, and an AI assistant that answers questions from your own HR data.",
  keywords: [
    "HCM",
    "HR software",
    "attendance",
    "leave management",
    "payroll",
    "AI assistant",
    "Next.js",
  ],
  authors: [{ name: "HCM Lite" }],
  openGraph: {
    type: "website",
    url: appUrl,
    siteName: "HCM Lite",
    title: "HCM Lite — AI-assisted HR, attendance, leave and payroll",
    description:
      "Employees, attendance, leave, payroll and analytics for Admin, HR and Employee roles — with an AI assistant grounded in your own data.",
  },
  twitter: {
    card: "summary_large_image",
    title: "HCM Lite — AI-assisted HR, attendance, leave and payroll",
    description:
      "Role-aware HCM with working-day payroll, payslip PDFs and an AI assistant grounded in your own HR data.",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-background text-foreground antialiased min-h-screen">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
