/**
 * Auth Server Actions
 * Date: 2026-07-10
 * Path: src/server/actions/auth.actions.ts
 *
 * "use server" marks every export as a Next.js Server Action.
 * These functions run exclusively on the server — never in the browser.
 *
 * Actions:
 *   registerUser    — validates, hashes password, creates user, auto-signs in
 *   logoutUser      — calls NextAuth signOut and redirects to /login
 *
 * Login itself is handled by NextAuth's Credentials provider (authorize()).
 * We use signIn("credentials", ...) from the login page form.
 *
 * Return shape: { success: boolean; error?: string; fieldErrors?: Record }
 * This allows the form to display server-side validation errors inline.
 */

"use server"

import { redirect } from "next/navigation"
import { signIn, signOut } from "@/auth"
import { prisma } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { registerSchema } from "@/lib/validators/auth.schema"
import { getDefaultRedirect } from "@/lib/rbac"
import { Role } from "@/types/database"
import { AuthError } from "next-auth"

// ── Types ─────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean
  error?:  string
  fieldErrors?: Record<string, string[]>
}

// ── registerUser ─────────────────────────────────────────────

/**
 * Validates registration input, hashes the password, creates the user,
 * then automatically signs them in and redirects to the dashboard.
 *
 * Called from the Register form via:
 *   const result = await registerUser(formData)
 */
export async function registerUser(formData: FormData): Promise<ActionResult> {
  // 1. Parse and validate input
  const raw = {
    name:            formData.get("name"),
    email:           formData.get("email"),
    password:        formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  }

  const parsed = registerSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { name, email, password } = parsed.data

  // 2. Check for duplicate email
  const existing = await prisma.user.findUnique({
    where:  { email },
    select: { id: true },
  })

  if (existing) {
    return {
      success:     false,
      error:       "An account with this email already exists.",
      fieldErrors: { email: ["This email is already registered."] },
    }
  }

  // 3. Hash password
  let passwordHash: string
  try {
    passwordHash = await hashPassword(password)
  } catch {
    return { success: false, error: "Failed to process password. Please try again." }
  }

  // 4. Create user
  let newUser: { id: string; role: string }
  try {
    newUser = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role:     "EMPLOYEE",
        currency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "INR",
      },
      select: { id: true, role: true },
    })
  } catch {
    return { success: false, error: "Registration failed. Please try again." }
  }

  // 5. Audit log
  await prisma.activityLog.create({
    data: {
      userId:       newUser.id,
      action:       "user.registered",
      resourceType: "user",
      resourceId:   newUser.id,
      metadata:     { provider: "credentials" },
    },
  })

  // 6. Auto sign-in using credentials provider
  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
  } catch (error) {
    // If sign-in fails after registration, redirect to login
    if (error instanceof AuthError) {
      redirect("/login?registered=1")
    }
    throw error
  }

  // 7. Redirect to role-appropriate home
  const destination = getDefaultRedirect(newUser.role as Role)
  redirect(destination)
}

// ── credentialsSignIn ─────────────────────────────────────────

/**
 * Wraps NextAuth's signIn("credentials") for use in the Login form.
 * Returns a structured error instead of throwing, so the form can
 * display an inline message.
 */
export async function credentialsSignIn(formData: FormData): Promise<ActionResult> {
  const email    = formData.get("email")    as string
  const password = formData.get("password") as string

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return {
            success: false,
            error:   "Invalid email or password. Please check your credentials.",
          }
        case "AccessDenied":
          return {
            success: false,
            error:   "Your account has been deactivated. Please contact support.",
          }
        default:
          return { success: false, error: "An unexpected error occurred. Please try again." }
      }
    }
    throw error // re-throw non-NextAuth errors (e.g., DB failures)
  }

  return { success: true }
}

// ── logoutUser ───────────────────────────────────────────────

/**
 * Signs the current user out and redirects to /login.
 * Must be called from a form action or a Server Action — not from a
 * Client Component directly (signOut requires "use server").
 */
export async function logoutUser(): Promise<void> {
  await signOut({ redirect: false })
  redirect("/login")
}