/**
 * Category Server Actions
 * Path: src/server/actions/category.actions.ts
 */

"use server"

import { revalidatePath } from "next/cache"
import { prisma }         from "@/lib/db"
import { requireAuth }    from "@/lib/session"
import { createCategorySchema, updateCategorySchema } from "@/lib/validators/category.schema"
import type { ActionResult } from "./transaction.actions"
import type { SerializedCategory } from "@/lib/queries/category.queries"

const INCLUDE_TX_COUNT = {
  _count: {
    select: {
      transactions: {
        where: { isDeleted: false },
      },
    },
  },
}

function serialize(c: any): SerializedCategory {
  return {
    id:        c.id,
    userId:    c.userId,
    name:      c.name,
    type:      c.type as "INCOME" | "EXPENSE",
    icon:      c.icon,
    color:     c.color,
    isDefault: c.isDefault,
    createdAt: c.createdAt.toISOString(),
    _count:    c._count,
  }
}

// ── createCategory ────────────────────────────────────────────

export async function createCategory(
  rawData: Record<string, unknown>
): Promise<ActionResult<SerializedCategory>> {
  const user = await requireAuth()

  const parsed = createCategorySchema.safeParse(rawData)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the validation errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { name, type, icon, color } = parsed.data

  // Check if a category with same name already exists for this user (or is system default)
  const existing = await prisma.category.findFirst({
    where: {
      name:   { equals: name, mode: "insensitive" },
      OR: [
        { userId: user.id },
        { userId: null },
      ],
    },
  })

  if (existing) {
    return {
      success:     false,
      error:       "A category with this name already exists.",
      fieldErrors: { name: ["This category name is already in use."] },
    }
  }

  try {
    const cat = await prisma.category.create({
      data: {
        userId: user.id,
        name,
        type,
        icon,
        color,
        isDefault: false,
      },
      include: INCLUDE_TX_COUNT,
    })

    revalidatePath("/categories")
    revalidatePath("/transactions")

    return { success: true, data: serialize(cat) }
  } catch {
    return { success: false, error: "Failed to create category. Please try again." }
  }
}

// ── updateCategory ────────────────────────────────────────────

export async function updateCategory(
  id:      string,
  rawData: Record<string, unknown>
): Promise<ActionResult<SerializedCategory>> {
  const user = await requireAuth()

  const existing = await prisma.category.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return { success: false, error: "Category not found or you do not have permission to edit it." }
  }

  const parsed = updateCategorySchema.safeParse(rawData)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the validation errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { name, type, icon, color } = parsed.data

  if (name) {
    const duplicate = await prisma.category.findFirst({
      where: {
        id:     { not: id },
        name:   { equals: name, mode: "insensitive" },
        OR: [
          { userId: user.id },
          { userId: null },
        ],
      },
    })
    if (duplicate) {
      return {
        success:     false,
        error:       "A category with this name already exists.",
        fieldErrors: { name: ["This category name is already in use."] },
      }
    }
  }

  try {
    const cat = await prisma.category.update({
      where: { id },
      data: {
        ...(name  !== undefined ? { name }  : {}),
        ...(type  !== undefined ? { type }  : {}),
        ...(icon  !== undefined ? { icon }  : {}),
        ...(color !== undefined ? { color } : {}),
      },
      include: INCLUDE_TX_COUNT,
    })

    revalidatePath("/categories")
    revalidatePath("/transactions")

    return { success: true, data: serialize(cat) }
  } catch {
    return { success: false, error: "Failed to update category." }
  }
}

// ── deleteCategory ────────────────────────────────────────────

export async function deleteCategory(id: string): Promise<ActionResult> {
  const user = await requireAuth()

  const existing = await prisma.category.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return { success: false, error: "Category not found or you do not have permission to delete it." }
  }

  try {
    // 1. Locate the default "Uncategorized" category (or create it if missing)
    let uncategorized = await prisma.category.findFirst({
      where: {
        name:   "Uncategorized",
        userId: null,
      },
    })

    if (!uncategorized) {
      uncategorized = await prisma.category.create({
        data: {
          name:      "Uncategorized",
          type:      "EXPENSE",
          icon:      "📦",
          color:     "#6B7280",
          isDefault: true,
        },
      })
    }

    // 2. Re-route transactions of this category to "Uncategorized" inside a transaction
    await prisma.$transaction([
      prisma.transaction.updateMany({
        where: { categoryId: id, userId: user.id },
        data:  { categoryId: uncategorized.id },
      }),
      prisma.category.delete({
        where: { id },
      }),
    ])

    revalidatePath("/categories")
    revalidatePath("/transactions")

    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete category." }
  }
}