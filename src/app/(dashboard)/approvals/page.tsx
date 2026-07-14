/**
 * Approvals Page (Server Component)
 * Path: src/app/(dashboard)/approvals/page.tsx
 *
 * MANAGER only route.
 */

import type { Metadata } from "next"
import { auth }           from "@/auth"
import { redirect }       from "next/navigation"
import { prisma }         from "@/lib/db"
import { ApprovalQueue }  from "@/components/approvals/ApprovalQueue"

export const metadata: Metadata = {
  title:       "Approvals",
  description: "Manager reviews pending expense submissions.",
}

export default async function ApprovalsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "MANAGER") {
    redirect("/transactions")
  }

  // Fetch PENDING transactions requiring manager review
  const pendingRaw = await prisma.transaction.findMany({
    where: {
      status:    "PENDING",
      isDeleted: false,
    },
    include: {
      user:     { select: { name: true, email: true } },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const pending = pendingRaw.map((t) => ({
    id:                  t.id,
    userId:              t.userId,
    accountId:           t.accountId,
    accountName:         "",
    categoryId:          t.categoryId,
    categoryName:        t.category?.name ?? null,
    categoryColor:       null,
    categoryIcon:        null,
    type:                t.type as any,
    amount:              Number(t.amount), // Convert BigInt to number
    currency:            t.currency,
    description:         t.description,
    notes:               t.notes,
    transactionDate:     t.transactionDate.toISOString().split("T")[0],
    tags:                t.tags,
    status:              t.status,
    receiptUrl:          t.receiptUrl,
    isRecurring:         t.isRecurring,
    transferToAccountId: t.transferToAccountId,
    createdAt:           t.createdAt.toISOString(),
    updatedAt:           t.updatedAt.toISOString(),
    user:                t.user,
  }))

  return (
    <div className="approvals-page">
      <div className="txn-header" style={{ marginBottom: "1.5rem" }}>
        <div className="txn-header__left">
          <h1 className="txn-header__title">Pending Approvals</h1>
          <span className="txn-header__count">{pending.length} pending review</span>
        </div>
      </div>

      <ApprovalQueue pending={pending} />
    </div>
  )
}