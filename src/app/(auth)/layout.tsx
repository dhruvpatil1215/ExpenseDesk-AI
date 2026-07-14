/**
 * Auth Layout
 * Path: src/app/(auth)/layout.tsx
 *
 * Wraps all pages inside the (auth) route group:
 *   /login, /register, /forgot-password, /reset-password
 *
 * Responsibilities:
 *   1. Server-side redirect: if the user already has a valid session,
 *      send them to their role-appropriate home instead of showing
 *      the login/register page again.
 *   2. Visual shell: centred card layout with brand gradient background.
 *   3. Metadata: shared <title> prefix for all auth pages.
 *
 * Why server component?
 *   auth() is an async server function. Running this redirect check
 *   server-side means the auth pages are never rendered (no flash)
 *   for logged-in users.
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getDefaultRedirect } from "@/lib/rbac"
import { Role } from "@/types/database"
import "@/styles/auth.css"

export const metadata: Metadata = {
  title: {
    template: "%s | ExpenseDesk AI",
    default:  "Sign In | ExpenseDesk AI",
  },
  description: "Sign in to manage your expenses with AI-powered insights.",
}

interface AuthLayoutProps {
  children: React.ReactNode
}

export default async function AuthLayout({ children }: AuthLayoutProps) {
  // If the user is already authenticated, redirect to their home page.
  // This prevents a logged-in manager from seeing /login.
  const session = await auth()
  if (session?.user?.id) {
    const destination = getDefaultRedirect(session.user.role as Role)
    redirect(destination)
  }

  return (
    <main className="auth-root" aria-label="Authentication">
      {children}
    </main>
  )
}