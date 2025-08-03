"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function RedirectToApprovals() {
  const router = useRouter()
  
  // Redirect immediately to the correct approvals page
  useEffect(() => {
    router.replace("/dashboard/work/approvals")
  }, [router])
  
  // Return empty div as this will never be seen
  return <div className="hidden"></div>
}
