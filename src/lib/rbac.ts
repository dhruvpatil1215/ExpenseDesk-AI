/**
 * Role-Based Access Control (RBAC)
 * Date: 2026-07-10
 *
 * Implements the permission matrix from plan §3.
 * These are pure functions — no DB calls, no side effects.
 *
 * Usage in server components / actions:
 *   const session = await getAuthSession()
 *   if (!canApproveExpense(session?.user.role)) throw new Error("Forbidden")
 *
 * Usage in middleware:
 *   if (isManagerRoute(pathname) && !isManager(role)) redirect("/dashboard")
 */

import { Role } from "@/types/database"

// ── Role hierarchy helpers ────────────────────────────────────

export const isEmployee = (role?: Role | null): boolean =>
  role === Role.EMPLOYEE || role === Role.MANAGER || role === Role.FINANCE

export const isManager = (role?: Role | null): boolean =>
  role === Role.MANAGER

export const isFinance = (role?: Role | null): boolean =>
  role === Role.FINANCE

/** Managers and Finance can both see all expenses */
export const canViewAllExpenses = (role?: Role | null): boolean =>
  role === Role.MANAGER || role === Role.FINANCE

// ── Action-level permission checks (mirrors plan §3 matrix) ──

export const canSubmitExpense = (role?: Role | null): boolean =>
  isEmployee(role)

export const canRetractOwnExpense = (role?: Role | null): boolean =>
  isEmployee(role)

export const canApproveExpense = (role?: Role | null): boolean =>
  role === Role.MANAGER

export const canRejectExpense = (role?: Role | null): boolean =>
  role === Role.MANAGER

export const canMarkReimbursed = (role?: Role | null): boolean =>
  role === Role.FINANCE

export const canExportCSV = (role?: Role | null): boolean =>
  role === Role.FINANCE

// ── Route-level classification ────────────────────────────────
// Used in middleware to guard entire route segments.

/** Routes only MANAGER can access */
const MANAGER_ROUTES = ["/approvals"]

/** Routes only FINANCE can access */
const FINANCE_ROUTES = ["/finance"]

/** Routes any authenticated user can access */
const AUTHENTICATED_ROUTES = ["/dashboard", "/expenses", "/settings", "/transactions", "/insights", "/categories"]

/** Auth routes (redirect to dashboard if already logged in) */
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"]

export function classifyRoute(pathname: string): {
  requiresAuth:    boolean
  requiredRole:    Role | null
  isAuthPage:      boolean
} {
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    return { requiresAuth: false, requiredRole: null, isAuthPage: true }
  }

  if (MANAGER_ROUTES.some((r) => pathname.startsWith(r))) {
    return { requiresAuth: true, requiredRole: Role.MANAGER, isAuthPage: false }
  }

  if (FINANCE_ROUTES.some((r) => pathname.startsWith(r))) {
    return { requiresAuth: true, requiredRole: Role.FINANCE, isAuthPage: false }
  }

  if (AUTHENTICATED_ROUTES.some((r) => pathname.startsWith(r))) {
    return { requiresAuth: true, requiredRole: null, isAuthPage: false }
  }

  // Public routes (landing page, etc.)
  return { requiresAuth: false, requiredRole: null, isAuthPage: false }
}

/**
 * Returns true if the given role satisfies the required role.
 * A null requiredRole means "any authenticated user".
 */
export function hasRequiredRole(
  userRole: Role | undefined,
  requiredRole: Role | null
): boolean {
  if (!requiredRole) return true
  return userRole === requiredRole
}

export function getDefaultRedirect(role: Role): string {
  // All roles land on the transactions dashboard page
  return "/transactions"
}
