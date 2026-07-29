import * as React from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

interface DialogContextValue {
  titleId: string
  onClose: () => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error("Dialog compound parts must be used inside <Dialog>")
  return ctx
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = React.useId()
  const contentRef = React.useRef<HTMLDivElement>(null)
  const previousActiveElement = React.useRef<Element | null>(null)
  const reduceMotion = useReducedMotion()

  React.useEffect(() => {
    if (!open) return
    previousActiveElement.current = document.activeElement
    const firstFocusable = contentRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as HTMLElement | null
    firstFocusable?.focus()
  }, [open])

  React.useEffect(() => {
    if (!open) {
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus()
      }
      return
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onOpenChange(false)
        return
      }
      if (e.key === "Tab") {
        const focusables = Array.from(
          contentRef.current?.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ) || []
        ).filter((el) => {
          const htmlEl = el as HTMLElement
          return htmlEl.tabIndex >= 0 && !(htmlEl as HTMLButtonElement | HTMLInputElement).disabled
        }) as HTMLElement[]
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  const overlayTransition = reduceMotion ? { duration: 0.2 } : { duration: 0.3 }
  const contentTransition = reduceMotion
    ? { duration: 0.2 }
    : { type: "spring" as const, bounce: 0, duration: 0.4 }

  return createPortal(
    <AnimatePresence>
      {open && (
        <DialogContext.Provider value={{ titleId, onClose: () => onOpenChange(false) }}>
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
          >
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => onOpenChange(false)}
              aria-hidden="true"
            />
            <motion.div
              ref={contentRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative z-50 w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={contentTransition}
            >
              {children}
            </motion.div>
          </motion.div>
        </DialogContext.Provider>
      )}
    </AnimatePresence>,
    document.body
  )
}

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left mb-4", className)} {...props} />
)

const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
  const { titleId } = useDialogContext()
  return <h2 id={titleId} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
}

const DialogContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("", className)} {...props} />
)

export { Dialog, DialogHeader, DialogTitle, DialogContent }
