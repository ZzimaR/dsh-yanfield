import React from "react"
import { navigate } from "./navigation"

type Href = string | { pathname?: string; search?: string; hash?: string }

function hrefOf(href: Href): string {
  if (typeof href === "string") return href
  const path = href.pathname || "/"
  const search = href.search ? (href.search.startsWith("?") ? href.search : `?${href.search}`) : ""
  return `${path}${search}${href.hash || ""}`
}

export function useLinkStatus(): { pending: boolean } {
  return { pending: false }
}

export default function Link({
  href,
  replace,
  children,
  onClick,
  ...rest
}: {
  href: Href
  replace?: boolean
  children?: React.ReactNode
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const url = hrefOf(href)
  return (
    <a
      {...rest}
      href={url}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        navigate(url, replace ? "replace" : "push")
      }}
    >
      {children}
    </a>
  )
}
