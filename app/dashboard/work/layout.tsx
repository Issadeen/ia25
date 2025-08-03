"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

export default function WorkLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  
  // Handle misspelled routes
  useEffect(() => {
    // Check for common misspellings and redirect
    if (pathname === "/dashboard/work/approval") {
      router.replace("/dashboard/work/approvals")
    }
    // Add other redirects as needed
  }, [pathname, router])
  
  return <>{children}</>
}
