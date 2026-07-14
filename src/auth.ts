/**
 * Auth.js v5 Configuration — ExpenseDesk AI
 * Date: 2026-07-10
 *
 * Architecture decisions:
 *
 * 1. JWT session strategy (stateless)
 *    No Session table needed. The JWT is stored in an HTTP-only
 *    cookie (encrypted by AUTH_SECRET). Validated on every request
 *    by the middleware without a DB round-trip.
 *
 * 2. No Prisma adapter
 *    Our `accounts` table is financial (bank accounts), not OAuth.
 *    We manage user lookup/creation manually in the signIn callback.
 *
 * 3. Credentials provider
 *    Full email+password flow with:
 *      - bcrypt verification (12 rounds)
 *      - Account lockout after 10 failed attempts (30 min)
 *      - Active/inactive account check
 *      - Zod validation before any DB call
 *
 * 4. Google OAuth provider
 *    On first Google sign-in: creates a new EMPLOYEE user in our DB.
 *    On subsequent sign-ins: looks up by email, updates avatar.
 *    Blocked if isActive = false.
 *
 * 5. Token enrichment (jwt callback)
 *    Adds id, role, avatarUrl, emailVerified to the JWT so server
 *    components can read role without hitting the DB on every request.
 *
 * Exports: handlers, auth, signIn, signOut
 *   - handlers -> used in the /api/auth/[...nextauth] route
 *   - auth     -> used in server components and server actions
 *   - signIn / signOut -> used in server actions / forms
 */

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { prisma } from "@/lib/db"
import { verifyPassword } from "@/lib/password"
import { loginSchema } from "@/lib/validators/auth.schema"
import { getDefaultRedirect } from "@/lib/rbac"
import { Role } from "@/types/database"

