/**
 * Goal Server Actions
 * Path: src/server/actions/goal.actions.ts
 */

"use server"

import { revalidatePath } from "next/cache"
import { prisma }         from "@/lib/db"
import { requireAuth }    from "@/lib/session"
import { createGoalSchema, updateGoalSchema } from "@/lib/validators/goal.schema"
import type { ActionResult } from "./transaction.actions"
import type { SerializedGoal } from "@/lib/queries/goal.queries"

function serialize(g: any): SerializedGoal {
  return {
    id:            g.id,
    userId:        g.userId,
    name:          g.name,
    description:   g.description,
    targetAmount:  Number(g.targetAmount),
    currentAmount: Number(g.currentAmount),
    targetDate:    g.targetDate ? g.targetDate.toISOString().split("T")[0] : null,
    icon:          g.icon,
    color:         g.color,
    status:        g.status,
    completedAt:   g.completedAt ? g.completedAt.toISOString() : null,
    createdAt:     g.createdAt.toISOString(),
  }
}

// ── createGoal ────────────────────────────────────────────────

export async function createGoal(
  rawData: Record<string, unknown>
): Promise<ActionResult<SerializedGoal>> {
  const user = await requireAuth()

  const parsed = createGoalSchema.safeParse(rawData)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the validation errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { name, description, targetAmount, currentAmount, targetDate, icon, color } = parsed.data

  const date = targetDate ? new Date(targetDate) : null
  const status = currentAmount >= targetAmount ? "COMPLETED" : "ACTIVE"
  const completedAt = status === "COMPLETED" ? new Date() : null

  try {
    const goal = await prisma.goal.create({
      data: {
        userId:         user.id,
        name,
        description,
        targetAmount:  BigInt(targetAmount),
        currentAmount: BigInt(currentAmount),
        targetDate:    date,
        icon,
        color,
        status,
        completedAt,
      },
    })

    revalidatePath("/goals")
    revalidatePath("/insights")

    return { success: true, data: serialize(goal) }
  } catch {
    return { success: false, error: "Failed to create goal." }
  }
}

// ── updateGoal ────────────────────────────────────────────────

export async function updateGoal(
  id:      string,
  rawData: Record<string, unknown>
): Promise<ActionResult<SerializedGoal>> {
  const user = await requireAuth()

  const existing = await prisma.goal.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return { success: false, error: "Goal not found." }
  }

  const parsed = updateGoalSchema.safeParse(rawData)
  if (!parsed.success) {
    return {
      success:     false,
      error:       "Please fix the validation errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const { name, description, targetAmount, currentAmount, targetDate, icon, color, status } = parsed.data

  // Calculate new status if amount changed
  let newStatus = status ?? existing.status
  let targetVal = targetAmount !== undefined ? BigInt(targetAmount) : existing.targetAmount
  let currentVal = currentAmount !== undefined ? BigInt(currentAmount) : existing.currentAmount

  if (currentVal >= targetVal) {
    newStatus = "COMPLETED"
  } else if (newStatus === "COMPLETED" && currentVal < targetVal) {
    newStatus = "ACTIVE"
  }

  const completedAt = newStatus === "COMPLETED" && existing.status !== "COMPLETED"
    ? new Date()
    : newStatus !== "COMPLETED" ? null : existing.completedAt

  try {
    const goal = await prisma.goal.update({
      where: { id },
      data: {
        ...(name          !== undefined ? { name } : {}),
        ...(description   !== undefined ? { description } : {}),
        ...(targetAmount  !== undefined ? { targetAmount: targetVal } : {}),
        ...(currentAmount !== undefined ? { currentAmount: currentVal } : {}),
        ...(targetDate    !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
        ...(icon          !== undefined ? { icon } : {}),
        ...(color         !== undefined ? { color } : {}),
        status: newStatus,
        completedAt,
      },
    })

    revalidatePath("/goals")
    revalidatePath("/insights")

    return { success: true, data: serialize(goal) }
  } catch {
    return { success: false, error: "Failed to update goal." }
  }
}

// ── deleteGoal ────────────────────────────────────────────────

export async function deleteGoal(id: string): Promise<ActionResult> {
  const user = await requireAuth()

  const existing = await prisma.goal.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return { success: false, error: "Goal not found." }
  }

  try {
    await prisma.goal.delete({ where: { id } })

    revalidatePath("/goals")
    revalidatePath("/insights")

    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete goal." }
  }
}