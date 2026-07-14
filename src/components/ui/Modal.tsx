/**
 * Modal Component
 * Path: src/components/ui/Modal.tsx
 *
 * Accessible modal dialog using the native HTML <dialog> element.
 * Closes on: Escape key, backdrop click, or explicit onClose call.
 */

"use client"

import { useEffect, useRef } from "react"

interface ModalProps {
  open:       boolean
  onClose:    () => void
  title:      string
  children:   React.ReactNode
  size?:      "sm" | "md" | "lg"
  className?: string
}

export function Modal({
  open, onClose, title, children, size = "md", className = ""
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open) {
      if (!el.open) el.showModal()
    } else {
      if (el.open) el.close()
    }
  }, [open])

  // Close on backdrop click
  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const inDialog =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top  && e.clientY <= rect.bottom
    if (!inDialog) onClose()
  }

  return (
    <dialog
      ref={ref}
      className={`modal modal--${size} ${className}`}
      onClick={handleClick}
      onClose={onClose}
    >
      <div className="modal__inner">
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </dialog>
  )
}