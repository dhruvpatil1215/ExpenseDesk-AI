/**
 * Finance Page (Server Component)
 * Path: src/app/(dashboard)/finance/page.tsx
 *
 * FINANCE only route.
 */

import type { Metadata } from "next"
import { auth }           from "@/auth"
import { redirect }       from "next/navigation"
import { prisma }         from "@/lib/db"
import { FinanceReimbursements } from "@/components/finance/FinanceReimbursements"

export const metadata: Metadata = {
  title:       "Finance Dashboard",
  description: "Finance administrator manages approved reimbursements.",
}

export default async function FinancePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "FINANCE") {
    redirect("/transactions")
  }

  // Fetch APPROVED (but not yet REIMBURSED) expense transactions
  const approvedRaw = await prisma.transaction.findMany({
    where: {
      status:    "APPROVED",
      isDeleted: false,
    },
    include: {
      user:     { select: { name: true, email: true } },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const approved = approvedRaw.map((t) => ({
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
    <div className="finance-page">
      <div className="txn-header" style={{ marginBottom: "1.5rem" }}>
        <div className="txn-header__left">
          <h1 className="txn-header__title">Finance & Reimbursements</h1>
          <span className="txn-header__count">{approved.length} approved expenses pending payment</span>
        </div>
      </div>

      <FinanceReimbursements approved={approved} />
    </div>
  )
}