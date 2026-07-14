/**
 * Settings Page (Server Component)
 * Path: src/app/(dashboard)/settings/page.tsx
 */

import type { Metadata } from "next"
import { auth, signOut }  from "@/auth"
import { redirect }       from "next/navigation"

export const metadata: Metadata = {
  title:       "Settings",
  description: "Manage your user profile and settings.",
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  return (
    <div className="settings-page">
      <div className="txn-header" style={{ marginBottom: "1.5rem" }}>
        <div className="txn-header__left">
          <h1 className="txn-header__title">Settings</h1>
          <span className="txn-header__count">Manage your user profile and preferences</span>
        </div>
      </div>

      <div style={{ maxWidth: "600px", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* User Card */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>My Profile</h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--color-text-muted)" }}>Name:</span>
            <strong style={{ color: "var(--color-text)" }}>{session.user.name}</strong>

            <span style={{ color: "var(--color-text-muted)" }}>Email:</span>
            <strong style={{ color: "var(--color-text)" }}>{session.user.email}</strong>

            <span style={{ color: "var(--color-text-muted)" }}>Role:</span>
            <strong style={{ color: "#6366f1" }}>{session.user.role}</strong>
          </div>

          {/* Sign out */}
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
            style={{ marginTop: "0.5rem" }}
          >
            <button type="submit" className="btn btn--danger" style={{ width: "fit-content" }}>
              Logout Session
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}