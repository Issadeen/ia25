"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function InvoicesNotFound() {
  const router = useRouter()
  
  // Automatically redirect after 3 seconds
  useEffect(() => {
    const redirectTimer = setTimeout(() => {
      router.push("/dashboard/work/invoices/new")
    }, 3000)
    
    return () => clearTimeout(redirectTimer)
  }, [router])
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-6 p-8">
        <div className="flex justify-center">
          <AlertTriangle className="h-16 w-16 text-amber-500" />
        </div>
        <h1 className="text-4xl font-bold">Invoices Area Not Found</h1>
        <p className="text-muted-foreground">
          The Invoice page you're looking for doesn't exist. You'll be redirected to the New Invoice page in a few seconds.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Button 
            variant="outline" 
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button onClick={() => router.push("/dashboard/work/invoices/new")}>
            New Invoice
          </Button>
        </div>
      </div>
    </div>
  )
}
