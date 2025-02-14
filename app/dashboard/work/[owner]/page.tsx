"use client"

import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { database } from "@/lib/firebase"
import { ref, onValue, update, get, push } from "firebase/database"
import { formatNumber, toFixed2, cn } from "@/lib/utils" // Add cn to imports
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/components/ui/use-toast"
// Import all the interfaces from a shared types file
import type { WorkDetail, TruckPayment, OwnerBalance } from "@/types"
import { motion, AnimatePresence } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSession } from "next-auth/react"
import {
  ArrowLeft,
  Download,
  Wallet2,
  PlusCircle,
  X,
  FileSpreadsheet,
  RefreshCw,
  MoreHorizontal,
  Search,
  ArrowUp,
  ArrowDown,
  MoveVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react" // Add X and FileSpreadsheet icon to imports
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle" // Add ThemeToggle import
import { Skeleton } from "@/components/ui/skeleton"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { OwnerBalanceDialog } from "@/components/ui/molecules/owner-balance-dialog" // Add OwnerBalanceDialog import
import * as XLSX from "xlsx" // Add XLSX import
import {
  getTruckAllocations,
  syncTruckPaymentStatus, // Add syncTruckPaymentStatus import
  type PaymentCorrection,
  correctPaymentAllocation, // Add PaymentCorrection and correctPaymentAllocation import
} from "@/lib/payment-utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog" // Add AlertDialog imports
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu" // Add DropdownMenu imports
import { AlertCircle, Receipt, Shield } from "lucide-react" // Add new imports
import { useProfileImage } from "@/hooks/useProfileImage"
import React from "react"

// Add interfaces at the top
interface TruckAllocation {
  totalAllocated: number
  totalDue: number
  balance: number
  pendingAmount: number
}

interface OwnerTotals {
  totalDue: number
  totalPaid: number
  pendingTotal: number
  balance: number
  existingBalance: number
}

// Update the BalanceUsage interface to include the type field
interface BalanceUsage {
  amount: number
  timestamp: string
  usedFor: string[]
  paymentId: string
  type: "deposit" | "usage" // Add this field
  note?: string // Add optional note field
}

// Add new type
interface Prepayment extends BalanceUsage {
  type: "deposit"
  amount: number
  timestamp: string
  note?: string
}

// Add new interface for truck payment history
interface TruckPaymentHistory {
  paymentId: string
  timestamp: string
  amount: number
  note: string
  truckNumber: string
}

// Add new type for grouped payments
interface GroupedTruckPayment {
  truckNumber: string
  total: number
  payments: {
    date: Date
    paymentId: string
    amount: number
    note: string
  }[]
}

// Add new interface for ordered payments
interface OrderedTruckPayment {
  truckId: string
  order: number
}

// Add these animation variants before the component
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const slideUp = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 },
}

const staggeredList = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const listItem = {
  hidden: { x: -20, opacity: 0 },
  visible: { x: 0, opacity: 1 },
}

