/**
 * Categories Page (Server Component)
 * Path: src/app/(dashboard)/categories/page.tsx
 */

import type { Metadata } from "next"
import { Suspense }       from "react"
import { auth }           from "@/auth"
import { redirect }       from "next/navigation"
import { getCategories }  from "@/lib/queries/category.queries"
import { CategoryList }   from "@/components/categories/CategoryList"

export const metadata: Metadata = {
  title:       "Categories",
  description: "Manage system defaults and create custom financial categories.",
}

export const revalidate = 60

export default async function CategoriesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const categories = await getCategories(session.user.id)

  return (
    <Suspense fallback={<CategoriesSkeleton />}>
      <CategoryList categories={categories} />
    </Suspense>
  )
}

function CategoriesSkeleton() {
  return (
    <div className="cat-module" aria-busy="true">
      <div className="txn-header">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--btn" />
      </div>
      <div className="skeleton skeleton--filters" style={{ height: "40px", marginTop: "1rem" }} />
      <div className="cat-grid" style={{ marginTop: "1.5rem" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: "140px", borderRadius: "12px" }} />
        ))}
      </div>
    </div>
  )
}