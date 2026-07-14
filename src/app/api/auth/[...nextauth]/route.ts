/**
 * NextAuth API Route Handler
 * Date: 2026-07-10
 * Path: src/app/api/auth/[...nextauth]/route.ts
 *
 * Catches all /api/auth/* requests and delegates them to Auth.js.
 * No business logic lives here — all logic is in src/auth.ts.
 */

import { handlers } from "@/auth"
export const { GET, POST } = handlers
export const runtime = "nodejs"