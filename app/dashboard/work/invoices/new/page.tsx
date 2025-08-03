"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Construction } from "lucide-react"

export default function NewInvoicePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Create New Invoice
            </h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="max-w-lg mx-auto">
          <CardHeader className="flex flex-row items-center gap-4">
            <Construction className="h-12 w-12 text-amber-500" />
            <div>
              <CardTitle>Under Construction</CardTitle>
              <CardDescription>This feature is coming soon</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The invoice creation feature is currently being developed. Please check back later.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => router.push("/dashboard/work")}>
              Return to Work Dashboard
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}
