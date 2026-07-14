/**
 * Prisma Client Singleton
 * Date: 2026-07-10
 *
 * Next.js hot-reload creates new module instances on every change.
 * Without this pattern, each reload opens a new Postgres connection
 * and the pool is quickly exhausted.
 *
 * Solution: store the client on `globalThis` in development so it
 * survives hot reloads. In production, a fresh instance is created
 * once at cold-start and reused.
 *
 * Usage:
 *   import { prisma } from "@/lib/db"
 *   const user = await prisma.user.findUnique({ where: { id } })
 */

import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
