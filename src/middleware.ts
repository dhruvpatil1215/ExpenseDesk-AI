/**
 * Next.js Middleware — Auth & RBAC Route Protection
 * Date: 2026-07-10
 * Path: src/middleware.ts
 *
 * Runs on every matched request BEFORE the page renders.
 * Reads the Auth.js JWT from the encrypted cookie (no DB call).
 *
 * Protection rules (mirrors plan section 3 RBAC matrix):
 *
 *   /login, /register          -> redirect to dashboard if already logged in
 *   /dashboard, /expenses,
 *   /settings                  -> any authenticated user
 *   /approvals, /approvals/*   -> MANAGER only
 *   /finance,   /finance/*     -> FINANCE only
 *   /api/*                     -> passthrough (API routes self-protect via
 *                                  requireAuth() / requireRole() helpers)
 *   everything else            -> public (landing page, etc.)
 *
 * The `config.matcher` below deliberately excludes:
 *   - _next/static / _next/image (Next.js internals)
 *   - favicon.ico, robots.txt
 *   - /api/auth/* (NextAuth routes must be public)
 */

import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { classifyRoute, hasRequiredRole, getDefaultRedirect } from "@/lib/rbac"
import { Role } from "@/types/database"

export default auth((req) => {
  const { nextUrl } = req
  const session = req.auth

  const isLoggedIn  = !!session?.user
  const userRole    = session?.user?.role as Role | undefined
  const pathname    = nextUrl.pathname

  const { requiresAuth, requiredRole, isAuthPage } = classifyRoute(pathname)

  // ── 1. Auth page + already logged in → redirect to role home ─
  if (isAuthPage && isLoggedIn) {
    const destination = getDefaultRedirect(userRole ?? Role.EMPLOYEE)
    return NextResponse.redirect(new URL(destination, nextUrl))
  }

  // ── 2. Protected route + not logged in → redirect to login ───
  if (requiresAuth && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── 3. Role-restricted route + wrong role → redirect to home ─
  if (requiresAuth && isLoggedIn && !hasRequiredRole(userRole, requiredRole)) {
    const home = getDefaultRedirect(userRole ?? Role.EMPLOYEE)
    return NextResponse.redirect(new URL(home, nextUrl))
  }

  // ── 4. All checks passed → allow request ─────────────────────
  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *   - _next/static (static files)
     *   - _next/image  (image optimisation)
     *   - favicon.ico, robots.txt, sitemap.xml
     *   - /api/auth/*  (NextAuth must be public)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/auth).*)",
  ],
}