"use client"

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

function focusedElement(): HTMLElement | null {
  let element = document.activeElement
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement
  return element instanceof HTMLElement ? element : null
}

/** Keep a closing surface visible only while its own CSS transition runs. */
export function useOverlayMotion(open: boolean, ref: RefObject<HTMLElement | null>) {
  const [retained, setRetained] = useState(open)
  const previousFocus = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (open) {
      const active = focusedElement()
      if (active && !node?.contains(active)) previousFocus.current = active
      setRetained(true)
      return
    }

    const target = previousFocus.current
    previousFocus.current = null
    const active = focusedElement()
    if (node?.inert && target?.isConnected && !target.closest("[inert]") &&
      (node.contains(active) || !active || active === document.body)) {
      target.focus({ preventScroll: true })
    }

    const animations = node?.getAnimations?.() ?? []
    if (!animations.length) {
      setRetained(false)
      return
    }

    let cancelled = false
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (!cancelled) setRetained(false)
    })
    return () => { cancelled = true }
  }, [open, ref])

  return {
    present: open || retained,
    inert: !open,
    "data-yf-motion-state": open ? "open" : "closed",
  } as const
}