/** Max consecutive failures before lockout */
const MAX_FAILED_LOGINS = 10
/** Lockout duration in milliseconds (30 minutes) */
const LOCKOUT_DURATION_MS = 30 * 60 * 1000

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret:  process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge:   7 * 24 * 60 * 60, // 7 days
  },

  // ── Custom pages ────────────────────────────────────────────
  pages: {
    signIn: "/login",
    error:  "/login", // error query param added automatically
  },

  // ── Providers ───────────────────────────────────────────────
  providers: [
    // ── 1. Email + Password ─────────────────────────────────
    Credentials({
      id:   "credentials",
      name: "Email & Password",
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(rawCredentials) {
        // 1. Validate shape with Zod (guards against malformed requests)
        const parsed = loginSchema.safeParse(rawCredentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        // 2. Fetch user (select only what we need; never return passwordHash)
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id:               true,
            email:            true,
            name:             true,
            passwordHash:     true,
            role:             true,
            avatarUrl:        true,
            isActive:         true,
            emailVerified:    true,
            failedLoginCount: true,
            lockedUntil:      true,
          },
        })

        if (!user) return null // user not found — return null, not an error

        // 3. Check account status
        if (!user.isActive) return null

        // 4. Check lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null // still locked
        }

        // 5. Google OAuth users have no password — block credential login
        if (!user.passwordHash) return null

        // 6. Verify password
        const passwordValid = await verifyPassword(password, user.passwordHash)

        if (!passwordValid) {
          // Increment failed count; lock if threshold exceeded
          const newCount = user.failedLoginCount + 1
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: newCount,
              lockedUntil:
                newCount >= MAX_FAILED_LOGINS
                  ? new Date(Date.now() + LOCKOUT_DURATION_MS)
                  : null,
            },
          })
          // Log failed attempt
          await prisma.activityLog.create({
            data: {
              userId:       user.id,
              action:       "auth.login_failed",
              resourceType: "user",
              resourceId:   user.id,
              metadata:     { attemptCount: newCount },
            },
          })
          return null
        }

        // 7. Success — reset failure counter
        if (user.failedLoginCount > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: 0, lockedUntil: null },
          })
        }

        // 8. Log successful login
        await prisma.activityLog.create({
          data: {
            userId:       user.id,
            action:       "auth.login",
            resourceType: "user",
            resourceId:   user.id,
          },
        })

        // 9. Return the user object — NextAuth feeds this into the jwt callback
        return {
          id:            user.id,
          email:         user.email,
          name:          user.name,
          role:          user.role as Role,
          avatarUrl:     user.avatarUrl,
          emailVerified: user.emailVerified,
          image:         user.avatarUrl, // satisfy NextAuth's DefaultUser
        }
      },
    }),

    // ── 2. Google OAuth ─────────────────────────────────────
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],

  // ── Callbacks ───────────────────────────────────────────────
  callbacks: {
    /**
     * signIn callback — runs before a session is created.
     * Return true to allow sign-in, false to deny, or a URL to redirect.
     *
     * For Google: upsert the user in our DB on every sign-in.
     */
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) return false

        try {
          const existing = await prisma.user.findUnique({
            where:  { email: user.email },
            select: { id: true, isActive: true, role: true },
          })

          if (existing) {
            // Blocked account
            if (!existing.isActive) return false

            // Update avatar URL if it has changed
            if (user.image) {
              await prisma.user.update({
                where: { id: existing.id },
                data:  { avatarUrl: user.image },
              })
            }

            // Attach our DB id to the NextAuth user object so jwt callback has it
            user.id            = existing.id
            user.role          = existing.role as Role
            user.emailVerified = true

            await prisma.activityLog.create({
              data: {
                userId:       existing.id,
                action:       "auth.login",
                resourceType: "user",
                resourceId:   existing.id,
                metadata:     { provider: "google" },
              },
            })
          } else {
            // First-time Google sign-in: create a new EMPLOYEE user
            const newUser = await prisma.user.create({
              data: {
                email:           user.email,
                name:            user.name ?? "User",
                passwordHash:    "", // no password for OAuth users
                avatarUrl:       user.image,
                emailVerified:   true,
                emailVerifiedAt: new Date(),
                role:            "EMPLOYEE",
              },
            })

            user.id            = newUser.id
            user.role          = Role.EMPLOYEE
            user.emailVerified = true

            await prisma.activityLog.create({
              data: {
                userId:       newUser.id,
                action:       "user.registered",
                resourceType: "user",
                resourceId:   newUser.id,
                metadata:     { provider: "google" },
              },
            })
          }
        } catch (error) {
          console.error("[Auth] Google signIn error:", error)
          return false
        }
      }

      return true
    },

    /**
     * jwt callback — called every time a token is read/written.
     * On initial sign-in (user object present), enrich the token with
     * our custom fields. On subsequent requests, the token is returned as-is
     * (no DB call) unless a session update is triggered.
     */
    async jwt({ token, user, trigger, session }) {
      // Initial sign-in: user object is populated
      if (user) {
        token.id            = user.id
        token.role          = user.role
        token.avatarUrl     = user.avatarUrl ?? null
        token.emailVerified = user.emailVerified ?? false
      }

      // Session.update() called from client (e.g., after profile change)
      if (trigger === "update" && session) {
        if (session.name)      token.name      = session.name
        if (session.avatarUrl) token.avatarUrl = session.avatarUrl
      }

      return token
    },

    /**
     * session callback — shapes the Session object returned by auth().
     * Never expose passwordHash or other sensitive token fields here.
     */
    async session({ session, token }) {
      session.user.id            = token.id as string
      session.user.role          = token.role as any
      session.user.avatarUrl     = token.avatarUrl as string | null
      session.user.emailVerified = token.emailVerified as any
      return session
    },

    /**
     * redirect callback — controls where the user lands after sign-in.
     * Respects ?callbackUrl but falls back to role-based default.
     */
    async redirect({ url, baseUrl }) {
      // Relative URL: allow it
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Same origin: allow it
      if (new URL(url).origin === baseUrl) return url
      // Cross-origin: fall back to base
      return baseUrl
    },
  },
})
