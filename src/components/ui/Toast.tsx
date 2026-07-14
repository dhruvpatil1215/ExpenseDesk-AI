/**
 * Toast Notification System
 * Path: src/components/ui/Toast.tsx
 *
 * Provides: <ToastProvider>, useToast hook, <ToastViewport>
 *
 * Usage:
 *   1. Wrap your layout with <ToastProvider>
 *   2. Call hooks anywhere inside:
 *        const { toast } = useToast()
 *        toast.success("Transaction created!")
 *        toast.error("Something went wrong")
 *        toast.info("Processing...")
 */

"use client"

import {
  createContext, useCallback, useContext,
  useEffect, useId, useRef, useState,
} from "react"

// ── Types ─────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info" | "warning"

interface Toast {
  id:        string
  message:   string
  variant:   ToastVariant
  duration:  number
  removing?: boolean
}

interface ToastContextValue {
  toast: {
    success: (msg: string, duration?: number) => void
    error:   (msg: string, duration?: number) => void
    info:    (msg: string, duration?: number) => void
    warning: (msg: string, duration?: number) => void
    dismiss: (id: string) => void
  }
}

// ── Context ───────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const idCounter = useRef(0)

  const remove = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, removing: true } : t))
    )
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 280)
  }, [])

  const add = useCallback(
    (message: string, variant: ToastVariant, duration = 4000) => {
      const id = `toast-${++idCounter.current}`
      setToasts((prev) => [...prev, { id, message, variant, duration }])

      const timer = setTimeout(() => remove(id), duration)
      timers.current.set(id, timer)
    },
    [remove]
  )

  const dismiss = useCallback(
    (id: string) => {
      const t = timers.current.get(id)
      if (t) clearTimeout(t)
      timers.current.delete(id)
      remove(id)
    },
    [remove]
  )

  // Clean up timers on unmount
  useEffect(() => {
    const t = timers.current
    return () => t.forEach(clearTimeout)
  }, [])

  const value: ToastContextValue = {
    toast: {
      success: (msg, dur) => add(msg, "success", dur),
      error:   (msg, dur) => add(msg, "error",   dur ?? 6000),
      info:    (msg, dur) => add(msg, "info",     dur),
      warning: (msg, dur) => add(msg, "warning",  dur),
      dismiss,
    },
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>")
  return ctx
}

// ── Viewport ──────────────────────────────────────────────────

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts:    Toast[]
  onDismiss: (id: string) => void
}) {
  if (!toasts.length) return null

  return (
    <div className="toast-viewport" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

// ── Individual toast ──────────────────────────────────────────

const ICONS: Record<ToastVariant, string> = {
  success: "✓",
  error:   "✕",
  info:    "ℹ",
  warning: "⚠",
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast:     Toast
  onDismiss: (id: string) => void
}) {
  return (
    <div
      className={`toast toast--${toast.variant}${toast.removing ? " toast--out" : ""}`}
      role="alert"
    >
      <span className="toast__icon">{ICONS[toast.variant]}</span>
      <span className="toast__message">{toast.message}</span>
      <button
        className="toast__close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}