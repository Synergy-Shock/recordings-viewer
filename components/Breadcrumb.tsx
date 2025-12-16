'use client'

import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          {index > 0 && <span className="text-zinc-600">/</span>}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-zinc-200 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-zinc-200 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
