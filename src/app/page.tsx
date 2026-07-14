/**
 * Index Page
 * Path: src/app/page.tsx
 *
 * Automatically redirects users:
 *   - Authenticated: redirect to /transactions
 *   - Unauthenticated: redirect to /login
 */

import { auth }     from "@/auth"
import { redirect } from "next/navigation"

export default async function IndexPage() {
  const session = await auth()

  if (session?.user?.id) {
    redirect("/transactions")
  } else {
    redirect("/login")
  }
}
