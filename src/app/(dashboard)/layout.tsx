/**
 * Dashboard Layout
 * Path: src/app/(dashboard)/layout.tsx
 *
 * Server Component — checks auth before rendering anything.
 * Renders the persistent sidebar + topbar shell.
 * Wraps children with <ToastProvider> for in-app notifications.
 */

import type { Metadata } from "next"
import { redirect }      from "next/navigation"
import Link              from "next/link"
import { auth }          from "@/auth"
import { ToastProvider } from "@/components/ui/Toast"
import "@/styles/dashboard.css"

export const metadata: Metadata = {
  title: {
    template: "%s | ExpenseDesk AI",
    default:  "Dashboard | ExpenseDesk AI",
  },
}

const NAV_ITEMS = [
  { href: "/dashboard",    icon: "📊", label: "Dashboard",    roles: ["EMPLOYEE","MANAGER","FINANCE"] },
  { href: "/transactions", icon: "💸", label: "Transactions", roles: ["EMPLOYEE","MANAGER","FINANCE"] },
  { href: "/budgets",      icon: "📋", label: "Budgets",      roles: ["EMPLOYEE","MANAGER","FINANCE"] },
  { href: "/goals",        icon: "🎯", label: "Goals",        roles: ["EMPLOYEE","MANAGER","FINANCE"] },
  { href: "/categories",   icon: "🏷️", label: "Categories",  roles: ["EMPLOYEE","MANAGER","FINANCE"] },
  { href: "/approvals",    icon: "✅", label: "Approvals",    roles: ["MANAGER"] },
  { href: "/finance",      icon: "💼", label: "Finance",      roles: ["FINANCE"] },
  { href: "/settings",     icon: "⚙️", label: "Settings",    roles: ["EMPLOYEE","MANAGER","FINANCE"] },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const role      = session.user.role
  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(role))

  return (
    <ToastProvider>
      <div className="dash-shell">
        {/* Sidebar */}
        <aside className="dash-sidebar" aria-label="Sidebar navigation">
          {/* Brand */}
          <div className="dash-brand">
            <span className="dash-brand__icon">💳</span>
            <span className="dash-brand__name">ExpenseDesk</span>
          </div>

          {/* Nav */}
          <nav className="dash-nav" aria-label="Main navigation">
            {visibleNav.map((item) => (
              <Link key={item.href} href={item.href} className="dash-nav__item">
                <span className="dash-nav__icon">{item.icon}</span>
                <span className="dash-nav__label">{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* User */}
          <div className="dash-user">
            <div className="dash-user__avatar">
              {session.user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="dash-user__info">
              <span className="dash-user__name">{session.user.name}</span>
              <span className="dash-user__role">{role}</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="dash-main">
          {children}
        </main>
      </div>
    </ToastProvider>
  )
}