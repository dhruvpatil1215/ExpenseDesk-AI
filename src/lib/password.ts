/**
 * Password Hashing Utilities
 * Date: 2026-07-10
 *
 * Uses bcryptjs (pure-JS bcrypt; no native bindings required).
 * Salt rounds: 12 — OWASP minimum for production (balances security
 * vs. ~250ms hash time on modern hardware).
 *
 * Why bcryptjs instead of argon2?
 *   bcryptjs has zero native dependencies, making it ideal for
 *   serverless / edge-adjacent environments like Vercel.
 *   Argon2 is preferred if running on a dedicated server.
 *
 * Usage:
 *   const hash = await hashPassword("myP@ssw0rd")
 *   const ok   = await verifyPassword("myP@ssw0rd", hash)
 */

import bcrypt from "bcryptjs"

/** Number of salt rounds. Increase to 13-14 for higher-security deployments. */
const SALT_ROUNDS = 12

/**
 * Hashes a plaintext password.
 * Always call this server-side; never in a Client Component.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext || plaintext.length < 8) {
    throw new Error("Password must be at least 8 characters")
  }
  return bcrypt.hash(plaintext, SALT_ROUNDS)
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 * Returns true if they match, false otherwise.
 * Safe against timing attacks (bcrypt.compare is constant-time).
 */
export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  if (!plaintext || !hash) return false
  return bcrypt.compare(plaintext, hash)
}
