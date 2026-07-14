/**
 * Server-Side Session Helpers
 * Date: 2026-07-10
 * Path: src/lib/session.ts
 *
 * Thin wrappers around Auth.js auth() that add:
 *   - Explicit null checks with typed errors
 *   - Role enforcement (throws, does not redirect — caller decides)
 *   - Consistent ownership check utility
 *
 * Usage in a server action:
 *   const session = await requireAuth()
 *   const user    = await requireRole(Role.MANAGER)
 *
 * Usage in a server component:
 *   const session = await getAuthSession()
 *   if (!session) redirect("/login")
 *
 * Why not use middleware redirects?
 *   Middleware runs at the edge and handles route-level protection.
 *   These helpers add fine-grained, action-level checks inside your
 *   business logic (e.g., "this expense must belong to the caller").
 */

import { auth } from "@/auth"
import { Role } from "@/types/database"

// ── Types ────────────────────────────────────────────────────

export interface AuthenticatedUser {
  id:            string
  name:          string | null
  email:         string | null
  role:          Role
  avatarUrl:     string | null
  emailVerified: boolean
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Returns the current session, or null if unauthenticated.
 * Use this in layouts and pages where guest access is valid.
 */
export async function getAuthSession() {
  return auth()
}

/**
 * Returns the authenticated user.
 * Throws a 401-equivalent error if there is no session.
 * Use this in all protected server actions.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED: You must be logged in to perform this action.")
  }
  return {
    id:            session.user.id,
    name:          session.user.name   ?? null,
    email:         session.user.email  ?? null,
    role:          session.user.role,
    avatarUrl:     session.user.avatarUrl ?? null,
    emailVerified: session.user.emailVerified,
  }
}

/**
 * Returns the authenticated user only if they have the required role.
 * Throws a 403-equivalent error otherwise.
 * Use this to guard MANAGER / FINANCE only actions.
 */
export async function requireRole(required: Role): Promise<AuthenticatedUser> {
  const user = await requireAuth()
  if (user.role !== required) {
    throw new Error(
      `FORBIDDEN: This action requires the ${required} role. Your role is ${user.role}.`
    )
  }
  return user
}

/**
 * Asserts that `ownerId` equals the current user's id.
 * Call this inside server actions that modify records owned by a user
 * (e.g., editing a DRAFT expense) to prevent horizontal privilege escalation.
 *
 * @param ownerId    The userId stored on the resource being accessed
 * @param actingUser The result of requireAuth()
 * @param bypass     If true, skip the check (e.g., MANAGER viewing all)
 */
export function assertOwnership(
  ownerId:    string,
  actingUser: AuthenticatedUser,
  bypass = false
): void {
  if (bypass) return
  if (ownerId !== actingUser.id) {
    throw new Error("FORBIDDEN: You do not have permission to access this resource.")
  }
}

/**
 * Maps an Error thrown by requireAuth / requireRole to an HTTP-style
 * status code — useful when you need to return a structured response.
 */
export function resolveErrorStatus(error: unknown): 400 | 401 | 403 | 500 {
  if (error instanceof Error) {
    if (error.message.startsWith("UNAUTHENTICATED")) return 401
    if (error.message.startsWith("FORBIDDEN"))       return 403
  }
  return 500
}