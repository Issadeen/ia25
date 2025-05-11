"use client";

// Update imports to include useProfileImage
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getFirebaseAuth, getFirebaseStorage } from "@/lib/firebase"; // Add this import
import { ref as storageRef, getDownloadURL } from "firebase/storage";
import { updateProfile, User as FirebaseUser } from "firebase/auth"; // Add this import
import { 
  FileText, 
  ClipboardList, 
  Receipt, 
  PieChart, 
  Plus, 
  ArrowLeft,
  Moon,
  Sun,
  BarChart3,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { WorkCard } from "@/components/dashboard/WorkCard";
import { 
  getTruckAllocations, 
  calculateOptimalAllocation, 
  validatePaymentForm,
  updatePaymentStatuses 
} from "@/lib/payment-utils";
import { useProfileImage } from '@/hooks/useProfileImage'

export default function WorkPage() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const router = useRouter();
  const profilePicUrl = useProfileImage()  // Add this line

  // Updated work cards organization with new Permits card
  const workCards = [
    {
      title: "Entry Details",
      description: "View and manage Entries",
      icon: ClipboardList,
      actions: [
        { label: "Add Entries", href: "/dashboard/work/entries/new", icon: Plus },
        { label: "View Entries", href: "/dashboard/work/entries", icon: ClipboardList }
      ]
    },
    {
      title: "Permits & Allocations",
      description: "Manage permit allocations",
      icon: FileText,
      actions: [
        { label: "Allocate Permits", href: "/dashboard/work/permits", icon: Plus },
        { label: "Active Allocations", href: "/dashboard/work/permits/active", icon: CheckCircle2 },
        { label: "Admin", href: "/dashboard/work/permits/admin", icon: FileText }
      ]
    },
    {
      title: "Reports & Orders",
      description: "View and generate reports",
      icon: BarChart3,
      actions: [
        { label: "View Orders", href: "/dashboard/work/orders", icon: FileText },
        { label: "View Reports", href: "/dashboard/work/reports", icon: PieChart }
      ]
    },
    {
      title: "Invoices & Expenses",
      description: "Manage invoices and track expenses",
      icon: Receipt,
      actions: [
        { label: "Add Invoices", href: "/dashboard/work/invoices/new", icon: Plus },
        { label: "View Invoices", href: "/dashboard/work/invoices", icon: Receipt },
        { label: "Expense Tracker", href: "/dashboard/work/expenses/tracker", icon: BarChart3 }
      ]
    }
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Work Details
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Avatar 
              className="h-8 w-8 ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-background transition-shadow hover:ring-emerald-500/75 cursor-pointer"
              onClick={() => router.push('/dashboard')}
            >
              <AvatarImage 
                src={session?.user?.image || profilePicUrl || ''} 
                alt={session?.user?.name || 'User Profile'}
              />
              <AvatarFallback className="bg-emerald-100 text-emerald-700">
                {session?.user?.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
          {workCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="h-full"
            >
              <WorkCard {...card} />
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
