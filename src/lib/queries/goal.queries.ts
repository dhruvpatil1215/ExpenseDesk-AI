/**
 * Goal DB Queries
 * Path: src/lib/queries/goal.queries.ts
 */

import { prisma } from "@/lib/db"

export interface SerializedGoal {
  id:            string
  userId:        string
  name:          string
  description:   string | null
  targetAmount:  number  // paise
  currentAmount: number  // paise
  targetDate:    string | null  // YYYY-MM-DD
  icon:          string | null
  color:         string | null
  status:        "ACTIVE" | "COMPLETED" | "ARCHIVED"
  completedAt:   string | null
  createdAt:     string
}

export async function getGoals(userId: string): Promise<SerializedGoal[]> {
  const goals = await prisma.goal.findMany({
    where:   { userId },
    orderBy: [
      { status: "asc" }, // ACTIVE first, then COMPLETED, then ARCHIVED
      { targetDate: "asc" },
    ],
  })

  return goals.map((g: any) => ({
    id:            g.id,
    userId:        g.userId,
    name:          g.name,
    description:   g.description,
    targetAmount:  Number(g.targetAmount),
    currentAmount: Number(g.currentAmount),
    targetDate:    g.targetDate ? g.targetDate.toISOString().split("T")[0] : null,
    icon:          g.icon,
    color:         g.color,
    status:        g.status as any,
    completedAt:   g.completedAt ? g.completedAt.toISOString() : null,
    createdAt:     g.createdAt.toISOString(),
  }))
}