/**
 * Root Layout
 * Path: src/app/layout.tsx
 *
 * The outermost layout in the App Router.  Every page in the app
 * is wrapped by this component.
 *
 * Responsibilities:
 *   - Sets <html lang> and <body> class
 *   - Loads Google Fonts (Inter) via next/font
 *   - Applies global CSS reset + design tokens
 *   - Wraps children in SessionProvider so Client Components can
 *     call useSession() — server components use auth() directly
 *
 * SessionProvider is a thin client wrapper; it does NOT cause the
 * entire tree to be a Client Component.  Server Components inside
 * it remain server components.
 */

import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"
import "./globals.css"

const inter = Inter({
  subsets:  ["latin"],
  variable: "--font-inter",
  display:  "swap",
})

export const metadata: Metadata = {
  title: {
    template: "%s | ExpenseDesk AI",
    default:  "ExpenseDesk AI — Smart Expense Management",
  },
  description:
    "AI-powered expense management with receipt scanning, approval workflows, and real-time analytics.",
  applicationName: "ExpenseDesk AI",
  robots: { index: false, follow: false }, // internal tool — no indexing
}

export const viewport: Viewport = {
  themeColor: "#0f0c29",
  colorScheme: "dark",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Pass the server session to SessionProvider so the client hydrates
  // with the correct session state without an extra network round-trip.
  const session = await auth()

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}