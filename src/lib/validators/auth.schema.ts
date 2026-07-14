/**
 * Auth Validation Schemas (Zod)
 * Date: 2026-07-10
 *
 * Single source of truth for auth field validation rules.
 * Imported by:
 *   - server actions (server-side enforcement)
 *   - React Hook Form + zodResolver (client-side UX)
 *   - auth.ts authorize() callback
 *
 * Rule summary:
 *   email    — valid format, lowercase-normalised
 *   password — min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special
 *   name     — 2–100 chars, letters/spaces/hyphens/apostrophes only
 */

import { z } from "zod"

// ── Reusable field definitions ────────────────────────────────

const emailField = z
  .string({ required_error: "Email is required" })
  .min(1, "Email is required")
  .max(255, "Email must be at most 255 characters")
  .email("Please enter a valid email address")
  .toLowerCase()
  .trim()

const passwordField = z
  .string({ required_error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character"
  )

const nameField = z
  .string({ required_error: "Full name is required" })
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be at most 100 characters")
  .regex(
    /^[A-Za-z\s'\-]+$/,
    "Name may only contain letters, spaces, hyphens, and apostrophes"
  )
  .trim()

// ── Schemas ───────────────────────────────────────────────────

/** Used in the Login form and the authorize() callback */
export const loginSchema = z.object({
  email:    emailField,
  password: z.string().min(1, "Password is required"), // no complexity check on login
})

/** Used in the Register form and the registerUser server action */
export const registerSchema = z
  .object({
    name:            nameField,
    email:           emailField,
    password:        passwordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path:    ["confirmPassword"],
  })

/** Used when the user changes their password in Settings */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword:     passwordField,
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path:    ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path:    ["newPassword"],
  })


/** Used when the user requests a password reset link */
export const forgotPasswordSchema = z.object({
  email: emailField,
})

/** Used when resetting the password with a code */
export const resetPasswordSchema = z
  .object({
    email: emailField,
    code: z.string().min(1, "Verification code is required"),
    password: passwordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

// ── Inferred types ────────────────────────────────────────────

export type LoginInput          = z.infer<typeof loginSchema>
export type RegisterInput       = z.infer<typeof registerSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput  = z.infer<typeof resetPasswordSchema>
