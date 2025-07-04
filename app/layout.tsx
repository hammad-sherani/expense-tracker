import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs'
import RootProviders from "@/components/providers/RootProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Track your expenses easily",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  // Handle missing publishable key during build
  if (!publishableKey) {
    console.warn("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY. Clerk will not be available.");
    
    return (
      <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <RootProviders>
            {children}
          </RootProviders>
        </body>
      </html>
    );
  }

  return (
    <ClerkProvider 
      publishableKey={publishableKey}
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
    >
      <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <RootProviders>
            {children}
          </RootProviders>
        </body>
      </html>
    </ClerkProvider>
  );
}