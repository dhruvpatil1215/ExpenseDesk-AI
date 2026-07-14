/**
 * Register Page
 * Date: 2026-07-10
 * Path: src/app/(auth)/register/page.tsx
 *
 * Client component. Calls the registerUser server action.
 * On success the action auto-signs in and redirects.
 * On failure it returns fieldErrors that are shown inline.
 */

"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { registerUser } from "@/server/actions/auth.actions"

interface FieldErrors {
  name?:            string[]
  email?:           string[]
  password?:        string[]
  confirmPassword?: string[]
}

export default function RegisterPage() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGlobalError(null)
    setFieldErrors({})

    const form = e.currentTarget
    const data = new FormData(form)

    startTransition(async () => {
      const result = await registerUser(data)
      if (!result.success) {
        setGlobalError(result.error ?? "Registration failed.")
        setFieldErrors((result.fieldErrors as FieldErrors) ?? {})
      }
      // On success, the server action redirects — no client handling needed.
    })
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    await signIn("google", { callbackUrl: "/transactions" })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">💳</span>
          <span className="auth-logo-text">ExpenseDesk AI</span>
        </div>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Start tracking expenses in minutes</p>

        {globalError && (
          <div className="auth-banner auth-banner--error" role="alert">
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* Full name */}
          <div className="auth-field">
            <label htmlFor="name" className="auth-label">Full name</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className={`auth-input${fieldErrors.name ? " auth-input--error" : ""}`}
              placeholder="Jane Smith"
              disabled={isPending}
            />
            {fieldErrors.name && (
              <p className="auth-field-error">{fieldErrors.name[0]}</p>
            )}
          </div>

          {/* Email */}
          <div className="auth-field">
            <label htmlFor="email" className="auth-label">Work email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={`auth-input${fieldErrors.email ? " auth-input--error" : ""}`}
              placeholder="jane@company.com"
              disabled={isPending}
            />
            {fieldErrors.email && (
              <p className="auth-field-error">{fieldErrors.email[0]}</p>
            )}
          </div>

          {/* Password */}
          <div className="auth-field">
            <label htmlFor="password" className="auth-label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className={`auth-input${fieldErrors.password ? " auth-input--error" : ""}`}
              placeholder="Min. 8 chars, uppercase, number, symbol"
              disabled={isPending}
            />
            {fieldErrors.password && (
              <p className="auth-field-error">{fieldErrors.password[0]}</p>
            )}
          </div>

          {/* Confirm password */}
          <div className="auth-field">
            <label htmlFor="confirmPassword" className="auth-label">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className={`auth-input${fieldErrors.confirmPassword ? " auth-input--error" : ""}`}
              placeholder="Re-enter your password"
              disabled={isPending}
            />
            {fieldErrors.confirmPassword && (
              <p className="auth-field-error">{fieldErrors.confirmPassword[0]}</p>
            )}
          </div>

          <button
            type="submit"
            className="auth-btn auth-btn--primary"
            disabled={isPending}
          >
            {isPending ? (
              <span className="auth-spinner" aria-label="Creating account…" />
            ) : (
              "Create account"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider" aria-hidden="true">
          <span>or</span>
        </div>

        {/* Google */}
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
              <span>Sign up with Google</span>
            </>
          )}
        </button>

        <p className="auth-footer">
          Already have an account?{" "}
          <Link href="/login" className="auth-link">Sign in</Link>
        </p>

        <p className="auth-legal">
          By creating an account you agree to our{" "}
          <Link href="/privacy" className="auth-link">Privacy Policy</Link>.
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