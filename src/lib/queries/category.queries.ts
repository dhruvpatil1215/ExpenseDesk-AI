/**
 * Category DB Queries
 * Path: src/lib/queries/category.queries.ts
 */

import { prisma } from "@/lib/db"

export interface SerializedCategory {
  id:         string
  userId:     string | null
  name:       string
  type:       "INCOME" | "EXPENSE"
  icon:       string | null
  color:      string | null
  isDefault:  boolean
  createdAt:  string
  _count?: {
    transactions: number
  }
}

export async function getCategories(userId: string): Promise<SerializedCategory[]> {
  const rows = await prisma.category.findMany({
    where: {
      OR: [
        { userId },
        { userId: null }, // System default categories
      ],
    },
    include: {
      _count: {
        select: {
          transactions: {
            where: { isDeleted: false },
          },
        },
      },
    },
    orderBy: [
      { isDefault: "desc" },
      { name: "asc" },
    ],
  })

  return rows.map((c: any) => ({
    id:        c.id,
    userId:    c.userId,
    name:      c.name,
    type:      c.type as "INCOME" | "EXPENSE",
    icon:      c.icon,
    color:     c.color,
    isDefault: c.isDefault,
    createdAt: c.createdAt.toISOString(),
    _count:    c._count,
  }))
}