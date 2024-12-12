'use client'

import React from 'react'
import { GatePassForm } from "components/ui/molecules/GatePassForm"
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from "components/ui/toaster"

export default function GatePassPage() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold text-center mb-8 dark:text-white">Gate Pass Generator</h1>
        <GatePassForm />
        <Toaster />
      </div>
    </ThemeProvider>
  )
}