export default function OwnerDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const owner = decodeURIComponent(params.owner as string)

  // State management
  const [isLoading, setIsLoading] = useState(true)
  const [ownerDetails, setOwnerDetails] = useState<any>(null)
  const [ownerPayments, setOwnerPayments] = useState<any[]>([])
  const [balanceUsageHistory, setBalanceUsageHistory] = useState<BalanceUsage[]>([])
  const [ownerBalance, setOwnerBalance] = useState<OwnerBalance | null>(null)
  const [workDetails, setWorkDetails] = useState<WorkDetail[]>([])
  const [truckPayments, setTruckPayments] = useState<{ [truckId: string]: TruckPayment[] }>({})
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const { data: session } = useSession()
  const [sortConfig, setSortConfig] = useState<{
    key: string
    direction: "asc" | "desc"
  }>({ key: "truck_number", direction: "asc" })
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false) // Add state for balance dialog

  // Add new state for the feature
  const [ownerNameClickCount, setOwnerNameClickCount] = useState(0)
  const [isBalanceEditMode, setIsBalanceEditMode] = useState(false)
  const [manualBalance, setManualBalance] = useState<string>("")

  // Add new state variables after the existing state declarations
  const [showPendingOrders, setShowPendingOrders] = useState(false)
  const [orderStatsClickCount, setOrderStatsClickCount] = useState(0)

  // Add new state
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false)
  const [selectedCorrection, setSelectedCorrection] = useState<{
    payment: any
    truck: WorkDetail
    allocation: any
  } | null>(null)
  const [correctionAmount, setCorrectionAmount] = useState("")
  const [correctionNote, setCorrectionNote] = useState("")

  interface PaymentFormData {
    amount: number
    note: string
    allocatedTrucks: { truckId: string; amount: number }[]
    useExistingBalance: boolean
    balanceToUse: number
  }

  const [paymentFormData, setPaymentFormData] = useState<PaymentFormData>({
    amount: 0,
    note: "",
    allocatedTrucks: [],
    useExistingBalance: false,
    balanceToUse: 0,
  })

  // Ensure isSaving state is present
  const [isSaving, setIsSaving] = useState(false)

  // Add new state for action confirmations
  const [actionConfirmation, setActionConfirmation] = useState<{
    type: "reverse" | "writeoff" | "correct"
    payment: any
    truck: WorkDetail
    allocation: any
  } | null>(null)

  // Add new state for truck payment tracking
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  const [truckFilter, setTruckFilter] = useState("")
  const [truckPaymentHistory, setTruckPaymentHistory] = useState<TruckPaymentHistory[]>([])

  // Add state for expanded rows
  const [expandedTrucks, setExpandedTrucks] = useState<Set<string>>(new Set())

  // Add new state for ordered payments
  const [paymentOrder, setPaymentOrder] = useState<{ [truckId: string]: number }>({})
  const [isDragging, setIsDragging] = useState(false)

  // Fetch data when component mounts
  useEffect(() => {
    const fetchOwnerData = async () => {
      try {
        // Fetch work details
        const workDetailsRef = ref(database, "work_details")
        onValue(workDetailsRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = Object.entries(snapshot.val())
              .map(([id, detail]: [string, any]) => ({ id, ...detail }))
              .filter((detail) => detail.owner === owner)
            setWorkDetails(data)
          }
        })

        // Fetch payments
        const paymentsRef = ref(database, `payments/${owner}`)
        onValue(paymentsRef, (snapshot) => {
          if (snapshot.exists()) {
            const payments = Object.entries(snapshot.val()).map(([id, data]: [string, any]) => ({ id, ...data }))
            setOwnerPayments(payments)
          }
        })

        // Fetch balance
        const balanceRef = ref(database, `owner_balances/${owner}`)
        onValue(balanceRef, (snapshot) => {
          if (snapshot.exists()) {
            setOwnerBalance(snapshot.val())
          }
        })

        // Fetch truck payments
        const truckPaymentsRef = ref(database, "truckPayments")
        onValue(truckPaymentsRef, (snapshot) => {
          if (snapshot.exists()) {
            setTruckPayments(snapshot.val())
          }
        })

        // Fetch balance usage history
        const historyRef = ref(database, `balance_usage/${owner}`)
        onValue(historyRef, (snapshot) => {
          if (snapshot.exists()) {
            setBalanceUsageHistory(Object.values(snapshot.val()))
          }
        })

        // Fetch payment order
        const orderRef = ref(database, `payment_order/${owner}`)
        onValue(orderRef, (snapshot) => {
          if (snapshot.exists()) {
            setPaymentOrder(snapshot.val())
          }
        })

        setIsLoading(false)
      } catch (error) {
        console.error("Error fetching data:", error)
        toast({
          title: "Error",
          description: "Failed to load owner data",
        })
      }
    }

    fetchOwnerData()
  }, [owner])

  // Update calculateTotals with proper typing
  const calculateTotals = (): OwnerTotals => {
    const loadedTrucks = workDetails.filter((truck) => truck.loaded)

    const totals = loadedTrucks.reduce(
      (sum, truck) => {
        const { totalDue, totalAllocated, pendingAmount } = getTruckAllocations(truck, truckPayments)
        return {
          totalDue: sum.totalDue + totalDue,
          totalPaid: sum.totalPaid + totalAllocated,
          pendingTotal: sum.pendingTotal + (pendingAmount || 0),
        }
      },
      { totalDue: 0, totalPaid: 0, pendingTotal: 0 },
    )

    return {
      ...totals,
      balance: totals.totalDue - totals.totalPaid,
      existingBalance: ownerBalance?.amount || 0,
    }
  }

  // Payment handling functions
  const handleAddPayment = () => {
    setPaymentFormData({
      amount: 0,
      note: "",
      allocatedTrucks: [],
      useExistingBalance: false,
      balanceToUse: 0,
    })
    setIsPaymentModalOpen(true)
  }

  // Add all the payment-related functions from the orders page
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!owner) return

    setIsSaving(true) // Start saving

    try {
      const paymentRef = push(ref(database, `payments/${owner}`))
      const paymentKey = paymentRef.key!
      const timestamp = new Date().toISOString()
      const updates: { [path: string]: any } = {}

      // Validate total allocation
      const totalAllocation = toFixed2(paymentFormData.allocatedTrucks.reduce((sum, t) => sum + t.amount, 0))

      // Handle balance usage
      let remainingAmount = paymentFormData.amount
      if (paymentFormData.useExistingBalance && ownerBalance) {
        const balanceToUse = Math.min(paymentFormData.balanceToUse, ownerBalance.amount, totalAllocation)

        if (balanceToUse > 0) {
          const balanceUsageRef = push(ref(database, `balance_usage/${owner}`))
          updates[`balance_usage/${owner}/${balanceUsageRef.key}`] = {
            amount: balanceToUse,
            timestamp,
            usedFor: paymentFormData.allocatedTrucks.map((t) => t.truckId),
            paymentId: paymentKey,
            type: "usage",
            note: `Used for payment ${paymentKey}`,
          }

          // Update owner balance
          const newBalance = toFixed2(ownerBalance.amount - balanceToUse)
          updates[`owner_balances/${owner}`] = {
            amount: newBalance,
            lastUpdated: timestamp,
          }

          remainingAmount = toFixed2(remainingAmount - balanceToUse)
        }
      }

      // Record the payment
      updates[`payments/${owner}/${paymentKey}`] = {
        amount: remainingAmount,
        timestamp,
        allocatedTrucks: paymentFormData.allocatedTrucks,
        note: paymentFormData.note,
        type: "cash_payment",
      }

      // Update truck payments
      for (const allocation of paymentFormData.allocatedTrucks) {
        const truckRef = push(ref(database, `truckPayments/${allocation.truckId}`))
        updates[`truckPayments/${allocation.truckId}/${truckRef.key}`] = {
          amount: allocation.amount,
          timestamp,
          paymentId: paymentKey,
          note: paymentFormData.note,
        }

        // Update truck status
        const truck = workDetails.find((t) => t.id === allocation.truckId)
        if (truck) {
          const { balance } = getTruckAllocations(truck, truckPayments)
          const newBalance = toFixed2(balance - allocation.amount)

          updates[`work_details/${allocation.truckId}/paymentStatus`] = newBalance <= 0 ? "paid" : "partial"
          updates[`work_details/${allocation.truckId}/paymentPending`] = newBalance > 0
          updates[`work_details/${allocation.truckId}/paid`] = newBalance <= 0
        }
      }

      // Apply all updates atomically
      await update(ref(database), updates)

      toast({
        title: "Payment Processed",
        description: `Successfully processed payment of $${formatNumber(totalAllocation)}`,
      })

      setIsPaymentModalOpen(false)
      await fetchOwnerBalances()
    } catch (error) {
      console.error("Payment error:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process payment",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Add helper method to handle truck selection
  const handleTruckSelection = (checked: boolean, truck: WorkDetail) => {
    if (checked) {
      setPaymentFormData((prev) => ({
        ...prev,
        allocatedTrucks: [...prev.allocatedTrucks, { truckId: truck.id, amount: 0 }],
      }))
    } else {
      setPaymentFormData((prev) => ({
        ...prev,
        allocatedTrucks: prev.allocatedTrucks.filter((t) => t.truckId !== truck.id),
      }))
    }
  }

  // Add a helper to handle allocation input changes
  const handleAllocationChange = (e: React.ChangeEvent<HTMLInputElement>, truckId: string) => {
    const newAmount = Number.parseFloat(e.target.value)
    if (isNaN(newAmount)) return

    const truck = workDetails.find((t) => t.id === truckId)
    if (!truck) return

    const { balance } = getTruckAllocations(truck, truckPayments)
    const totalAvailable = getTotalAvailable()

    // Calculate current total allocation excluding this truck
    const currentTotal = paymentFormData.allocatedTrucks
      .filter((t) => t.truckId !== truckId)
      .reduce((sum, t) => sum + t.amount, 0)

    // Calculate maximum allowed amount for this truck
    const maxAllowed = Math.min(
      balance, // Can't allocate more than truck's balance
      totalAvailable - currentTotal, // Can't exceed total available amount
      newAmount, // Can't exceed input amount
    )

    if (maxAllowed >= 0) {
      setPaymentFormData((prev) => ({
        ...prev,
        allocatedTrucks: prev.allocatedTrucks.map((t) =>
          t.truckId === truckId ? { ...t, amount: toFixed2(maxAllowed) } : t,
        ),
      }))
    }
  }

  // Add the missing calculateOptimalAllocation function
  function calculateOptimalAllocation(
    totalAmount: number,
    trucks: WorkDetail[],
    truckPayments: { [truckId: string]: TruckPayment[] },
    balanceAmount = 0,
  ): { truckId: string; amount: number }[] {
    const totalAvailable = toFixed2(totalAmount) // totalAmount already includes balance
    const allocations: { truckId: string; amount: number }[] = []

    // Sort trucks by creation date and balance
    const trucksWithBalances = trucks
      .filter((truck) => {
        const { balance } = getTruckAllocations(truck, truckPayments)
        return balance > 0
      })
      .sort((a, b) => {
        // Sort by creation date first
        const dateA = new Date(a.createdAt || "").getTime()
        const dateB = new Date(b.createdAt || "").getTime()
        return dateA - dateB // Oldest first
      })

    let remainingAmount = totalAvailable

    // Allocate to trucks
    for (const truck of trucksWithBalances) {
      if (remainingAmount <= 0) break

      const { balance } = getTruckAllocations(truck, truckPayments)
      const allocation = toFixed2(Math.min(balance, remainingAmount))

      if (allocation > 0) {
        allocations.push({
          truckId: truck.id,
          amount: allocation,
        })
        remainingAmount = toFixed2(remainingAmount - allocation)
      }
    }

    return allocations
  }

  // Add the missing calculateRemainingAmount function
  const calculateRemainingAmount = (totalAmount: number, allocations: { truckId: string; amount: number }[]) => {
    const totalAllocated = toFixed2(allocations.reduce((sum, allocation) => sum + allocation.amount, 0))
    return toFixed2(totalAmount - totalAllocated)
  }

  // Update handlePaymentInputChange to enforce 2 decimal places
  const handlePaymentInputChange = (e: React.ChangeEvent<HTMLInputElement>, truckId: string) => {
    const value = Number.parseFloat(e.target.value)
    if (isNaN(value)) return

    const newAmount = toFixed2(value)
    const truck = workDetails.find((t) => t.id === truckId)

    if (!truck) return

    const { balance } = getTruckAllocations(truck, truckPayments)
    const otherAllocations = paymentFormData.allocatedTrucks
      .filter((t) => t.truckId !== truckId)
      .reduce((sum, t) => sum + t.amount, 0)

    const remainingAmount = toFixed2(paymentFormData.amount - otherAllocations)
    const maxAllowed = toFixed2(Math.min(balance, remainingAmount))

    if (newAmount >= 0 && newAmount <= maxAllowed) {
      setPaymentFormData((prev) => ({
        ...prev,
        allocatedTrucks: prev.allocatedTrucks.map((t) => (t.truckId === truckId ? { ...t, amount: newAmount } : t)),
      }))
    }
  }

  // Update handleBalanceUseChange to handle amounts correctly
  const handleBalanceUseChange = (checked: boolean) => {
    const availableBalance = ownerBalance?.amount || 0

    setPaymentFormData((prev) => ({
      ...prev,
      useExistingBalance: checked,
      amount: checked ? availableBalance : 0, // Set amount to balance when checked
      balanceToUse: checked ? availableBalance : 0,
      allocatedTrucks: [], // Reset allocations when changing balance use
    }))
  }

  // Update the available amount calculation to include balance
  const getTotalAvailable = () => {
    return paymentFormData.useExistingBalance ? paymentFormData.amount : paymentFormData.amount
  }

  // Add sorting function
  const sortData = (data: any[], key: string) => {
    return [...data].sort((a, b) => {
      if (sortConfig.direction === "asc") {
        return a[key] > b[key] ? 1 : -1
      }
      return a[key] < b[key] ? 1 : -1
    })
  }

  // Add export functions
  const handleDownloadPDF = () => {
    const doc = new jsPDF("landscape")
    const totals = calculateTotals()

    // Add header
    doc.setFontSize(20)
    doc.text(`${owner} - Financial Summary`, 14, 15)

    // Add summary section
    autoTable(doc, {
      startY: 25,
      head: [["Total Due", "Total Paid", "Balance", "Available Balance"]],
      body: [
        [
          `$${formatNumber(totals.totalDue)}`,
          `$${formatNumber(totals.totalPaid)}`,
          `$${formatNumber(Math.abs(totals.balance))}`,
          `$${formatNumber(totals.existingBalance)}`,
        ],
      ],
    })

    // Add trucks table
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY + 10 || 45,
      head: [["Truck", "Product", "At20", "Price", "Total Due", "Paid", "Balance", "Status"]],
      body: workDetails
        .filter((truck) => truck.loaded)
        .map((truck) => {
          const { totalDue, totalAllocated, balance } = getTruckAllocations(truck, truckPayments)
          return [
            truck.truck_number,
            truck.product,
            truck.at20 || "-",
            `$${formatNumber(Number.parseFloat(truck.price))}`,
            `$${formatNumber(totalDue)}`,
            `$${formatNumber(totalAllocated)}`,
            `$${formatNumber(Math.abs(balance))}`,
            balance <= 0 ? "Paid" : truck.paymentPending ? "Pending" : "Due",
          ]
        }),
    })

    doc.save(`${owner}_summary_${new Date().toISOString().split("T")[0]}.pdf`)
  }

  // Add this new function after handleDownloadPDF
  const handleDownloadTruckPaymentsPDF = () => {
    // Create PDF in landscape orientation
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const filteredTrucks = workDetails
      .filter((truck) => truck.loaded && truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase()))
      .sort((a, b) => a.truck_number.localeCompare(b.truck_number))

    // Header
    doc.setFontSize(16)
    doc.text(`Truck Payment Tracker - ${owner}`, pageWidth / 2, 15, { align: "center" })

    let startY = 25

    filteredTrucks.forEach((truck) => {
      const payments = ownerPayments
        .flatMap((payment) =>
          payment.allocatedTrucks
            ?.filter((allocation: any) => allocation.truckId === truck.id)
            .map((allocation: any) => ({
              date: new Date(payment.timestamp),
              paymentId: payment.id,
              amount: allocation.amount,
              note: payment.note || "—",
              timestamp: payment.timestamp,
            })),
        )
        .filter(Boolean)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      const total = payments.reduce((sum, p) => sum + p.amount, 0)

      // Check if we need a new page
      if (startY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage()
        startY = 15
      }

      // Truck Number and Total Payments
      doc.setFontSize(12)
      doc.text(`${truck.truck_number} - Total Payments: $${formatNumber(total)}`, pageWidth / 2, startY, {
        align: "center",
      })
      startY += 8

      // Table Data
      const tableData = payments.map((payment) => [
        payment.date.toLocaleDateString(),
        payment.paymentId.slice(-6),
        `$${formatNumber(payment.amount)}`,
        payment.note,
      ])

      if (tableData.length > 0) {
        ;(doc as any).autoTable({
          head: [["Date", "Payment ID", "Amount", "Note"]],
          body: tableData,
          startY: startY,
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 30 },
            2: { cellWidth: 30 },
            3: { cellWidth: "auto" },
          },
          headStyles: { fillColor: [41, 128, 185] }, // Add some style to the header
          alternateRowStyles: { fillColor: [245, 245, 245] }, // Zebra striping
        })

        startY = (doc as any).lastAutoTable.finalY + 15
      } else {
        doc.setFontSize(10)
        doc.text("No payments recorded", pageWidth / 2, startY, { align: "center" })
        startY += 15
      }
    })

    doc.save(`TruckPayments_${owner}_${new Date().toISOString().split("T")[0]}.pdf`)
  }

  // Add this new function after handleDownloadPDF
  const handleDownloadExcel = () => {
    // Create workbook
    const wb = XLSX.utils.book_new()
    const totals = calculateTotals()

    // Summary worksheet
    const summaryData = [
      ["Financial Summary"],
      ["Total Due", `$${formatNumber(totals.totalDue)}`],
      ["Total Paid", `$${formatNumber(totals.totalPaid)}`],
      ["Balance", `$${formatNumber(Math.abs(totals.balance))}`],
      ["Available Balance", `$${formatNumber(totals.existingBalance)}`],
      [],
    ]
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")

    // Trucks worksheet
    const trucksData = [["Truck", "Product", "At20", "Price", "Total Due", "Paid", "Balance", "Status", "Date Loaded"]]
    workDetails
      .filter((truck) => truck.loaded)
      .forEach((truck) => {
        const { totalDue, totalAllocated, balance } = getTruckAllocations(truck, truckPayments)
        trucksData.push([
          truck.truck_number,
          truck.product,
          truck.at20 || "-",
          `$${formatNumber(Number.parseFloat(truck.price))}`,
          `$${formatNumber(totalDue)}`,
          `$${formatNumber(totalAllocated)}`,
          `$${formatNumber(Math.abs(balance))}`,
          balance <= 0 ? "Paid" : truck.paymentPending ? "Pending" : "Due",
          new Date(truck.createdAt || Date.now()).toLocaleDateString(),
        ])
      })
    const trucksWs = XLSX.utils.aoa_to_sheet(trucksData)
    XLSX.utils.book_append_sheet(wb, trucksWs, "Trucks")

    // Payments worksheet
    const paymentsData = [["Date", "Amount", "Type", "Note", "Allocated Trucks"]]
    ownerPayments.forEach((payment) => {
      paymentsData.push([
        new Date(payment.timestamp).toLocaleString(),
        `$${formatNumber(payment.amount)}`,
        payment.type || "Payment",
        payment.note || "-",
        payment.allocatedTrucks
          ?.map((allocation: any) => {
            const truck = workDetails.find((t) => t.id === allocation.truckId)
            return truck ? `${truck.truck_number} ($${formatNumber(allocation.amount)})` : ""
          })
          .join(", ") || "-",
      ])
    })
    const paymentsWs = XLSX.utils.aoa_to_sheet(paymentsData)
    XLSX.utils.book_append_sheet(wb, paymentsWs, "Payments")

    // Balance History worksheet
    const balanceData = [["Date", "Amount", "Type", "Note"]]
    balanceUsageHistory.forEach((entry) => {
      balanceData.push([
        new Date(entry.timestamp).toLocaleDateString(),
        `${entry.type === "deposit" ? "+" : "-"}$${formatNumber(entry.amount)}`,
        entry.type,
        entry.note || "-",
      ])
    })
    const balanceWs = XLSX.utils.aoa_to_sheet(balanceData)
    XLSX.utils.book_append_sheet(wb, balanceWs, "Balance History")

    // Save the file
    XLSX.writeFile(wb, `${owner}_transactions_${new Date().toISOString().split("T")[0]}.xlsx`)
  }

  // Add loading skeletons component
  const LoadingSkeleton = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-4 rounded-lg border">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[300px] w-full" />
    </div>
  )

  // Add function to fetch owner balances
  const fetchOwnerBalances = async () => {
    try {
      const balanceRef = ref(database, `owner_balances/${owner}`)
      const snapshot = await get(balanceRef)
      if (snapshot.exists()) {
        setOwnerBalance(snapshot.val())
      }
    } catch (error) {
      console.error("Error fetching balance:", error)
    }
  }

  // Add this useEffect to fetch balances when the component mounts
  useEffect(() => {
    fetchOwnerBalances()
  }, [owner, workDetails, truckPayments]) // Added dependencies

  // Add new handler function after existing state declarations
  const handleOwnerNameClick = () => {
    const newCount = ownerNameClickCount + 1
    if (newCount === 3) {
      setOwnerNameClickCount(0)
      setIsBalanceEditMode(true)
      setManualBalance((ownerBalance?.amount || 0).toString())
      toast({
        title: "Developer Mode",
        description: "Balance edit mode enabled",
        variant: "default",
      })
    } else {
      setOwnerNameClickCount(newCount)
      // Reset count after 1 second if not clicked three times
      setTimeout(() => setOwnerNameClickCount(0), 1000)
    }
  }

  // Add new handler for balance update
  const handleManualBalanceUpdate = async () => {
    try {
      const newBalance = Number.parseFloat(manualBalance)
      if (isNaN(newBalance)) {
        throw new Error("Invalid balance amount")
      }

      const timestamp = new Date().toISOString()
      const updates: { [key: string]: any } = {
        [`owner_balances/${owner}`]: {
          amount: newBalance,
          lastUpdated: timestamp,
        },
      }

      // Add a record in balance_usage for audit
      const balanceUsageRef = push(ref(database, `balance_usage/${owner}`))
      updates[`balance_usage/${owner}/${balanceUsageRef.key}`] = {
        amount: newBalance,
        timestamp,
        type: "manual_adjustment",
        note: "Manual balance adjustment by admin",
      }

      await update(ref(database), updates)

      toast({
        title: "Success",
        description: "Balance manually updated",
      })

      setIsBalanceEditMode(false)
      await fetchOwnerBalances()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update balance",
        variant: "destructive",
      })
    }
  }

  // Add new handler function
  const handleOrderStatsClick = () => {
    const newCount = orderStatsClickCount + 1
    if (newCount === 2) {
      // Double click
      setOrderStatsClickCount(0)
      setShowPendingOrders(true)
      toast({
        title: "Admin Mode",
        description: "Pending orders view enabled",
        variant: "default",
      })
    } else {
      setOrderStatsClickCount(newCount)
      // Reset count after 500ms if not double clicked
      setTimeout(() => setOrderStatsClickCount(0), 500)
    }
  }

  // Update the handleFixTruckStatus function
  const handleFixTruckStatus = async (truckId: string) => {
    try {
      const truck = workDetails.find((t) => t.id === truckId)
      if (!truck) return

      const updates = await syncTruckPaymentStatus(database, truck, truckPayments)
      await update(ref(database), updates)

      toast({
        title: "Status Updated",
        description: `Payment status synchronized for truck ${truck.truck_number}`,
      })
    } catch (error) {
      console.error("Fix error:", error)
      toast({
        title: "Error",
        description: "Failed to sync payment status",
        variant: "destructive",
      })
    }
  }

  // Update handleFixAllStatuses to use syncTruckPaymentStatus
  const handleFixAllStatuses = async () => {
    try {
      const allUpdates: { [path: string]: any } = {}

      for (const truck of workDetails.filter((t) => t.loaded)) {
        const updates = await syncTruckPaymentStatus(database, truck, truckPayments)
        Object.assign(allUpdates, updates)
      }

      await update(ref(database), allUpdates)

      toast({
        title: "Status Updated",
        description: "All payment statuses synchronized",
      })
    } catch (error) {
      console.error("Fix error:", error)
      toast({
        title: "Error",
        description: "Failed to sync payment statuses",
        variant: "destructive",
      })
    }
  }

  // Add new handler
  const handleCorrectionSubmit = async () => {
    if (!selectedCorrection || !correctionAmount || !correctionNote) return

    try {
      const correction: PaymentCorrection = {
        paymentId: selectedCorrection.payment.id,
        truckId: selectedCorrection.truck.id,
        oldAmount: selectedCorrection.allocation.amount,
        newAmount: Number.parseFloat(correctionAmount),
        timestamp: selectedCorrection.payment.timestamp,
        note: correctionNote,
      }

      await correctPaymentAllocation(database, owner, correction)

      toast({
        title: "Correction Applied",
        description: "Payment allocation has been corrected",
      })

      setShowCorrectionDialog(false)
      setSelectedCorrection(null)
      setCorrectionAmount("")
      setCorrectionNote("")
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply correction",
        variant: "destructive",
      })
    }
  }

  // Add new handlers
  const handleReverseTruckPayment = async (payment: any, truck: WorkDetail, allocation: any) => {
    try {
      const correction: PaymentCorrection = {
        paymentId: payment.id,
        truckId: truck.id,
        oldAmount: allocation.amount,
        newAmount: 0, // Reverse by setting to 0
        timestamp: payment.timestamp,
        note: `Payment reversed - Original amount: $${formatNumber(allocation.amount)}`,
      }

      await correctPaymentAllocation(database, owner, correction)
      toast({ title: "Payment Reversed", description: "Payment allocation has been reversed" })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reverse payment",
        variant: "destructive",
      })
    }
  }

  const handleWriteOff = async (payment: any, truck: WorkDetail, allocation: any) => {
    try {
      const correction: PaymentCorrection = {
        paymentId: payment.id,
        truckId: truck.id,
        oldAmount: allocation.amount,
        newAmount: getTruckAllocations(truck, truckPayments).balance, // Set to full balance
        timestamp: payment.timestamp,
        note: `Payment written off - Original amount: $${formatNumber(allocation.amount)}`,
      }

      await correctPaymentAllocation(database, owner, correction)
      toast({ title: "Payment Written Off", description: "Payment has been written off" })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to write off payment",
        variant: "destructive",
      })
    }
  }

  // Add new context menu for payments table
  const PaymentActions = ({ payment, truck, allocation }: { payment: any; truck: WorkDetail; allocation: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={() => {
            setSelectedCorrection({ payment, truck, allocation })
            setCorrectionAmount(allocation.amount.toString())
            setShowCorrectionDialog(true)
          }}
        >
          <Receipt className="mr-2 h-4 w-4" />
          Correct Amount
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (
              confirm(
                `Are you sure you want to reverse the payment of $${formatNumber(allocation.amount)} for truck ${truck.truck_number}?`,
              )
            ) {
              handleReverseTruckPayment(payment, truck, allocation)
            }
          }}
          className="text-red-600"
        >
          <AlertCircle className="mr-2 h-4 w-4" />
          Reverse Payment
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (confirm(`Are you sure you want to write off the remaining balance for truck ${truck.truck_number}?`)) {
              handleWriteOff(payment, truck, allocation)
            }
          }}
          className="text-amber-600"
        >
          <Shield className="mr-2 h-4 w-4" />
          Write Off Balance
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // Add new function to get truck payment history
  const getTruckPaymentHistory = (truckId: string) => {
    const history: TruckPaymentHistory[] = []

    ownerPayments.forEach((payment) => {
      payment.allocatedTrucks?.forEach((allocation: any) => {
        if (allocation.truckId === truckId) {
          const truck = workDetails.find((t) => t.id === truckId)
          history.push({
            paymentId: payment.id,
            timestamp: payment.timestamp,
            amount: allocation.amount,
            note: payment.note || "",
            truckNumber: truck?.truck_number || "",
          })
        }
      })
    })

    // Sort by date (oldest first)
    return history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }

  // Add new function to filter trucks
  const getFilteredTrucks = () => {
    return workDetails
      .filter((truck) => truck.loaded && truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase()))
      .sort((a, b) => a.truck_number.localeCompare(b.truck_number))
  }

  // Add function to group payments by truck
  const groupPaymentsByTruck = () => {
    const grouped: { [key: string]: GroupedTruckPayment } = {}

    ownerPayments
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach((payment) => {
        payment.allocatedTrucks?.forEach((allocation: any) => {
          const truck = workDetails.find((t) => t.id === allocation.truckId)
          if (!truck || !truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase())) return

          if (!grouped[truck.truck_number]) {
            grouped[truck.truck_number] = {
              truckNumber: truck.truck_number,
              total: 0,
              payments: [],
            }
          }

          grouped[truck.truck_number].total += allocation.amount
          grouped[truck.truck_number].payments.push({
            date: new Date(payment.timestamp),
            paymentId: payment.id,
            amount: allocation.amount,
            note: payment.note || "—",
          })
        })
      })

    return Object.values(grouped)
  }

  // Add toggle function for rows
  const toggleTruckExpand = (truckNumber: string) => {
    const newExpanded = new Set(expandedTrucks)
    if (newExpanded.has(truckNumber)) {
      newExpanded.delete(truckNumber)
    } else {
      newExpanded.add(truckNumber)
    }
    setExpandedTrucks(newExpanded)
  }

  // Add new function to handle order changes
  const initializeOrder = (trucks: WorkDetail[]) => {
    const order: { [key: string]: number } = {}
    trucks.forEach((truck, index) => {
      if (!paymentOrder[truck.id]) {
        order[truck.id] = index
      }
    })
    return { ...paymentOrder, ...order }
  }

  const handleMoveRow = async (truckId: string, direction: "up" | "down") => {
    const sortedTrucks = workDetails
      .filter((t) => t.loaded && t.truck_number.toLowerCase().includes(truckFilter.toLowerCase()))
      .sort((a, b) => (paymentOrder[a.id] || 0) - (paymentOrder[b.id] || 0))

    const currentIndex = sortedTrucks.findIndex((t) => t.id === truckId)
    if (currentIndex === -1) return

    let newOrder = { ...paymentOrder }

    if (direction === "up" && currentIndex > 0) {
      // Swap with previous truck
      const prevTruck = sortedTrucks[currentIndex - 1]
      const currentOrder = paymentOrder[truckId] || currentIndex
      const prevOrder = paymentOrder[prevTruck.id] || (currentIndex - 1)

      newOrder[truckId] = prevOrder
      newOrder[prevTruck.id] = currentOrder
    } else if (direction === "down" && currentIndex < sortedTrucks.length - 1) {
      // Swap with next truck
      const nextTruck = sortedTrucks[currentIndex + 1]
      const currentOrder = paymentOrder[truckId] || currentIndex
      const nextOrder = paymentOrder[nextTruck.id] || (currentIndex + 1)

      newOrder[truckId] = nextOrder
      newOrder[nextTruck.id] = currentOrder
    }

    try {
      await update(ref(database, `payment_order/${owner}`), newOrder)
      setPaymentOrder(newOrder)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update order",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    if (workDetails.length > 0) {
      const initialOrder = initializeOrder(workDetails)
      setPaymentOrder(initialOrder)
    }
  }, [workDetails])

  const profilePicUrl = useProfileImage()

  return (
    <div className="min-h-screen">
      {/* Animate header */}
      <motion.header
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl"
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            {/* Left side */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <h1 
                  className="text-base sm:text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate cursor-pointer"
                  onClick={handleOwnerNameClick}
                >
                  {owner}
                </h1>
              </div>
            </div>

            {/* Right side - Action buttons with tooltips */}
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="hidden sm:flex items-center gap-2 mr-2">
                <span className="text-sm text-muted-foreground">
                  Balance: ${formatNumber(ownerBalance?.amount || 0)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsBalanceDialogOpen(true)}
                className="relative hover:bg-emerald-100"
                title="Add Prepayment"
              >
                <Wallet2 className="h-4 w-4 sm:h-5 w-5 text-emerald-600" />
                <span className="sr-only">Add Prepayment</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleAddPayment}
                className="relative hover:bg-emerald-100"
                title="Add Payment"
              >
                <PlusCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                <span className="sr-only">Add Payment</span>
              </Button>
              <ThemeToggle />
              <Avatar 
                className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-pink-500/50"
              >
                <AvatarImage 
                  src={profilePicUrl || ''} 
                  alt="Profile"
                />
                <AvatarFallback className="bg-pink-100 text-pink-700">
                  {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Update main content container to account for fixed header */}
      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-16 sm:pt-24 pb-6 sm:pb-8">
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggeredList}
            className="space-y-4 sm:space-y-6"
          >
            {/* Export button */}
            <motion.div variants={fadeIn} className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleDownloadExcel} className="text-xs sm:text-sm">
                <FileSpreadsheet className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Export Excel
              </Button>
              <Button variant="outline" onClick={handleDownloadPDF} className="text-xs sm:text-sm">
                <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Export PDF
              </Button>
              <Button variant="outline" onClick={handleDownloadTruckPaymentsPDF} className="text-xs sm:text-sm">
                <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Export Truck Payments PDF
              </Button>
            </motion.div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
              {/* Wrap each card in motion.div */}
              <motion.div variants={slideUp}>
                <Card 
                  className="p-2 sm:p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={handleOrderStatsClick}
                >
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">
                    Total Orders
                    {showPendingOrders && (
                      <span className="ml-2 text-xs text-emerald-500">●</span>
                    )}
                  </div>
                  <div className="text-lg sm:text-2xl font-bold">
                    {workDetails.length}
                  </div>
                </Card>
              </motion.div>
              <motion.div variants={slideUp}>
                <Card className="p-2 sm:p-4">
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">Loaded Trucks</div>
                  <div className="text-lg sm:text-2xl font-bold">
                    {workDetails.filter(t => t.loaded).length}
                  </div>
                </Card>
              </motion.div>
              <motion.div variants={slideUp}>
                <Card className="p-2 sm:p-4">
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">AGO Orders</div>
                  <div className="text-lg sm:text-2xl font-bold">
                    {workDetails.filter(t => t.product === 'AGO').length}
                  </div>
                </Card>
              </motion.div>
              <motion.div variants={slideUp}>
                <Card className="p-2 sm:p-4">
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">PMS Orders</div>
                  <div className="text-lg sm:text-2xl font-bold">
                    {workDetails.filter(t => t.product === 'PMS').length}
                  </div>
                </Card>
              </motion.div>
            </div>

            {/* Animate pending orders section */}
            <AnimatePresence>
              {showPendingOrders && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="p-3 sm:p-6 mt-4 border-dashed border-2">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg sm:text-xl font-semibold text-orange-500">
                        Pending Orders (Admin View)
                      </h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPendingOrders(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="text-left p-2">Date</th>
                            <th className="text-left p-2">Truck</th>
                            <th className="text-left p-2">Product</th>
                            <th className="text-left p-2">Quantity</th>
                            <th className="text-left p-2">Destination</th>
                            <th className="text-left p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workDetails
                            .filter(detail => !detail.loaded && detail.status === "queued")
                            .sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime())
                            .map(detail => (
                              <tr key={detail.id} className="border-t">
                                <td className="p-2">
                                  {new Date(detail.createdAt || '').toLocaleDateString()}
                                </td>
                                <td className="p-2">{detail.truck_number}</td>
                                <td className="p-2">{detail.product}</td>
                                <td className="p-2">{detail.quantity}</td>
                                <td className="p-2">{detail.destination}</td>
                                <td className="p-2">
                                  <span className="text-orange-500 text-sm">
                                    ⏳ Pending Loading
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {workDetails.filter(detail => !detail.loaded && detail.status === "queued").length === 0 && (
                        <p className="text-center text-muted-foreground py-4">
                          No pending orders
                        </p>
                      )}
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Animate financial summary section */}
            <motion.div variants={slideUp}>
              <Card className="p-3 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Financial Summary</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  {(() => {
                    const totals = calculateTotals();
                    return (
                      <>
                        <div className="p-2 sm:p-4 rounded-lg border">
                          <div className="text-xs sm:text-sm font-medium text-muted-foreground">Total Due</div>
                          <div className="text-lg sm:text-2xl font-bold">${formatNumber(totals.totalDue)}</div>
                        </div>
                        <div className="p-2 sm:p-4 rounded-lg border">
                          <div className="text-xs sm:text-sm font-medium text-muted-foreground">Total Paid</div>
                          <div className="text-lg sm:text-2xl font-bold">${formatNumber(totals.totalPaid)}</div>
                        </div>
                        <div className="p-2 sm:p-4 rounded-lg border">
                          <div className="text-xs sm:text-sm font-medium text-muted-foreground">Balance</div>
                          <div className={`text-lg sm:text-2xl font-bold ${totals.balance < 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${formatNumber(Math.abs(totals.balance))}
                            {totals.pendingTotal > 0 && (
                              <div className="text-xs sm:text-sm text-orange-500">
                                Includes ${formatNumber(totals.pendingTotal)} pending
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="p-2 sm:p-4 rounded-lg border">
                          <div className="text-xs sm:text-sm font-medium text-muted-foreground">Available Balance</div>
                          <div className="text-lg sm:text-2xl font-bold text-green-600">
                            ${formatNumber(totals.existingBalance)}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </Card>
            </motion.div>

            {/* Loaded Trucks Table */}
            <motion.div variants={slideUp}>
              <Card className="p-3 sm:p-6">
                <div className="flex justify-between items-center mb-3 sm:mb-4">
                  <h2 className="text-lg sm:text-xl font-semibold">Loaded Trucks</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFixAllStatuses}
                    className="text-xs"
                  >
                    Fix All Statuses
                  </Button>
                </div>
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <div className="min-w-[800px] sm:min-w-0"> {/* Force minimum width on mobile */}
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-left p-2">Truck</th>
                          <th className="text-left p-2">Product</th>
                          <th className="text-left p-2">At20</th>
                          <th className="text-left p-2">Price</th>
                          <th className="text-left p-2">Total Due</th>
                          <th className="text-left p-2">Paid</th>
                          <th className="text-left p-2">Balance</th>
                          <th className="text-left p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workDetails.filter(truck => truck.loaded).map(truck => {
                                                  const { totalDue, totalAllocated, balance, pendingAmount } = getTruckAllocations(truck, truckPayments);
                          return (
                            <tr key={truck.id} className="border-t">
                              <td className="p-2">{truck.truck_number}</td>
                              <td className="p-2">{truck.product}</td>
                              <td className="p-2">{truck.at20 || '-'}</td>
                              <td className="p-2">${formatNumber(Number.parseFloat(truck.price))}</td>
                              <td className="p-2">${formatNumber(totalDue)}</td>
                              <td className="p-2">${formatNumber(totalAllocated)}</td>
                              <td className="p-2">${formatNumber(Math.abs(balance))}</td>
                              <td className="p-2">
                                <div className="flex items-center gap-2">
                                  <span className={
                                    balance <= 0 ? "text-green-600" : 
                                    truck.paymentPending ? "text-orange-500" : 
                                    "text-red-600"
                                  }>
                                    {balance <= 0 ? "Paid" : truck.paymentPending ? "Pending" : "Due"}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleFixTruckStatus(truck.id)}
                                    className="h-6 w-6 p-0"
                                    title="Fix payment status"
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Payment History */}
            <motion.div variants={slideUp}>
              <Card className="p-3 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Payment History</h2>
                <div className="space-y-2 sm:space-y-0">
                  {ownerPayments.map((payment) => (
                    <div key={payment.id} className="block sm:hidden border-b pb-2">
                      <div className="flex justify-between">
                        <div className="font-medium">${formatNumber(payment.amount)}</div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(payment.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                      {payment.allocatedTrucks?.map((allocation: any) => {
                        const truck = workDetails.find(t => t.id === allocation.truckId);
                        return truck ? (
                          <div key={allocation.truckId} className="text-xs text-muted-foreground">
                            {truck.truck_number} (${formatNumber(allocation.amount)})
                          </div>
                        ) : null;
                      })}
                      {payment.note && (
                        <div className="text-xs italic mt-1">{payment.note}</div>
                      )}
                    </div>
                  ))}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th className="p-2 text-left">ID</th>
                          <th className="p-2 text-left">Actions</th>
                          <th className="p-2 text-left">Amount</th>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Allocated Trucks</th>
                          <th className="p-2 text-left">Note</th></tr></thead>
                      <tbody>
                        {ownerPayments
                          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) // Sort oldest first
                          .map((payment) => (
                          <tr key={payment.id} className={cn("border-t",payment.corrected && "bg-muted/50")}>
                            <td className="p-2">{payment.id}</td>
                            <td className="p-2">{payment.allocatedTrucks?.map((allocation: any) => {
                              const truck = workDetails.find(t => t.id === allocation.truckId);
                              return truck ? (
                                <div key={allocation.truckId}>
                                  <PaymentActions 
                                    payment={payment}
                                    truck={truck}
                                    allocation={allocation}/>
                                </div>
                              ) : null;
                            })}</td>
                            <td className="p-2">${formatNumber(payment.amount)}</td>
                            <td className="p-2">{new Date(payment.timestamp).toLocaleString()}</td>
                            <td className="p-2">{payment.allocatedTrucks?.map((allocation: any) => {
                              const truck = workDetails.find(t => t.id === allocation.truckId);
                              return truck ? (
                                <div key={allocation.truckId} className="flex items-center">
                                  <span className="text-xs">
                                    {truck.truck_number} (${formatNumber(allocation.amount)})
                                    {payment.corrected && (
                                      <span className="ml-1 text-muted-foreground">(Corrected)</span>
                                    )}
                                  </span>
                                </div>
                              ) : null;
                            })}</td>
                            <td className="p-2 whitespace-nowrap">{payment.note || '—'}</td></tr>
                      ))}</tbody></table>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Balance History */}
            <motion.div variants={slideUp}>
              <Card className="p-6 mt-4">
                <h2 className="text-xl font-semibold mb-4">Balance History</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Amount</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balanceUsageHistory.map((entry) => (
                        <tr key={entry.timestamp} className="border-t">
                          <td className="p-2">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </td>
                          <td className="p-2">
                            <span className={entry.type === 'deposit' ? 'text-green-600' : 'text-red-600'}>
                              {entry.type === 'deposit' ? '+' : '-'}${formatNumber(entry.amount)}
                            </span>
                          </td>
                          <td className="p-2">{entry.type}</td>
                          <td className="p-2">{entry.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>

            {/* Add this new section before the closing main tag */}
            <motion.div variants={slideUp}>
              <Card className="p-3 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg sm:text-xl font-semibold">Truck Payment Tracker</h2>
                  <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search truck number..."
                      value={truckFilter}
                      onChange={(e) => setTruckFilter(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border p-2 text-left font-medium">Truck Number</th>
                        <th className="border p-2 text-left font-medium">Date</th>
                        <th className="border p-2 text-left font-medium">Payment ID</th>
                        <th className="border p-2 text-right font-medium">Amount</th>
                        <th className="border p-2 text-left font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workDetails
                        .filter(truck => truck.loaded && truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase()))
                        .sort((a, b) => {
                          const orderA = paymentOrder[a.id] || 0
                          const orderB = paymentOrder[b.id] || 0
                          return orderA - orderB
                        })
                        .map(truck => {
                          const payments = ownerPayments
                            .flatMap(payment => 
                              payment.allocatedTrucks
                                ?.filter((allocation: any) => allocation.truckId === truck.id)
                                .map((allocation: any) => ({
                                  date: new Date(payment.timestamp),
                                  paymentId: payment.id,
                                  amount: allocation.amount,
                                  note: payment.note || '—',
                                  timestamp: payment.timestamp, // Include timestamp for sorting
                                  paymentTimestamp: payment.timestamp // Keep original payment timestamp
                                }))
                            )
                            .filter(Boolean)
                            .sort((a, b) => new Date(a.paymentTimestamp).getTime() - new Date(b.paymentTimestamp).getTime()); // Sort by original payment timestamp

                          console.log("Payments for truck", truck.truck_number, payments.map(p => p.date.toLocaleDateString()));

                          const total = payments.reduce((sum, p) => sum + p.amount, 0);

                          return (
                            <React.Fragment key={truck.id}>
                              <tr className="bg-muted/10 font-medium">
                                <td className="border p-2" rowSpan={payments.length + 1}>
                                  <div className="flex items-center gap-2 group">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleMoveRow(truck.id, 'up')}
                                        className="h-6 w-6 p-0 hover:bg-muted"
                                        disabled={paymentOrder[truck.id] === 0}
                                      >
                                        <ChevronUp className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleMoveRow(truck.id, 'down')}
                                        className="h-6 w-6 p-0 hover:bg-muted"
                                        disabled={paymentOrder[truck.id] === workDetails.filter(t => t.loaded).length - 1}
                                      >
                                        <ChevronDown className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                                      </Button>
                                    </div>
                                    <span>{truck.truck_number}</span>
                                  </div>
                                </td>
                                <td className="border p-2" colSpan={2}>
                                  Total Payments
                                </td>
                                <td className="border p-2 text-right text-green-600">
                                  ${formatNumber(total)}
                                </td>
                                <td className="border p-2"></td>
                              </tr>
                              {payments.map((payment, idx) => (
                                <tr 
                                  key={`${payment.paymentId}-${idx}`}
                                  className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/5'}
                                >
                                  <td className="border p-2 text-sm">
                                    {payment.date.toLocaleDateString()}
                                  </td>
                                  <td className="border p-2 text-sm text-muted-foreground">
                                    {payment.paymentId.slice(-6)}
                                  </td>
                                  <td className="border p-2 text-right text-sm">
                                    ${formatNumber(payment.amount)}
                                  </td>
                                  <td className="border p-2 text-sm text-muted-foreground">
                                    {payment.note}
                                  </td>
                                </tr>
                              ))}
                              {payments.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="border p-2 text-center text-muted-foreground">
                                    No payments recorded
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                  {workDetails.filter(t => 
                    t.loaded && t.truck_number.toLowerCase().includes(truckFilter.toLowerCase())
                  ).length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      No trucks found matching the search criteria
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* Animate dialogs */}
        <AnimatePresence>
          {isPaymentModalOpen && (
            <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
                
              >
                <DialogContent className="w-[95vw] sm:max-w-[900px] h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-semibold">
                      Add Payment for {owner}
                    </DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handlePaymentSubmit} className="space-y-4">
                    {/* Main content grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                      {/* Left column - Payment Details */}
                      <div className="space-y-4">
                        <div className="rounded-lg border p-4">
                          <h3 className="text-sm font-medium mb-3">Payment Details</h3>
                          
                          {/* Balance Section */}
                          {ownerBalance && ownerBalance.amount > 0 && (
                            <Card className="p-4 bg-muted/50 mb-4">
                              <div className="flex items-center gap-4">
                                <Checkbox
                                  id="useBalance"
                                  checked={paymentFormData.useExistingBalance}
                                  onCheckedChange={handleBalanceUseChange}
                                />
                                <div className="flex-1">
                                  <Label htmlFor="useBalance" className="font-medium">
                                    Use available balance
                                  </Label>
                                  <p className="text-sm text-emerald-600">
                                    ${formatNumber(ownerBalance.amount)} available
                                  </p>
                                </div>
                              </div>
                            </Card>
                          )}

                          {/* Amount Input */}
                          <div className="space-y-2">
                            <Label htmlFor="paymentAmount" className="text-sm font-medium">
                              Payment Amount {paymentFormData.useExistingBalance && '(Including Balance)'}
                            </Label>
                            <div className="flex gap-4 items-center">
                              <div className="flex-1">
                                <Input
                                  id="paymentAmount"
                                  type="number"
                                  step="0.01"
                                  value={paymentFormData.amount}
                                  onChange={(e) => setPaymentFormData(prev => ({
                                    ...prev,
                                    amount: Number.parseFloat(e.target.value) || 0,
                                    allocatedTrucks: []
                                  }))}
                                  className="text-lg"
                                  placeholder="Enter amount"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Payment Summary */}
                          <div className="mt-4 p-3 bg-muted rounded-lg">
                            <div className="text-sm space-y-1">
                              <div className="flex justify-between">
                                <span>Available:</span>
                                <span>${formatNumber(getTotalAvailable())}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Allocated:</span>
                                <span>${formatNumber(
                                  paymentFormData.allocatedTrucks.reduce((sum, t) => sum + t.amount, 0)
                                )}</span>
                              </div>
                              <div className="flex justify-between font-medium">
                                <span>Remaining:</span>
                                <span className={cn(
                                  calculateRemainingAmount(getTotalAvailable(), paymentFormData.allocatedTrucks) > 0 
                                    ? "text-orange-500" 
                                    : "text-emerald-600"
                                )}>
                                  ${formatNumber(calculateRemainingAmount(
                                    getTotalAvailable(),
                                    paymentFormData.allocatedTrucks
                                  ))}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Note Input */}
                          <div className="mt-4 space-y-2">
                            <Label htmlFor="note" className="text-sm font-medium">Note</Label>
                            <Input
                              id="note"
                              value={paymentFormData.note}
                              onChange={(e) => setPaymentFormData(prev => ({ ...prev, note: e.target.value }))}
                              placeholder="Add a note for this payment"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right column - Truck Allocations */}
                      <div className="space-y-4">
                        <div className="rounded-lg border p-4">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-medium">Allocate to Trucks</h3>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const totalAvailable = getTotalAvailable();
                                const allocations = calculateOptimalAllocation(
                                  totalAvailable,
                                  workDetails.filter(t => t.loaded),
                                  truckPayments
                                );
                                setPaymentFormData(prev => ({ ...prev, allocatedTrucks: allocations }));
                              }}
                            >
                              Auto Allocate
                            </Button>
                          </div>

                          <div className="space-y-2 max-h-[400px] overflow-y-auto rounded-lg border bg-card p-4">
                            {workDetails
                              .filter((t) => t.loaded && getTruckAllocations(t, truckPayments).balance > 0)
                              .map((truck) => {
                                const truckAllocation = getTruckAllocations(truck, truckPayments);
                                return (
                                  <div key={truck.id} 
                                    className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                                  >
                                    <Checkbox
                                      checked={!!paymentFormData.allocatedTrucks.find(
                                        (a) => a.truckId === truck.id
                                      )}
                                      onCheckedChange={(checked) => handleTruckSelection(!!checked, truck)}
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium">{truck.truck_number}</div>
                                      <div className="text-sm text-muted-foreground">
                                        Balance: ${formatNumber(truckAllocation.balance)}
                                      </div>
                                    </div>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={paymentFormData.allocatedTrucks.find(
                                        (a) => a.truckId === truck.id
                                      )?.amount || ''}
                                      onChange={(e) => handleAllocationChange(e, truck.id)}
                                      className="w-28"
                                    />
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        type="submit"
                        disabled={
                          isSaving ||
                          paymentFormData.amount <= 0 || 
                          calculateRemainingAmount(paymentFormData.amount, paymentFormData.allocatedTrucks) === paymentFormData.amount ||
                          paymentFormData.allocatedTrucks.length === 0
                        }
                        className="w-full md:w-auto"
                      >
                        {isSaving ? "Saving..." : "Save Payment"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </motion.div>
            </Dialog>
          )}
        </AnimatePresence>
        <OwnerBalanceDialog 
          owner={owner}
          open={isBalanceDialogOpen}
          onOpenChange={setIsBalanceDialogOpen}
          currentBalance={ownerBalance?.amount || 0}
          onBalanceUpdate={fetchOwnerBalances}
        />
        {/* Add the balance edit dialog */}
        <AnimatePresence>
          {isBalanceEditMode && (
            <Dialog open={isBalanceEditMode} onOpenChange={setIsBalanceEditMode}>
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-semibold text-red-500">
                      ⚠️ Manual Balance Adjustment
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Current Balance</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={manualBalance}
                        onChange={(e) => setManualBalance(e.target.value)}
                        placeholder="Enter new balance amount"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Warning: This is a manual override. Use only when necessary.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsBalanceEditMode(false)}>
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={handleManualBalanceUpdate}
                    >
                      Update Balance
                    </Button>
                  </div>
                </DialogContent>
              </motion.div>
            </Dialog>
          )}
        </AnimatePresence>
        {/* Add correction dialog before closing main div */}
        <AlertDialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Correct Payment Allocation</AlertDialogTitle>
              <AlertDialogDescription>
                Correcting payment for truck {selectedCorrection?.truck.truck_number}.
                Original amount: ${formatNumber(selectedCorrection?.allocation.amount || 0)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>New Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={correctionAmount}
                  onChange={(e) => setCorrectionAmount(e.target.value)}
                  placeholder="Enter corrected amount"
                />
              </div>
              <div className="space-y-2">
                <Label>Correction Note</Label>
                <Input
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  placeholder="Explain reason for correction"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleCorrectionSubmit}
                className="bg-red-500 hover:bg-red-600"
              >
                Apply Correction
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Add new confirmation dialog */}
        <AlertDialog open={!!actionConfirmation} onOpenChange={() => setActionConfirmation(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {actionConfirmation?.type === 'reverse' ? 'Reverse Payment' :
                 actionConfirmation?.type === 'writeoff' ? 'Write Off Balance' :
                 'Correct Payment'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!actionConfirmation) return;
                  const { type, payment, truck, allocation } = actionConfirmation;
                  
                  if (type === 'reverse') {
                    handleReverseTruckPayment(payment, truck, allocation);
                  } else if (type === 'writeoff') {
                    handleWriteOff(payment, truck, allocation);
                  }
                  
                  setActionConfirmation(null);
                }}
                className="bg-red-500 hover:bg-red-600"
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}

