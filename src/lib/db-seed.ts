/**
 * Lazy Database Seeder
 * Path: src/lib/db-seed.ts
 *
 * Ensures that:
 * 1. Global system-default categories exist in the database (userId = null).
 * 2. Every user has at least one default Checking Account and Cash Account.
 */

import { prisma } from "@/lib/db"

const DEFAULT_CATEGORIES = [
  { name: "Uncategorized",   type: "EXPENSE" as const, icon: "📦", color: "#64748B", isDefault: true },
  { name: "Food & Dining",   type: "EXPENSE" as const, icon: "🍔", color: "#EF4444", isDefault: false },
  { name: "Shopping",        type: "EXPENSE" as const, icon: "🛍️", color: "#EC4899", isDefault: false },
  { name: "Housing & Rent",  type: "EXPENSE" as const, icon: "🏠", color: "#3B82F6", isDefault: false },
  { name: "Transportation",  type: "EXPENSE" as const, icon: "🚗", color: "#F59E0B", isDefault: false },
  { name: "Utilities",       type: "EXPENSE" as const, icon: "⚡", color: "#84CC16", isDefault: false },
  { name: "Salary & Pay",    type: "INCOME"  as const, icon: "💰", color: "#10B981", isDefault: true },
  { name: "Investments",     type: "INCOME"  as const, icon: "📈", color: "#06B6D4", isDefault: false },
]

export async function ensureDefaultCategoriesAndAccounts(userId: string): Promise<void> {
  // ── 1. Seed global system categories if none exist ───────────
  const sysCatCount = await prisma.category.count({
    where: { userId: null },
  })

  if (sysCatCount === 0) {
    console.log("Seeding system default categories...")
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({
        name:      c.name,
        type:      c.type,
        icon:      c.icon,
        color:     c.color,
        isDefault: c.isDefault,
        userId:    null, // system-wide
      })),
    })
  }

  // ── 2. Seed default accounts for this specific user ──────────
  const userAccCount = await prisma.account.count({
    where: { userId, isActive: true },
  })

  if (userAccCount === 0) {
    console.log(`Seeding default accounts for user ${userId}...`)
    // Create Checking (50k INR = 5,000,000 paise) and Cash (5k INR = 500,000 paise)
    await prisma.account.createMany({
      data: [
        {
          userId,
          name:     "Checking Account",
          type:     "CHECKING",
          balance:  BigInt(5000000),
          currency: "INR",
          color:    "#6366F1",
          icon:     "💳",
          isActive: true,
        },
        {
          userId,
          name:     "Cash Wallet",
          type:     "CASH",
          balance:  BigInt(500000),
          currency: "INR",
          color:    "#10B981",
          icon:     "💵",
          isActive: true,
        },
      ],
    })
  }
}
