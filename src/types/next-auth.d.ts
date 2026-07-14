/**
 * NextAuth Type Augmentation
 * Date: 2026-07-10
 *
 * Extends the default Session and JWT interfaces so that our custom
 * fields (id, role, avatarUrl, emailVerified) are strongly typed
 * across server components, server actions, and the client.
 *
 * Why: NextAuth only ships name/email/image by default.
 * RBAC requires role; all DB lookups require id.
 */

import type { Role } from "@/types/database"
import type { DefaultSession, DefaultJWT } from "next-auth"

declare module "next-auth" {
  /**
   * Returned by `auth()` in server components / server actions.
   * Extends the default Session to include our custom user fields.
   */
  interface Session {
    user: {
      /** cuid() from our users table */
      id: string
      /** EMPLOYEE | MANAGER | FINANCE */
      role: Role
      /** S3 / object-store URL or null */
      avatarUrl: string | null
      /** Whether the user has verified their email address */
      emailVerified: boolean
    } & DefaultSession["user"]
  }

  /**
   * Returned by `authorize()` in the Credentials provider.
   * Must include the extra fields so the jwt() callback can read them.
   */
  interface User {
    id: string
    role: Role
    avatarUrl: string | null
    emailVerified: boolean
  }
}

declare module "next-auth/jwt" {
  /**
   * JWT payload stored in the cookie.
   * Fields added here survive across requests without a DB round-trip.
   */
  interface JWT extends DefaultJWT {
    id: string
    role: Role
    avatarUrl: string | null
    emailVerified: boolean
  }
}
