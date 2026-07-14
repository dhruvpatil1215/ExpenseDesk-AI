/**
 * Login Page
 * Date: 2026-07-10
 * Path: src/app/(auth)/login/page.tsx
 *
 * Client component — needs state for form inputs, errors, and loading.
 * Calls credentialsSignIn (server action) for email+password.
 * Calls signIn("google") from next-auth/react for Google OAuth.
 *
 * Flow:
 *   1. User enters email + password → credentialsSignIn runs
 *   2. On success → router.push(callbackUrl or role-based home)
 *   3. On failure → inline error shown
 *
 * OR:
 *   1. User clicks "Continue with Google" → Google OAuth flow
 *   2. NextAuth redirects back to callbackUrl
 */

"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { credentialsSignIn } from "@/server/actions/auth.actions"

export default function LoginPage() {
  const router      = useRouter()
  const params      = useSearchParams()
  const callbackUrl = params.get("callbackUrl") ?? "/transactions"
  const registered  = params.get("registered") === "1"

  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [googleLoading, setGoogleLoading] = useState(false)

  // ── Credentials submit ────────────────────────────────────
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const form = e.currentTarget
    const data = new FormData(form)

    startTransition(async () => {
      const result = await credentialsSignIn(data)
      if (!result.success) {
        setError(result.error ?? "Something went wrong.")
        return
      }
      router.push(callbackUrl)
      router.refresh()
    })
  }

  // ── Google OAuth ──────────────────────────────────────────
  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    await signIn("google", { callbackUrl })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">💳</span>
          <span className="auth-logo-text">ExpenseDesk AI</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to manage your expenses</p>

        {/* Success banner after registration */}
        {registered && (
          <div className="auth-banner auth-banner--success">
            Account created! Please sign in below.
          </div>
        )}

        {/* Success banner after password reset */}
        {params.get("reset") === "1" && (
          <div className="auth-banner auth-banner--success">
            Password reset successful! Please sign in with your new password.
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="auth-banner auth-banner--error" role="alert">
            {error}
          </div>
        )}

        {/* Credentials form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="email" className="auth-label">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              placeholder="you@company.com"
              disabled={isPending}
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="password" className="auth-label">Password</label>
              <Link href="/forgot-password" className="auth-link auth-link--sm">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              placeholder="••••••••"
              disabled={isPending}
            />
          </div>

          <button
            type="submit"
            className="auth-btn auth-btn--primary"
            disabled={isPending || !email || !password}
          >
            {isPending ? (
              <span className="auth-spinner" aria-label="Signing in…" />
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider" aria-hidden="true">
          <span>or continue with</span>
        </div>

        {/* Google button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="auth-btn auth-btn--google"
          disabled={googleLoading || isPending}
        >
          {googleLoading ? (
            <span className="auth-spinner" aria-label="Redirecting…" />
          ) : (
            <>
              <GoogleIcon />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        {/* Register link */}
        <p className="auth-footer">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="auth-link">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58Z"/>
    </svg>
  )
}