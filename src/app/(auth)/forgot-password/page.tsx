/**
 * Forgot Password Page
 * Path: src/app/(auth)/forgot-password/page.tsx
 *
 * Provides a mock password reset flow for developer and user demo purposes.
 * Steps:
 *   1. Enter email -> calls requestPasswordReset server action.
 *   2. Displays mock instructions and prompts for the demo code (123456)
 *      along with the new password.
 *   3. Updates password in DB, resets account lock status, redirects to login.
 */

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { requestPasswordReset, resetPassword } from "@/server/actions/auth.actions"

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [isPending, startTransition] = useTransition()

  // ── Step 1: Request Reset ─────────────────────────────────
  async function handleRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const form = e.currentTarget
    const data = new FormData(form)
    const emailVal = data.get("email") as string

    startTransition(async () => {
      const result = await requestPasswordReset(data)
      if (!result.success) {
        setError(result.error ?? "Failed to request password reset.")
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors)
        }
        return
      }

      setEmail(emailVal)
      setStep(2)
      setSuccess("Account found! Please use the demo code to reset your password.")
    })
  }

  // ── Step 2: Reset Password ────────────────────────────────
  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setFieldErrors({})

    const form = e.currentTarget
    const data = new FormData(form)
    data.append("email", email) // Ensure email is passed

    startTransition(async () => {
      const result = await resetPassword(data)
      if (!result.success) {
        setError(result.error ?? "Failed to reset password.")
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors)
        }
        return
      }

      // Success -> redirect to login with query param
      router.push("/login?reset=1")
    })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">💳</span>
          <span className="auth-logo-text">ExpenseDesk AI</span>
        </div>

        {step === 1 ? (
          <>
            <h1 className="auth-title">Reset password</h1>
            <p className="auth-subtitle">Enter your email to retrieve your account</p>

            {error && (
              <div className="auth-banner auth-banner--error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleRequest} className="auth-form" noValidate>
              <div className="auth-field">
                <label htmlFor="email" className="auth-label">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={isPending}
                  className={`auth-input${fieldErrors.email ? " auth-input--error" : ""}`}
                  placeholder="name@company.com"
                />
                {fieldErrors.email && (
                  <p className="auth-field-error">{fieldErrors.email[0]}</p>
                )}
              </div>

              <button type="submit" disabled={isPending} className="auth-btn auth-btn--primary">
                {isPending ? <span className="auth-spinner" /> : "Verify Email"}
              </button>
            </form>

            <p className="auth-footer">
              Remember your password?{" "}
              <Link href="/login" className="auth-link">
                Sign In
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-title">Set new password</h1>
            <p className="auth-subtitle">Verify your identity and enter your new password</p>

            {success && (
              <div className="auth-banner auth-banner--success" role="alert">
                {success}
              </div>
            )}

            {error && (
              <div className="auth-banner auth-banner--error" role="alert">
                {error}
              </div>
            )}

            {/* Demo Help Notice */}
            <div style={{
              background: "rgba(129, 140, 248, 0.08)",
              border: "1px dashed rgba(129, 140, 248, 0.3)",
              borderRadius: "var(--auth-radius-sm)",
              padding: "0.75rem 1rem",
              fontSize: "0.85rem",
              color: "var(--auth-text-primary)",
              lineHeight: "1.4"
            }}>
              💡 <strong>Demo Mode:</strong> An email was NOT actually sent. Please use the verification code <strong>123456</strong> to reset the password.
            </div>

            <form onSubmit={handleReset} className="auth-form" noValidate>
              {/* Verification Code */}
              <div className="auth-field">
                <label htmlFor="code" className="auth-label">Verification Code</label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  required
                  disabled={isPending}
                  defaultValue="123456"
                  className={`auth-input${fieldErrors.code ? " auth-input--error" : ""}`}
                  placeholder="Enter 123456"
                />
                {fieldErrors.code && (
                  <p className="auth-field-error">{fieldErrors.code[0]}</p>
                )}
              </div>

              {/* New Password */}
              <div className="auth-field">
                <label htmlFor="password" className="auth-label">New Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  disabled={isPending}
                  className={`auth-input${fieldErrors.password ? " auth-input--error" : ""}`}
                  placeholder="Min 8 chars, mixed case, symbols"
                />
                {fieldErrors.password && (
                  <p className="auth-field-error">{fieldErrors.password[0]}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="auth-field">
                <label htmlFor="confirmPassword" className="auth-label">Confirm Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  disabled={isPending}
                  className={`auth-input${fieldErrors.confirmPassword ? " auth-input--error" : ""}`}
                  placeholder="Re-enter new password"
                />
                {fieldErrors.confirmPassword && (
                  <p className="auth-field-error">{fieldErrors.confirmPassword[0]}</p>
                )}
              </div>

              <button type="submit" disabled={isPending} className="auth-btn auth-btn--primary">
                {isPending ? <span className="auth-spinner" /> : "Reset Password"}
              </button>
            </form>

            <p className="auth-footer">
              <button 
                type="button" 
                onClick={() => { setStep(1); setError(null); setSuccess(null); }}
                className="auth-link"
                style={{ background: "none", border: "none", font: "inherit", cursor: "pointer" }}
              >
                ← Back to email input
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
