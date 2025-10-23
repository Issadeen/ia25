"use client"

import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useEffect, useState, useMemo, useCallback } from "react"
import { database } from "@/lib/firebase"
import { ref, onValue, update, get, push, set, query, orderByChild, equalTo } from "firebase/database"
import { formatNumber, toFixed2, cn } from "@/lib/utils" // Add cn to imports
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
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
  Scale,
  Trash2, // Add Trash2 icon
  Check as CheckIcon,
  Pencil as PencilIcon,
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
  updatePaymentStatuses, // Add updatePaymentStatuses import
  type PaymentCorrection,
  correctPaymentAllocation, // Add PaymentCorrection and correctPaymentAllocation import
  getAvailableBalance, // Add getAvailableBalance import
} from "@/lib/payment-utils"
import {
  auditTruck,
  auditOwner,
  fixUnlinkedPayments,
  generateReconciliationSummary,
  type TruckReconciliationReport
} from "@/lib/reconciliation-helpers"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu" // Add DropdownMenu imports
import { AlertCircle, Receipt, Shield } from "lucide-react" // Add new imports
import { useProfileImage } from "@/hooks/useProfileImage"
import React from "react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  type: "deposit" | "usage" | "manual_adjustment" | "reconciliation_adjustment" // Add new types
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

// Payment tolerance - small balances under this amount are considered paid
// This prevents issues with rounding (e.g., $0.06 balances)
const PAYMENT_TOLERANCE = 0.10; // 10 cents

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

  // Add new state for selected trucks
  const [selectedTrucks, setSelectedTrucks] = useState<Set<string>>(new Set())

  // Add new state for the feature
  const [ownerNameClickCount, setOwnerNameClickCount] = useState(0)
  const [isBalanceEditMode, setIsBalanceEditMode] = useState(false)
  const [manualBalance, setManualBalance] = useState<string>("")
  
  // Add new state for AT20 and price editing
  const [editingAt20, setEditingAt20] = useState<string | null>(null)
  const [newAt20Value, setNewAt20Value] = useState<string>("")
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const [newPriceValue, setNewPriceValue] = useState<string>("")
  const [isWorkIdDialogOpen, setIsWorkIdDialogOpen] = useState(false)
  const [workIdInput, setWorkIdInput] = useState<string>("")
  const [isVerifyingWorkId, setIsVerifyingWorkId] = useState(false)
  const [pendingAt20Update, setPendingAt20Update] = useState<{truckId: string, newValue: string} | null>(null)
  const [pendingPriceUpdate, setPendingPriceUpdate] = useState<{truckId: string, newValue: string} | null>(null)

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

  // Add new state for reconciliations
  const [reconciliations, setReconciliations] = useState<any[]>([])
  const [isReconciliationDialogOpen, setIsReconciliationDialogOpen] = useState(false)
  const [reconciliationFormData, setReconciliationFormData] = useState({
    theirBalance: 0,
    note: "",
    amountOwed: 0,
    amountToPay: 0
  })
  const [activeBalanceView, setActiveBalanceView] = useState<'ours' | 'theirs' | 'difference'>('ours')
  const [showReconciliationHistory, setShowReconciliationHistory] = useState(false)

  // Add new state for monthly data
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(
    new Set([new Date().getMonth() + 1]) // Default to current month selected
  )

  // Add new state for selected trucks total
  const [selectedTrucksTotal, setSelectedTrucksTotal] = useState(0)

  // Add pagination state
  const [displayLimit, setDisplayLimit] = useState(50) // Show 50 trucks initially

  // Add reconciliation audit state
  const [isAuditRunning, setIsAuditRunning] = useState(false)
  const [auditResults, setAuditResults] = useState<any>(null)
  const [showAuditDialog, setShowAuditDialog] = useState(false)
  const [selectedTruckAudit, setSelectedTruckAudit] = useState<any>(null)

  // Add state for tracking overpayment credits
  const [availableCredits, setAvailableCredits] = useState(0)

  const profilePicUrl = useProfileImage()

  // Helper function to filter data by month - must be defined before useMemo hooks use it
  const filterByMonth = (date: string, year: number, months: Set<number>) => {
    const itemDate = new Date(date);
    return itemDate.getFullYear() === year && months.has(itemDate.getMonth() + 1);
  };

  // Memoize filtered work details for better performance
  const filteredWorkDetails = useMemo(() => {
    return workDetails.filter(truck => {
      // Only include loaded trucks that aren't fully paid
      if (truck.loaded) {
        const { balance } = getTruckAllocations(truck, truckPayments);
        
        // If the truck has a positive balance (due or pending), include it regardless of date
        // Or if it's selected, include it
        if (balance > 0 || selectedTrucks.has(truck.id)) {
          return true;
        }
        
        // For fully paid trucks, only include if they match the month filter
        if (balance <= 0 && truck.createdAt) {
          return filterByMonth(truck.createdAt, selectedYear, selectedMonths);
        }
      }
      
      // Include pending orders (not loaded) if they match the month filter
      if (!truck.loaded && truck.createdAt) {
        return filterByMonth(truck.createdAt, selectedYear, selectedMonths);
      }
      
      // Default: exclude
      return false;
    });
  }, [workDetails, truckPayments, selectedTrucks, selectedYear, selectedMonths]);

  // Memoize displayed (paginated) work details
  const displayedWorkDetails = useMemo(() => {
    const loaded = filteredWorkDetails.filter(t => t.loaded);
    return loaded.slice(0, displayLimit);
  }, [filteredWorkDetails, displayLimit]);

  // Keep legacy function for compatibility
  const getFilteredWorkDetails = useCallback(() => filteredWorkDetails, [filteredWorkDetails]);

  // Reset pagination when filters change
  useEffect(() => {
    setDisplayLimit(50);
  }, [selectedYear, selectedMonths]);

  // Fetch data when component mounts - with proper cleanup
  useEffect(() => {
    let isMounted = true;
    const unsubscribers: (() => void)[] = [];

    const fetchOwnerData = async () => {
      try {
        // Fetch work details - filtered by owner
        const workDetailsRef = ref(database, `work_details`)
        const unsubWork = onValue(workDetailsRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            const data = Object.entries(snapshot.val())
              .map(([id, detail]: [string, any]) => ({ id, ...detail }))
              .filter((detail) => detail.owner === owner)
            setWorkDetails(data)
          }
        })
        unsubscribers.push(unsubWork);

        // Fetch payments
        const paymentsRef = ref(database, `payments/${owner}`)
        const unsubPayments = onValue(paymentsRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            const payments = Object.entries(snapshot.val()).map(([id, data]: [string, any]) => ({ id, ...data }))
            setOwnerPayments(payments)
          }
        })
        unsubscribers.push(unsubPayments);

        // Fetch balance
        const balanceRef = ref(database, `owner_balances/${owner}`)
        const unsubBalance = onValue(balanceRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            setOwnerBalance(snapshot.val())
          }
        })
        unsubscribers.push(unsubBalance);

        // Fetch overpayment credits
        const creditsRef = ref(database, `owner_credits/${owner}`)
        const unsubCredits = onValue(creditsRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            const creditsData = Object.values(snapshot.val()) as any[];
            const totalCredits = creditsData
              .filter((c) => c.status === 'available')
              .reduce((sum, c) => sum + (c.amount || 0), 0);
            setAvailableCredits(totalCredits);
          } else {
            setAvailableCredits(0);
          }
        })
        unsubscribers.push(unsubCredits);

        // Fetch truck payments
        const truckPaymentsRef = ref(database, "truckPayments")
        const unsubTruckPayments = onValue(truckPaymentsRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            setTruckPayments(snapshot.val())
          }
        })
        unsubscribers.push(unsubTruckPayments);

        // Fetch balance usage history
        const historyRef = ref(database, `balance_usage/${owner}`)
        const unsubHistory = onValue(historyRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            setBalanceUsageHistory(Object.values(snapshot.val()))
          }
        })
        unsubscribers.push(unsubHistory);

        // Fetch payment order
        const orderRef = ref(database, `payment_order/${owner}`)
        const unsubOrder = onValue(orderRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            setPaymentOrder(snapshot.val())
          }
        })
        unsubscribers.push(unsubOrder);

        // Fetch reconciliations
        const reconciliationsRef = ref(database, `payment_reconciliations/${owner}`)
        const unsubReconciliations = onValue(reconciliationsRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            setReconciliations(Object.values(snapshot.val()))
          }
        })
        unsubscribers.push(unsubReconciliations);

        if (isMounted) {
          setIsLoading(false)
        }
      } catch (error) {
        console.error("Error fetching data:", error)
        if (isMounted) {
          toast({
            title: "Error",
            description: "Failed to load owner data",
          })
        }
      }
    }

    fetchOwnerData()

    // Cleanup function
    return () => {
      isMounted = false;
      unsubscribers.forEach(unsub => unsub());
    }
  }, [owner, selectedYear, selectedMonths])

  // Add these helper functions to filter data by date
  const getFilteredOwnerPayments = () => {
    return ownerPayments.filter(payment => 
      filterByMonth(payment.timestamp, selectedYear, selectedMonths)
    );
  };

  const getFilteredBalanceHistory = () => {
    return balanceUsageHistory.filter(entry => 
      filterByMonth(entry.timestamp, selectedYear, selectedMonths)
    );
  };

  // Update calculateTotals to use filtered data
  const calculateTotals = (): OwnerTotals => {
    const loadedTrucks = getFilteredWorkDetails().filter((truck) => truck.loaded);

    const totals = loadedTrucks.reduce(
      (sum, truck) => {
        const { totalDue, totalAllocated, pendingAmount, balance } = getTruckAllocations(truck, truckPayments);
        
        // If there's an overpayment (negative balance), separate it from the actual payment
        const amountPaidAgainstDue = balance < 0 ? totalDue : totalAllocated;
        
        return {
          totalDue: sum.totalDue + totalDue,
          totalPaid: sum.totalPaid + amountPaidAgainstDue, // Only count actual payments, not overpayments
          pendingTotal: sum.pendingTotal + (pendingAmount || 0),
        };
      },
      { totalDue: 0, totalPaid: 0, pendingTotal: 0 },
    );

    return {
      ...totals,
      balance: totals.totalDue - totals.totalPaid,
      existingBalance: ownerBalance?.amount || 0,
    };
  };

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
          await updatePaymentStatuses(database, updates, truck, allocation, truckPayments, owner)
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
      return a[key] < b[key] ? -1 : 1
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
      body: getFilteredWorkDetails()
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
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      putOnlyUsedFonts: true,
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;

    // Calculate usable width (total width minus margins)
    const usableWidth = pageWidth - (margin * 2);
    
    // Calculate column widths as percentages of usable width
    const columnWidths = {
      0: usableWidth * 0.2,  // Truck Number: 20%
      1: usableWidth * 0.15, // Date: 15%
      2: usableWidth * 0.15, // Payment ID: 15%
      3: usableWidth * 0.2,  // Amount: 20%
      4: usableWidth * 0.3   // Note: 30%
    };

    // Header - only at the top of first page
    doc.setFillColor(41, 128, 185);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(`${owner} - Truck Payment Tracker`, pageWidth / 2, 13, { align: "center" });

    let startY = 25;

    // Create table data matching the UI table structure
    const tableData: any[] = [];
    
    // Get filtered and sorted trucks
    const filteredTrucks = getFilteredWorkDetails()
      .filter(truck => truck.loaded && truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase()))
      .sort((a, b) => (paymentOrder[a.id] || 0) - (paymentOrder[b.id] || 0));

    // Process each truck and its payments
    filteredTrucks.forEach((truck, index) => {
      const payments = getFilteredOwnerPayments()
        .flatMap(payment => 
          payment.allocatedTrucks
            ?.filter((allocation: any) => allocation.truckId === truck.id)
            .map((allocation: any) => ({
              truck: truck.truck_number,
              date: new Date(payment.timestamp).toLocaleDateString(),
              paymentId: payment.id.slice(-6),
              amount: allocation.amount,
              note: payment.note || '—'
            }))
        )
        .filter(Boolean)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const total = payments.reduce((sum, p) => sum + p.amount, 0);

      // Add the truck total row with index number
      tableData.push([
        { content: `${index + 1}. ${truck.truck_number}`, styles: { fontStyle: 'bold' } },
        { content: 'Total Payments', styles: { fontStyle: 'bold' } },
        { content: '', styles: { fontStyle: 'bold' } },
        { content: `$${formatNumber(total)}`, styles: { fontStyle: 'bold', textColor: [46, 204, 113], halign: 'right' } },
        { content: '', styles: { fontStyle: 'bold' } }
      ]);

      // Add payment rows
      if (payments.length === 0) {
        tableData.push([
          '', // Empty because truck number is in rowSpan
          '—',
          '—',
          '$0.00',
          'No payments recorded'
        ]);
      } else {
        payments.forEach((payment, idx) => {
          tableData.push([
            '', // Empty because truck number is in rowSpan
            payment.date,
            payment.paymentId,
            `$${formatNumber(payment.amount)}`,
            payment.note
          ]);
        });
      }

      // Add a small spacing after each truck section
      tableData.push([{ content: '', styles: { cellPadding: 1 } }, '', '', '', '']);
    });

    // Add the table with optimized column widths
    autoTable(doc, {
      startY: startY,
      head: [[
        'Truck Number',
        'Date',
        'Payment ID',
        'Amount',
        'Note'
      ]],
      body: tableData,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: [189, 195, 199],
        lineWidth: 0.1,
        minCellWidth: 20, // Ensure minimum cell width
        cellWidth: 'wrap', // Allow content wrapping
      },
      columnStyles: {
        0: { cellWidth: columnWidths[0] }, // Truck Number
        1: { cellWidth: columnWidths[1] }, // Date
        2: { cellWidth: columnWidths[2] }, // Payment ID
        3: { cellWidth: columnWidths[3], halign: 'right' }, // Amount
        4: { cellWidth: columnWidths[4] }  // Note
      },
      headStyles: {
        fillColor: [52, 152, 219],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      // Add page numbers only
      didDrawPage: function(data: any) {
        doc.setTextColor(128, 128, 128);
        doc.setFontSize(8);
        doc.text(
          `Page ${data.pageCount}`, 
          pageWidth - margin, 
          pageHeight - 10, 
          { align: 'right' }
        );
      }
    });

    doc.save(`${owner}_TruckPayments_${new Date().toISOString().split("T")[0]}.pdf`);
  };

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
    getFilteredWorkDetails()
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
    getFilteredOwnerPayments().forEach((payment) => {
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
    getFilteredBalanceHistory().forEach((entry) => {
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

  // Auto-fix retroactive credits if there are overpayments without credits
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const autoFixCredits = async () => {
      // Check if there are overpayments (negative balances) but no available credits
      const hasOverpayments = workDetails.some(truck => {
        if (!truck.loaded) return false
        const { balance } = getTruckAllocations(truck, truckPayments)
        return balance < 0
      })

      // If we have overpayments but no credits, auto-fix
      if (hasOverpayments && availableCredits === 0) {
        try {
          const response = await fetch('/api/admin/fix-credits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner })
          })
          const data = await response.json()
          // Silently complete - the Firebase listener will pick up the new credits
        } catch (error) {
          // Silent fail - don't bother the user with auto-fix errors
        }
      }
    }

    // Debounce the auto-fix to avoid too many calls
    if (workDetails.length > 0) {
      timeoutId = setTimeout(autoFixCredits, 500)
    }

    return () => clearTimeout(timeoutId)
  }, [owner, workDetails, truckPayments, availableCredits])

  // Add functions for truck selection
  const handleTruckSelect = (truckId: string) => {
    setSelectedTrucks(prevSelected => {
      const newSelected = new Set(prevSelected)
      if (newSelected.has(truckId)) {
        newSelected.delete(truckId)
      } else {
        newSelected.add(truckId)
      }
      return newSelected
    })
  }

  const handleSelectAllTrucks = (checked: boolean) => {
    if (checked) {
      const allUnpaidTruckIds = getFilteredWorkDetails()
        .filter(truck => truck.loaded && getTruckAllocations(truck, truckPayments).balance > 0)
        .map(truck => truck.id)
      setSelectedTrucks(new Set(allUnpaidTruckIds))
    } else {
      setSelectedTrucks(new Set())
    }
  }

  // Calculate total for selected trucks
  useEffect(() => {
    let total = 0
    selectedTrucks.forEach(truckId => {
      const truck = workDetails.find(t => t.id === truckId)
      if (truck) {
        const { balance } = getTruckAllocations(truck, truckPayments)
        if (balance > 0) { // Only sum up if there's a balance due
          total += balance
        }
      }
    })
    setSelectedTrucksTotal(total)
  }, [selectedTrucks, workDetails, truckPayments])

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

      const updates = await syncTruckPaymentStatus(database, truck, truckPayments, owner)
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
        const updates = await syncTruckPaymentStatus(database, truck, truckPayments, owner)
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

  // Add new handler to fix retroactive credits
  const handleFixRetroactiveCredits = async () => {
    try {
      const response = await fetch('/api/admin/fix-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ owner })
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Credits Fixed",
          description: `Created ${data.creditsCreated} credit records from overpayments`,
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to fix credits",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Fix credits error:", error)
      toast({
        title: "Error",
        description: "Failed to fix retroactive credits",
        variant: "destructive",
      })
    }
  }

  // Add new handler to mark credits as used
  const handleMarkCreditsUsed = async () => {
    try {
      // Get all available credits for this owner
      const creditsRef = ref(database, `owner_credits/${owner}`)
      const creditsSnapshot = await get(creditsRef)

      if (!creditsSnapshot.exists()) {
        toast({
          title: "No Credits",
          description: "No credits found to mark as used",
        })
        return
      }

      const creditsData = creditsSnapshot.val()
      const availableCreditIds = Object.entries(creditsData)
        .filter(([_, credit]: any) => credit.status === 'available')
        .map(([id, _]) => id)

      if (availableCreditIds.length === 0) {
        toast({
          title: "No Available Credits",
          description: "All credits have already been used",
        })
        return
      }

      // Call API to mark credits as used
      const response = await fetch('/api/admin/mark-credits-used', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          owner,
          creditIds: availableCreditIds
        })
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Credits Marked as Used",
          description: `${data.creditsMarked} credits ($${data.totalAmount.toFixed(2)}) marked as used`,
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to mark credits as used",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Mark credits used error:", error)
      toast({
        title: "Error",
        description: "Failed to mark credits as used",
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
    return getFilteredWorkDetails()
      .filter((truck) => truck.loaded && truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase()))
      .sort((a, b) => a.truck_number.localeCompare(b.truck_number))
  }

  // Add function to group payments by truck
  const groupPaymentsByTruck = () => {
    const grouped: { [key: string]: GroupedTruckPayment } = {}

    getFilteredOwnerPayments()
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
    const sortedTrucks = getFilteredWorkDetails()
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

  // Add function to get active balance based on view
  const getActiveBalance = (): number => {
    const ourBalance = ownerBalance?.amount || 0
    
    // Find latest accepted reconciliation
    const latestAccepted = reconciliations
      .filter(rec => rec.status === 'accepted')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
    
    if (!latestAccepted) {
      return ourBalance;
    }
    
    switch (activeBalanceView) {
      case 'ours':
        return ourBalance;
      case 'theirs':
        return latestAccepted.theirBalance
      case 'difference':
        return ourBalance - latestAccepted.theirBalance
    }
  }

  // Add function to handle reconciliation submission
  const handleReconciliationSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      // Fetch user info first
      const userInfoRes = await fetch('/api/user-info');
      if (!userInfoRes.ok) {
        throw new Error('Failed to fetch user info for reconciliation');
      }
      const userInfo = await userInfoRes.json();
      const userEmail = userInfo.email || 'unknown'; // Get email from API response

      const ourBalance = ownerBalance?.amount || 0
      const theirBalance = reconciliationFormData.theirBalance
      const difference = ourBalance - theirBalance
      const timestamp = new Date().toISOString()
      
      const reconciliationRef = push(ref(database, `payment_reconciliations/${owner}`))
      const reconciliationId = reconciliationRef.key!
      
      await set(reconciliationRef, {
        id: reconciliationId,
        ourBalance,
        theirBalance,
        difference,
        timestamp,
        status: 'pending',
        note: reconciliationFormData.note,
        createdBy: userEmail // Use fetched email
      })
      
      toast({
        title: "Reconciliation Recorded",
        description: `Difference of $${formatNumber(Math.abs(difference))} recorded`,
      })
      
      setIsReconciliationDialogOpen(false)
      setReconciliationFormData({
        theirBalance: 0,
        note: "",
        amountOwed: 0,
        amountToPay: 0
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record reconciliation",
        variant: "destructive",
      })
    }
  }

  // Add function to handle reconciliation status update
  const handleReconciliationStatus = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      // Fetch user info first
      const userInfoRes = await fetch('/api/user-info');
      if (!userInfoRes.ok) {
        throw new Error('Failed to fetch user info for reconciliation update');
      }
      const userInfo = await userInfoRes.json();
      const userEmail = userInfo.email || 'unknown'; // Get email from API response

      await update(ref(database, `payment_reconciliations/${owner}/${id}`), {
        status,
        resolvedAt: new Date().toISOString(),
        resolvedBy: userEmail // Use fetched email
      })
      
      toast({
        title: status === 'accepted' ? "Reconciliation Accepted" : "Reconciliation Rejected",
        description: status === 'accepted' ? 
          "The balance difference has been recorded" : 
          "The reconciliation has been rejected",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update reconciliation status",
        variant: "destructive",
      })
    }
  }

  // Get pending and accepted reconciliations
  const pendingReconciliations = reconciliations
    .filter(rec => rec.status === 'pending')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const acceptedReconciliations = reconciliations
    .filter(rec => rec.status === 'accepted')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Add function to verify work ID
  const verifyWorkId = async () => {
    if (!workIdInput.trim()) {
      toast({
        title: "Work ID Required",
        description: "Please enter a valid Work ID",
        variant: "destructive",
      })
      return
    }
    
    setIsVerifyingWorkId(true)
    
    try {
      // Use dedicated API endpoint for verification instead of direct DB access
      const response = await fetch('/api/auth/verify-approver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workId: workIdInput.trim() }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Work ID verified, proceed with the update
        if (pendingAt20Update) {
          await updateAt20Value()
        } else if (pendingPriceUpdate) {
          await updatePriceValue()
        }
        setIsWorkIdDialogOpen(false)
      } else {
        toast({
          title: "Invalid Work ID",
          description: "The Work ID you entered is not valid",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error verifying work ID:", error)
      toast({
        title: "Verification Error",
        description: "Failed to verify Work ID. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsVerifyingWorkId(false)
    }
  }
  
  // Add function to update AT20 value
  const updateAt20Value = async () => {
    if (!pendingAt20Update) return
    
    try {
      const { truckId, newValue } = pendingAt20Update
      const db = database
      const truckRef = ref(db, `work_details/${truckId}`)
      
      // Update the AT20 value
      await update(truckRef, {
        at20: parseFloat(newValue),
        lastUpdated: new Date().toISOString(),
        updatedBy: session?.user?.email || "unknown",
      })
      
      // Update local state
      setWorkDetails(prevDetails => 
        prevDetails.map(truck => 
          truck.id === truckId 
            ? { ...truck, at20: newValue } 
            : truck
        )
      )
      
      setEditingAt20(null)
      setPendingAt20Update(null)
      
      toast({
        title: "AT20 Updated",
        description: "The AT20 value has been updated successfully",
      })
    } catch (error) {
      console.error("Error updating AT20:", error)
      toast({
        title: "Update Error",
        description: "Failed to update AT20 value. Please try again.",
        variant: "destructive",
      })
    }
  }
  
  // Add function to update Price value
  const updatePriceValue = async () => {
    if (!pendingPriceUpdate) return
    
    try {
      const { truckId, newValue } = pendingPriceUpdate
      const db = database
      const truckRef = ref(db, `work_details/${truckId}`)
      
      // Update the price value
      await update(truckRef, {
        price: parseFloat(newValue),
        lastUpdated: new Date().toISOString(),
        updatedBy: session?.user?.email || "unknown",
      })
      
      // Update local state
      setWorkDetails(prevDetails => 
        prevDetails.map(truck => 
          truck.id === truckId 
            ? { ...truck, price: newValue } 
            : truck
        )
      )
      
      setEditingPrice(null)
      setPendingPriceUpdate(null)
      
      toast({
        title: "Price Updated",
        description: "The price value has been updated successfully",
      })
    } catch (error) {
      console.error("Error updating price:", error)
      toast({
        title: "Update Error",
        description: "Failed to update price value. Please try again.",
        variant: "destructive",
      })
    }
  }
  
  // Add function to handle AT20 edit click
  const handleAt20EditClick = (truckId: string, currentValue: string | number) => {
    setEditingAt20(truckId)
    setNewAt20Value(currentValue?.toString() || "")
  }
  
  // Add function to handle Price edit click
  const handlePriceEditClick = (truckId: string, currentValue: string | number) => {
    setEditingPrice(truckId)
    setNewPriceValue(currentValue?.toString() || "")
  }
  
  // Add function to handle AT20 edit save
  const handleAt20EditSave = (truckId: string) => {
    if (!newAt20Value || isNaN(parseFloat(newAt20Value))) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid number for AT20",
        variant: "destructive",
      })
      return
    }
    
    // Store the pending update and prompt for work ID
    setPendingAt20Update({ truckId, newValue: newAt20Value })
    setPendingPriceUpdate(null)
    setWorkIdInput("")
    setIsWorkIdDialogOpen(true)
    setIsVerifyingWorkId(false)
  }
  
  // Add function to handle Price edit save
  const handlePriceEditSave = (truckId: string) => {
    if (!newPriceValue || isNaN(parseFloat(newPriceValue))) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid number for Price",
        variant: "destructive",
      })
      return
    }
    
    // Store the pending update and prompt for work ID
    setPendingPriceUpdate({ truckId, newValue: newPriceValue })
    setPendingAt20Update(null)
    setWorkIdInput("")
    setIsWorkIdDialogOpen(true)
    setIsVerifyingWorkId(false)
  }

  const monthNames = Array.from({ length: 12 }, (_, i) => 
    new Date(2000, i, 1).toLocaleString('default', { month: 'long' })
  );

  const handleMonthToggle = (month: number) => {
    setSelectedMonths(prevMonths => {
      const newMonths = new Set(prevMonths);
      if (newMonths.has(month)) {
        newMonths.delete(month);
      } else {
        newMonths.add(month);
      }
      return newMonths;
    });
  };

  const handleAllMonthsToggle = (checked: boolean) => {
    if (checked) {
      setSelectedMonths(new Set(Array.from({ length: 12 }, (_, i) => i + 1)));
    } else {
      setSelectedMonths(new Set());
    }
  };

  const getSelectedMonthsText = () => {
    if (selectedMonths.size === 12) return "All Months";
    if (selectedMonths.size === 0) return "No Months Selected";
    if (selectedMonths.size <= 3) {
      return Array.from(selectedMonths)
        .sort((a, b) => a - b)
        .map(m => monthNames[m - 1].substring(0, 3))
        .join(', ');
    }
    return `${selectedMonths.size} Months Selected`;
  };

  // Add audit functions
  const handleRunAudit = async () => {
    if (!owner) return;
    
    setIsAuditRunning(true);
    try {
      const result = await auditOwner(database, owner);
      setAuditResults(result);
      setShowAuditDialog(true);
      
      toast({
        title: "Audit Complete",
        description: `Found ${result.trucksWithIssues} truck(s) with issues out of ${result.totalTrucks} total`,
      });
    } catch (error) {
      console.error("Audit error:", error);
      toast({
        title: "Audit Failed",
        description: "Failed to run reconciliation audit",
        variant: "destructive",
      });
    } finally {
      setIsAuditRunning(false);
    }
  };

  const handleAuditTruck = async (truckId: string) => {
    if (!owner) return;
    
    const truck = workDetails.find(t => t.id === truckId);
    if (!truck) return;
    
    setIsAuditRunning(true);
    try {
      const report = await auditTruck(database, truck, owner);
      setSelectedTruckAudit(report);
      setShowAuditDialog(true);
      
      if (report.issues.length > 0) {
        toast({
          title: "Issues Found",
          description: `Found ${report.issues.length} issue(s) with this truck`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "No Issues",
          description: "This truck has no payment allocation issues",
        });
      }
    } catch (error) {
      console.error("Audit error:", error);
      toast({
        title: "Audit Failed",
        description: "Failed to audit truck",
        variant: "destructive",
      });
    } finally {
      setIsAuditRunning(false);
    }
  };

  const handleFixUnlinkedPayments = async (report: TruckReconciliationReport) => {
    if (!owner || report.unlinkedPayments.length === 0) return;
    
    try {
      await fixUnlinkedPayments(database, report.truckId, report.unlinkedPayments);
      
      toast({
        title: "Payments Fixed",
        description: `Restored ${report.unlinkedPayments.length} payment(s) totaling $${formatNumber(report.unlinkedPayments.reduce((sum, p) => sum + p.amount, 0))}`,
      });
      
      // Re-run audit to confirm fix
      await handleAuditTruck(report.truckId);
    } catch (error) {
      console.error("Fix error:", error);
      toast({
        title: "Fix Failed",
        description: "Failed to fix unlinked payments",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen">
      {/* Animate header */}
      <motion.header
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        className="fixed top=0 left=0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl"
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
                <div className="flex flex-col">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">
                      Balance:
                    </span>
                    <div className="relative group">
                      <div
                        className="text-sm font-medium hover:text-emerald-600 cursor-pointer"
                        onClick={() => {
                          if (acceptedReconciliations.length > 0) {
                            setActiveBalanceView(
                              activeBalanceView === 'ours' ? 'theirs' : 
                              activeBalanceView === 'theirs' ? 'difference' : 'ours'
                            )
                            toast({
                              title: `Now showing ${
                                activeBalanceView === 'ours' ? "their" : 
                                activeBalanceView === 'theirs' ? "difference in" : "our"
                              } balance`,
                              description: "Click again to cycle through views"
                            })
                          }
                        }}
                      >
                        ${formatNumber(getActiveBalance())}
                      </div>
                      {acceptedReconciliations.length > 0 && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500"></div>
                      )}
                      {activeBalanceView !== 'ours' && (
                        <span className="absolute -bottom-5 left-0 text-[10px] whitespace-nowrap px-1 py-0.5 bg-muted rounded">
                          {activeBalanceView === 'theirs' ? "Their balance" : "Balance difference"}
                        </span>
                      )}
                    </div>
                  </div>
                  {pendingReconciliations.length > 0 && (
                    <span 
                      className="text-[10px] text-amber-500 hover:text-amber-600 cursor-pointer"
                      onClick={() => setShowReconciliationHistory(true)}
                    >
                      {pendingReconciliations.length} pending reconciliation{pendingReconciliations.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsReconciliationDialogOpen(true)}
                className="relative hover:bg-emerald-100"
                title="Record Balance Difference"
              >
                <Scale className="h-4 w-4 sm:h-5 w-5 text-emerald-600" />
                <span className="sr-only">Record Balance Difference</span>
              </Button>
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
                className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-pink-500/50 cursor-pointer"
                onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                  // Count clicks within 500ms
                  const now = Date.now();
                  if (now - (Number(e.currentTarget.dataset.lastClick) || 0) < 500) {
                    e.currentTarget.dataset.clicks = String(Number(e.currentTarget.dataset.clicks || 0) + 1);
                    if (Number(e.currentTarget.dataset.clicks) >= 3) {
                      // Triple click detected - navigate to playground
                      router.push(`/dashboard/work/${params.owner}/playground`);
                    }
                  } else {
                    e.currentTarget.dataset.clicks = "1";
                  }
                  e.currentTarget.dataset.lastClick = String(now);
                }}
              >
                <AvatarImage 
                  src={profilePicUrl || ''} 
                  alt="Profile"
                />
                <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {session?.user?.name?.[0]?.toUpperCase() || 'U'}
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
            {/* Add year and month selection */}
            <div className="flex justify-end gap-2">
              <Select
                value={String(selectedYear)}
                onValueChange={(value: string) => setSelectedYear(Number(value))}
              >
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Replace Select with DropdownMenu for multi-month selection */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-[180px] h-8 text-xs justify-between">
                    <span>{getSelectedMonthsText()}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[180px]">
                  <DropdownMenuCheckboxItem
                    checked={selectedMonths.size === 12}
                    onCheckedChange={handleAllMonthsToggle}
                  >
                    All Months
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {monthNames.map((name, index) => (
                    <DropdownMenuCheckboxItem
                      key={name}
                      checked={selectedMonths.has(index + 1)}
                      onCheckedChange={() => handleMonthToggle(index + 1)}
                    >
                      {name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

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
                    {getFilteredWorkDetails().length}
                  </div>
                </Card>
              </motion.div>
              <motion.div variants={slideUp}>
                <Card className="p-2 sm:p-4">
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">Loaded Trucks</div>
                  <div className="text-lg sm:text-2xl font-bold">
                    {getFilteredWorkDetails().filter(t => t.loaded).length}
                  </div>
                </Card>
              </motion.div>
              <motion.div variants={slideUp}>
                <Card className="p-2 sm:p-4">
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">AGO Orders</div>
                  <div className="text-lg sm:text-2xl font-bold">
                    {getFilteredWorkDetails().filter(t => t.product === 'AGO').length}
                  </div>
                </Card>
              </motion.div>
              <motion.div variants={slideUp}>
                <Card className="p-2 sm:p-4">
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">PMS Orders</div>
                  <div className="text-lg sm:text-2xl font-bold">
                    {getFilteredWorkDetails().filter(t => t.product === 'PMS').length}
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
                          {getFilteredWorkDetails()
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
                      {getFilteredWorkDetails().filter(detail => !detail.loaded && detail.status === "queued").length === 0 && (
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
                <div className="flex justify-between items-center mb-3 sm:mb-4">
                  <h2 className="text-lg sm:text-xl font-semibold">Financial Summary</h2>
                  
                  {acceptedReconciliations.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Balance View:</span>
                      <Select 
                        value={activeBalanceView}
                        onValueChange={(value: 'ours' | 'theirs' | 'difference') => setActiveBalanceView(value)}
                      >
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ours">Our Balance</SelectItem>
                          <SelectItem value="theirs">Their Balance</SelectItem>
                          <SelectItem value="difference">Difference</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  {(() => {
                    const totals = calculateTotals();
                    const activeBalance = getActiveBalance();
                    
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
                          <div className={`text-lg sm:text-2xl font-bold ${totals.balance === 0 ? 'text-green-600' : 'text-red-600'}`}>
                            $${formatNumber(Math.abs(totals.balance))}
                            {totals.pendingTotal > 0 && (
                              <div className="text-xs sm:text-sm text-orange-500">
                                Includes ${formatNumber(totals.pendingTotal)} pending
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="p-2 sm:p-4 rounded-lg border">
                          <div className="text-xs sm:text-sm font-medium text-muted-foreground">Total Credits</div>
                          <div className={cn(
                            "text-lg sm:text-2xl font-bold",
                            availableCredits > 0 ? 'text-blue-600' : 'text-muted-foreground'
                          )}>
                            ${formatNumber(availableCredits)}
                          </div>
                          {availableCredits > 0 && (
                            <div className="text-xs text-blue-600 mt-1">
                              ✓ Available to use
                            </div>
                          )}
                          {availableCredits === 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              No credits
                            </div>
                          )}
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
                  <div className="flex items-center gap-2">
                    {selectedTrucks.size > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTrucks(new Set())}
                        className="text-xs"
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Clear Selection ({selectedTrucks.size})
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRunAudit}
                      disabled={isAuditRunning}
                      className="text-xs"
                      title="Run Payment Reconciliation Audit"
                    >
                      <AlertCircle className="mr-1 h-3 w-3" />
                      {isAuditRunning ? "Auditing..." : "Audit Payments"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFixAllStatuses}
                      className="text-xs"
                    >
                      Fix All Statuses
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFixRetroactiveCredits}
                      className="text-xs"
                      title="Create credits for existing overpayments"
                    >
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Fix Retroactive Credits
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleMarkCreditsUsed}
                      className="text-xs"
                      title="Mark all available credits as used"
                    >
                      <CheckIcon className="mr-1 h-3 w-3" />
                      Mark Credits Used
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <div className="min-w-[800px] sm:min-w-0"> {/* Force minimum width on mobile */}
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="p-2 text-left w-10">
                            <Checkbox
                              checked={
                                getFilteredWorkDetails().filter(truck => truck.loaded && getTruckAllocations(truck, truckPayments).balance > 0).length > 0 &&
                                selectedTrucks.size === getFilteredWorkDetails().filter(truck => truck.loaded && getTruckAllocations(truck, truckPayments).balance > 0).length
                              }
                              onCheckedChange={(checked: boolean) => handleSelectAllTrucks(!!checked)}
                              aria-label="Select all unpaid trucks"
                            />
                          </th>
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
                        {filteredWorkDetails.filter(truck => truck.loaded).length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-4 text-center text-muted-foreground">
                              No loaded trucks for the selected period.
                            </td>
                          </tr>
                        ) : (
                          displayedWorkDetails.map(truck => {
                            const { totalDue, totalAllocated, balance, pendingAmount } = getTruckAllocations(truck, truckPayments);
                            const isUnpaid = balance > 0;
                            return (
                              <tr key={truck.id} className={cn("border-t", selectedTrucks.has(truck.id) && "bg-emerald-50 dark:bg-emerald-900/30")}>
                                <td className="p-2">
                                  {isUnpaid && (
                                    <Checkbox
                                      checked={selectedTrucks.has(truck.id)}
                                      onCheckedChange={() => handleTruckSelect(truck.id)}
                                      aria-label={`Select truck ${truck.truck_number}`}
                                    />
                                  )}
                                </td>
                                <td className="p-2">{truck.truck_number}</td>
                                <td className="p-2">{truck.product}</td>
                                <td className="p-2">
                                  {editingAt20 === truck.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        value={newAt20Value}
                                        onChange={(e) => setNewAt20Value(e.target.value)}
                                        className="h-8 w-20"
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => handleAt20EditSave(truck.id)}
                                      >
                                        <CheckIcon className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => setEditingAt20(null)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span>{truck.at20 || '-'}</span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                                        onClick={() => handleAt20EditClick(truck.id, truck.at20 || '')}
                                      >
                                        <PencilIcon className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </td>
                                <td className="p-2">
                                  {editingPrice === truck.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        value={newPriceValue}
                                        onChange={(e) => setNewPriceValue(e.target.value)}
                                        className="h-8 w-20"
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => handlePriceEditSave(truck.id)}
                                      >
                                        <CheckIcon className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => setEditingPrice(null)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span>${formatNumber(Number.parseFloat(truck.price))}</span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                                        onClick={() => handlePriceEditClick(truck.id, truck.price || '')}
                                      >
                                        <PencilIcon className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </td>
                                <td className="p-2">${formatNumber(totalDue)}</td>
                                <td className="p-2">${formatNumber(totalAllocated)}</td>
                                <td className="p-2">
                                  <span className={
                                    balance < 0 ? "text-blue-600 font-medium" :
                                    balance === 0 ? "text-green-600" : 
                                    "text-red-600"
                                  }>
                                    {balance < 0 ? `-$${formatNumber(Math.abs(balance))}` : `$${formatNumber(Math.abs(balance))}`}
                                  </span>
                                </td>
                                <td className="p-2">
                                  <div className="flex items-center gap-2">
                                    <span className={
                                      balance < 0 ? "text-blue-600 font-medium" :
                                      balance === 0 ? "text-green-600" : 
                                      truck.paymentPending ? "text-orange-500" : 
                                      "text-red-600"
                                    }>
                                      {balance < 0 ? "✓ Credit" : balance === 0 ? "Paid" : truck.paymentPending ? "Pending" : "Due"}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleAuditTruck(truck.id)}
                                      className="h-6 w-6 p-0"
                                      title="Audit payment allocation"
                                      disabled={isAuditRunning}
                                    >
                                      <AlertCircle className="h-3 w-3 text-blue-500" />
                                    </Button>
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
                          })
                        )}
                      </tbody>
                    </table>

                    {/* Load More Button */}
                    {filteredWorkDetails.filter(t => t.loaded).length > displayLimit && (
                      <div className="mt-6 flex justify-center">
                        <Button
                          onClick={() => setDisplayLimit(prev => prev + 50)}
                          variant="outline"
                          className="px-6 py-3 flex items-center gap-2"
                        >
                          <span>Load More Trucks</span>
                          <span className="text-sm opacity-90">
                            ({filteredWorkDetails.filter(t => t.loaded).length - displayLimit} remaining)
                          </span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Payment History */}
            <motion.div variants={slideUp}>
              <Card className="p-3 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Payment History</h2>
                <div className="space-y-2 sm:space-y-0">
                  {getFilteredOwnerPayments().length === 0 && !isLoading ? (
                    <div className="block sm:hidden p-4 text-center text-muted-foreground">
                      No payment history for the selected period.
                    </div>
                  ) : (
                    getFilteredOwnerPayments().map((payment) => (
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
                    ))
                  )}
                  <div className="hidden sm:block overflow-x-auto">
                    {getFilteredOwnerPayments().length === 0 && !isLoading ? (
                      <div className="p-4 text-center text-muted-foreground">
                        No payment history for the selected period.
                      </div>
                    ) : (
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
                          {getFilteredOwnerPayments()
                            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) // Sort oldest first
                            .map((payment) => {
                              // Find corresponding balance usage entry
                              const balanceUsageEntry = balanceUsageHistory.find(
                                (entry) => entry.type === 'usage' && entry.paymentId === payment.id
                              );
                              const balanceUsedAmount = balanceUsageEntry?.amount || 0;
                              const totalPaymentValue = toFixed2(payment.amount + balanceUsedAmount);

                              return (
                                <tr key={payment.id} className={cn("border-t", payment.corrected && "bg-muted/50")}>
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
                                  <td className="p-2">
                                    ${formatNumber(totalPaymentValue)}
                                    {balanceUsedAmount > 0 && (
                                      <span className="ml-1 text-emerald-600" title={`Includes $${formatNumber(balanceUsedAmount)} from balance`}>
                                        <Wallet2 className="h-3 w-3 inline-block" />
                                      </span>
                                    )}
                                  </td>
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
                                  <td className="p-2 whitespace-nowrap">{payment.note || '—'}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Balance History */}
            <motion.div variants={slideUp}>
              <Card className="p-6 mt-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Balance History</h2>
                  <div className="text-sm text-muted-foreground">
                    Current Balance: ${formatNumber(ownerBalance?.amount || 0)}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-left p-2">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        return getFilteredBalanceHistory()
                          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) // Oldest first
                          .map((entry, index) => {
                            // Get related payment
                            const relatedPayment = ownerPayments.find(p => p.id === entry.paymentId);

                            // Build detail message
                            let details = '';
                            if (entry.type === 'deposit') {
                              details = `Prepayment added to balance.`;
                            } else if (entry.type === 'usage') {
                              // Find the payment associated with this usage entry
                              const paymentDetails = ownerPayments.find(p => p.id === entry.paymentId);
                              const balanceUsedAmount = entry.amount; // Amount from the balance usage entry
                              const cashPaymentAmount = paymentDetails?.amount || 0; // Amount from the payment record
                              const totalPaymentValue = toFixed2(cashPaymentAmount + balanceUsedAmount);

                              details = `Used $${formatNumber(balanceUsedAmount)} towards payment ID: ${entry.paymentId} (Total Payment: $${formatNumber(totalPaymentValue)}).`; // Updated detail string

                              if (paymentDetails && paymentDetails.allocatedTrucks) {
                                const allocationDetails = paymentDetails.allocatedTrucks.map((alloc: any) => {
                                  const truck = workDetails.find(t => t.id === alloc.truckId);
                                  return truck ? `${truck.truck_number} ($${formatNumber(alloc.amount)})` : `Unknown Truck ($${formatNumber(alloc.amount)})`;
                                }).join(', ');
                                details += ` Allocated: ${allocationDetails}.`;
                              } else if (entry.usedFor) { // Fallback if payment details aren't found but usedFor exists
                                  const relatedTrucks = entry.usedFor?.map(truckId => {
                                  const truck = workDetails.find(t => t.id === truckId);
                                  return truck?.truck_number;
                                }).filter(Boolean);
                                if (relatedTrucks && relatedTrucks.length > 0) {
                                  details += ` Allocated to trucks: ${relatedTrucks.join(', ')}.`;
                                }
                              }
                            } else if (entry.type === 'manual_adjustment') {
                              details = 'Manual balance adjustment by admin.';
                            } else if (entry.type === 'reconciliation_adjustment') {
                              details = 'Balance adjustment due to reconciliation.';
                            } else {
                              details = 'Balance activity';
                            }

                            return (
                              <tr key={`${entry.timestamp}-${index}`} className={cn(
                                "border-t transition-colors",
                                entry.type === 'deposit' ? 'bg-emerald-50/30 hover:bg-emerald-50/50' :
                                entry.type === 'manual_adjustment' ? 'bg-amber-50/30 hover:bg-amber-50/50' :
                                entry.type === 'reconciliation_adjustment' ? 'bg-purple-50/30 hover:bg-purple-50/50' :
                                index % 2 === 0 ? 'bg-muted/5 hover:bg-muted/10' : 'hover:bg-muted/10'
                              )}>
                                <td className="p-2 whitespace-nowrap text-sm">
                                  {new Date(entry.timestamp).toLocaleString()}
                                </td>
                                <td className="p-2 whitespace-nowrap">
                                  <span className={cn(
                                    "px-2 py-1 rounded-full text-xs font-medium",
                                    entry.type === 'deposit' ? 'bg-emerald-100/50 text-emerald-700' :
                                    entry.type === 'usage' ? 'bg-blue-100/50 text-blue-700' :
                                    entry.type === 'manual_adjustment' ? 'bg-amber-100/50 text-amber-700' :
                                    entry.type === 'reconciliation_adjustment' ? 'bg-purple-100/50 text-purple-700' :
                                    'bg-gray-100/50 text-gray-700'
                                  )}>
                                    {entry.type === 'deposit' ? 'Prepayment' :
                                     entry.type === 'usage' ? 'Payment Usage' :
                                     entry.type === 'manual_adjustment' ? 'Manual Adj.' :
                                     entry.type === 'reconciliation_adjustment' ? 'Recon. Adj.' :
                                     'Activity'}
                                  </span>
                                </td>
                                <td className="p-2 text-right whitespace-nowrap font-medium">
                                  <span className={
                                    entry.type === 'deposit' ? 'text-emerald-600' :
                                    (entry.type === 'usage' || entry.type === 'manual_adjustment' || entry.type === 'reconciliation_adjustment') ? 'text-red-600' :
                                    'text-gray-600'
                                  }>
                                    {entry.type === 'deposit' ? '+' : '-'}${formatNumber(entry.amount)}
                                  </span>
                                </td>
                                <td className="p-2 text-sm text-muted-foreground">
                                  {details}
                                  {entry.note && entry.note !== details && (
                                    <span className="block text-xs italic mt-1">Note: {entry.note}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                      })()}
                    </tbody>
                  </table>
                  {getFilteredBalanceHistory().length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      No balance history available
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>

            {/* Add this new section before the closing main tag */}
            <motion.div variants={slideUp}>
              <Card className="p-3 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg sm:text-xl font-semibold">Truck Payment Tracker</h2>
                    <Button variant="outline" onClick={handleDownloadTruckPaymentsPDF} className="text-xs sm:text-sm">
                      <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      Export PDF
                    </Button>
                  </div>
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
                      {getFilteredWorkDetails()
                        .filter(truck => truck.loaded && truck.truck_number.toLowerCase().includes(truckFilter.toLowerCase()))
                        .sort((a, b) => (paymentOrder[a.id] || 0) - (paymentOrder[b.id] || 0))
                        .map((truck, index) => {
                          // Calculate total due for the truck
                          const { totalDue } = getTruckAllocations(truck, truckPayments);

                          const payments = getFilteredOwnerPayments()
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

                          const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

                          return (
                            <React.Fragment key={truck.id}>
                              <tr className="bg-muted/10 font-medium">
                                <td className="border p-2" rowSpan={payments.length + 1}>
                                  <div className="flex items-center gap-2 group">
                                    {/* ... Move buttons ... */}
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
                                        disabled={paymentOrder[truck.id] === getFilteredWorkDetails().filter(t => t.loaded).length - 1}
                                      >
                                        <ChevronDown className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                                      </Button>
                                    </div>
                                    <span>{index + 1}. {truck.truck_number}</span>
                                  </div>
                                </td>
                                {/* Update summary row */}
                                <td className="border p-2 text-sm text-muted-foreground" colSpan={1}> {/* Adjusted colSpan */}
                                  Total Due:
                                </td>
                                <td className="border p-2 text-right font-semibold"> {/* Added cell for Total Due */}
                                  ${formatNumber(totalDue)}
                                </td>
                                <td className="border p-2 text-sm text-muted-foreground"> {/* Added cell for Total Paid label */}
                                  Total Paid:
                                </td>
                                <td className="border p-2 text-right text-green-600"> {/* Cell for Total Paid amount */}
                                  ${formatNumber(totalPaid)}
                                </td>
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
                  {getFilteredWorkDetails().filter(t => 
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
                                  getFilteredWorkDetails().filter(t => t.loaded),
                                  truckPayments
                                );
                                setPaymentFormData(prev => ({ ...prev, allocatedTrucks: allocations }));
                              }}
                            >
                              Auto Allocate
                            </Button>
                          </div>

                          <div className="space-y-2 max-h-[400px] overflow-y-auto rounded-lg border bg-card p-4">
                            {getFilteredWorkDetails()
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
                                      onCheckedChange={(checked: boolean) => handleTruckSelection(!!checked, truck)}
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
        {/* Add Reconciliation Dialog */}
        <Dialog open={isReconciliationDialogOpen} onOpenChange={setIsReconciliationDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-lg font-medium">Record Balance Difference</DialogTitle>
              <DialogDescription>
                Record what the owner says their balance is, so you can track the difference.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleReconciliationSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Our recorded balance:</span>
                  <span className="font-medium">${formatNumber(ownerBalance?.amount || 0)}</span>
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="theirBalance">Their claimed balance</Label>
                  <Input
                    id="theirBalance"
                    type="number"
                    step="0.01"
                    value={reconciliationFormData.theirBalance}
                    onChange={(e) => setReconciliationFormData(prev => ({
                      ...prev,
                      theirBalance: parseFloat(e.target.value) || 0
                    }))}
                    className="text-lg"
                    placeholder="Enter what they think the balance is"
                    required
                  />
                </div>
                
                <div className="pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Difference:</span>
                    <span className={cn(
                      "font-medium",
                      (ownerBalance?.amount || 0) - reconciliationFormData.theirBalance > 0 ? 
                        "text-green-600" : 
                        (ownerBalance?.amount || 0) - reconciliationFormData.theirBalance < 0 ?
                        "text-red-600" : ""
                    )}>
                      ${formatNumber(Math.abs((ownerBalance?.amount || 0) - reconciliationFormData.theirBalance))}
                      {(ownerBalance?.amount || 0) - reconciliationFormData.theirBalance !== 0 && (
                        <span className="text-xs ml-1">
                          ({(ownerBalance?.amount || 0) - reconciliationFormData.theirBalance > 0 ? 
                            "our balance is higher" : 
                            "their balance is higher"})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Add new fields for what we owe them and what they should pay */}
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="amountOwed">Amount We Owe Them</Label>
                  <Input
                    id="amountOwed"
                    type="number"
                    step="0.01"
                    value={reconciliationFormData.amountOwed || 0}
                    onChange={(e) => setReconciliationFormData(prev => ({
                      ...prev,
                      amountOwed: parseFloat(e.target.value) || 0
                    }))}
                    className="text-lg"
                    placeholder="Enter amount we owe them"
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="amountToPay">Amount They Should Pay</Label>
                  <Input
                    id="amountToPay"
                    type="number"
                    step="0.01"
                    value={reconciliationFormData.amountToPay || 0}
                    onChange={(e) => setReconciliationFormData(prev => ({
                      ...prev,
                      amountToPay: parseFloat(e.target.value) || 0
                    }))}
                    className="text-lg"
                    placeholder="Enter amount they should pay"
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="reconciliationNote">Note</Label>
                <Input
                  id="reconciliationNote"
                  value={reconciliationFormData.note}
                  onChange={(e) => setReconciliationFormData(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Add details about this reconciliation"
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsReconciliationDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Reconciliation
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        
        {/* Add Reconciliation History Dialog */}
        <Dialog open={showReconciliationHistory} onOpenChange={setShowReconciliationHistory}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="text-lg font-medium">Balance Reconciliation History</DialogTitle>
              <DialogDescription>
                View and manage balance reconciliations with {owner}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {pendingReconciliations.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 text-amber-600">Pending Reconciliations</h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {pendingReconciliations.map(rec => (
                      <div key={rec.id} className="border rounded-md p-3">
                        <div className="flex justify-between mb-2">
                          <span className="text-sm text-muted-foreground">
                            {new Date(rec.timestamp).toLocaleDateString()}, {new Date(rec.timestamp).toLocaleTimeString()}
                          </span>
                          <Badge variant="outline" className="text-amber-600 bg-amber-50">
                            Pending
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-2">
                          <div>
                            <span className="text-xs text-muted-foreground">Our Balance</span>
                            <p className="font-medium">${formatNumber(rec.ourBalance)}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Their Balance</span>
                            <p className="font-medium">${formatNumber(rec.theirBalance)}</p>
                          </div>
                        </div>
                        
                        <div className="mb-2">
                          <span className="text-xs text-muted-foreground">Difference</span>
                          <p className={cn(
                            "font-medium",
                            rec.difference > 0 ? "text-green-600" : rec.difference < 0 ? "text-red-600" : ""
                          )}>
                            ${formatNumber(Math.abs(rec.difference))}
                            <span className="text-xs ml-1">
                              ({rec.difference > 0 ? "our balance is higher" : "their balance is higher"})
                            </span>
                          </p>
                        </div>
                        
                        {rec.note && (
                          <div className="mb-3">
                            <span className="text-xs text-muted-foreground">Note</span>
                            <p className="text-sm">{rec.note}</p>
                          </div>
                        )}
                        
                        <div className="flex justify-end gap-2 pt-2 border-t">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleReconciliationStatus(rec.id, 'rejected')}
                          >
                            Reject
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => handleReconciliationStatus(rec.id, 'accepted')}
                          >
                            Accept
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {acceptedReconciliations.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 text-emerald-600">Accepted Reconciliations</h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {acceptedReconciliations.map(rec => (
                      <div key={rec.id} className="border rounded-md p-3">
                        <div className="flex justify-between mb-2">
                          <span className="text-sm text-muted-foreground">
                            {new Date(rec.timestamp).toLocaleDateString()}, {new Date(rec.timestamp).toLocaleTimeString()}
                          </span>
                          <Badge variant="outline" className="text-emerald-600 bg-emerald-50">
                            Accepted
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-2">
                          <div>
                            <span className="text-xs text-muted-foreground">Our Balance</span>
                            <p className="font-medium">${formatNumber(rec.ourBalance)}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Their Balance</span>
                            <p className="font-medium">${formatNumber(rec.theirBalance)}</p>
                          </div>
                        </div>
                        
                        <div>
                          <span className="text-xs text-muted-foreground">Difference</span>
                          <p className={cn(
                            "font-medium",
                            rec.difference > 0 ? "text-green-600" : rec.difference < 0 ? "text-red-600" : ""
                          )}>
                            ${formatNumber(Math.abs(rec.difference))}
                            <span className="text-xs ml-1">
                              ({rec.difference > 0 ? "our balance is higher" : "their balance is higher"})
                            </span>
                          </p>
                        </div>
                        
                        {rec.note && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            <p>"{rec.note}"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        
        {/* Add Work ID verification dialog */}
        <Dialog open={isWorkIdDialogOpen} onOpenChange={(open: boolean) => {
          setIsWorkIdDialogOpen(open);
          if (!open) {
            setEditingAt20(null);
            setEditingPrice(null);
            setPendingAt20Update(null);
            setPendingPriceUpdate(null);
          }
        }}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Verify Work ID</DialogTitle>
              <DialogDescription>
                Please enter a valid Work ID to update the {pendingAt20Update ? "AT20" : "price"} value.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              verifyWorkId();
            }}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="workId">Work ID</Label>
                  <Input
                    id="workId"
                    placeholder="Enter Work ID"
                    value={workIdInput}
                    onChange={(e) => setWorkIdInput(e.target.value)}
                    disabled={isVerifyingWorkId}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsWorkIdDialogOpen(false);
                    setEditingAt20(null);
                    setEditingPrice(null);
                    setPendingAt20Update(null);
                    setPendingPriceUpdate(null);
                  }}
                  disabled={isVerifyingWorkId}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isVerifyingWorkId}>
                  {isVerifyingWorkId ? (
                    <>
                      <span className="mr-2">Verifying</span>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    </>
                  ) : (
                    "Verify & Update"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Audit Results Dialog */}
        <Dialog open={showAuditDialog} onOpenChange={setShowAuditDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500" />
                Payment Reconciliation Audit
              </DialogTitle>
              <DialogDescription>
                {selectedTruckAudit 
                  ? "Detailed audit results for truck" 
                  : "Overall payment allocation analysis"}
              </DialogDescription>
            </DialogHeader>
            
            {selectedTruckAudit ? (
              /* Single Truck Audit */
              <div className="space-y-4">
                <Card className="p-4">
                  <h3 className="font-semibold mb-2">Truck Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Truck Number:</span>
                      <p className="font-medium">{selectedTruckAudit.truckNumber}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Product:</span>
                      <p className="font-medium">{selectedTruckAudit.product}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">At20:</span>
                      <p className="font-medium">{selectedTruckAudit.at20}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Price:</span>
                      <p className="font-medium">${selectedTruckAudit.price}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <h3 className="font-semibold mb-2">Financial Summary</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-muted-foreground">Total Due:</span>
                      <p className="text-lg font-bold">${formatNumber(selectedTruckAudit.totalDue)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Total Allocated:</span>
                      <p className="text-lg font-bold">${formatNumber(selectedTruckAudit.totalAllocated)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Current Balance:</span>
                      <p className="text-lg font-bold text-red-600">${formatNumber(selectedTruckAudit.currentBalance)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Expected Balance:</span>
                      <p className="text-lg font-bold text-green-600">${formatNumber(selectedTruckAudit.expectedBalance)}</p>
                    </div>
                  </div>
                  {Math.abs(selectedTruckAudit.discrepancy) > 0.01 && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <p className="text-sm font-medium text-amber-800">
                        Discrepancy: ${formatNumber(Math.abs(selectedTruckAudit.discrepancy))}
                      </p>
                    </div>
                  )}
                </Card>

                {selectedTruckAudit.paymentsFound.length > 0 && (
                  <Card className="p-4">
                    <h3 className="font-semibold mb-2">Linked Payments ({selectedTruckAudit.paymentsFound.length})</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedTruckAudit.paymentsFound.map((payment: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm border-b pb-2">
                          <span className="text-muted-foreground">{new Date(payment.timestamp).toLocaleDateString()}</span>
                          <span className="font-medium">${formatNumber(payment.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {selectedTruckAudit.unlinkedPayments.length > 0 && (
                  <Card className="p-4 border-amber-300 bg-amber-50">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold text-amber-800">Unlinked Payments ({selectedTruckAudit.unlinkedPayments.length})</h3>
                      <Button
                        size="sm"
                        onClick={() => handleFixUnlinkedPayments(selectedTruckAudit)}
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        Fix All
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedTruckAudit.unlinkedPayments.map((payment: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm border-b border-amber-200 pb-2">
                          <div>
                            <p className="text-amber-800">{new Date(payment.timestamp).toLocaleDateString()}</p>
                            <p className="text-xs text-amber-600">Payment ID: {payment.paymentId}</p>
                          </div>
                          <span className="font-medium text-amber-800">${formatNumber(payment.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-amber-700 mt-2">
                      These payments are allocated to this truck but missing from truckPayments
                    </p>
                  </Card>
                )}

                {selectedTruckAudit.duplicateEntries.length > 0 && (
                  <Card className="p-4 border-red-300 bg-red-50">
                    <h3 className="font-semibold text-red-800 mb-2">Duplicate Entries</h3>
                    <p className="text-sm text-red-700 mb-2">
                      This truck number appears {selectedTruckAudit.duplicateEntries.length + 1} times in the database
                    </p>
                    <div className="space-y-1 text-xs text-red-600">
                      {selectedTruckAudit.duplicateEntries.map((id: string) => (
                        <p key={id}>ID: {id}</p>
                      ))}
                    </div>
                  </Card>
                )}

                {selectedTruckAudit.issues.length > 0 && (
                  <Card className="p-4">
                    <h3 className="font-semibold mb-2 text-red-600">Issues Found</h3>
                    <ul className="space-y-1 text-sm">
                      {selectedTruckAudit.issues.map((issue: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-red-500">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {selectedTruckAudit.fixes.length > 0 && (
                  <Card className="p-4 bg-blue-50">
                    <h3 className="font-semibold mb-2 text-blue-600">Recommended Fixes</h3>
                    <ul className="space-y-1 text-sm">
                      {selectedTruckAudit.fixes.map((fix: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-blue-500">•</span>
                          <span>{fix}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            ) : auditResults ? (
              /* Overall Audit Results */
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Trucks</p>
                      <p className="text-2xl font-bold">{auditResults.totalTrucks}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">With Issues</p>
                      <p className="text-2xl font-bold text-amber-600">{auditResults.trucksWithIssues}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Discrepancy</p>
                      <p className="text-2xl font-bold text-red-600">${formatNumber(auditResults.totalDiscrepancy)}</p>
                    </div>
                  </div>
                </Card>

                {auditResults.reports.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="font-semibold">Trucks with Issues</h3>
                    {auditResults.reports.map((report: TruckReconciliationReport) => (
                      <Card key={report.truckId} className="p-4 hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedTruckAudit(report)}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{report.truckNumber}</p>
                            <p className="text-sm text-muted-foreground">{report.product}</p>
                            <p className="text-xs text-red-600 mt-1">{report.issues.length} issue(s)</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Current Balance</p>
                            <p className="font-bold text-red-600">${formatNumber(report.currentBalance)}</p>
                            {report.unlinkedPayments.length > 0 && (
                              <p className="text-xs text-amber-600 mt-1">
                                {report.unlinkedPayments.length} unlinked payment(s)
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <CheckIcon className="h-12 w-12 text-green-500" />
                      <p className="font-semibold text-green-600">No Issues Found!</p>
                      <p className="text-sm text-muted-foreground">All payment allocations are correct</p>
                    </div>
                  </Card>
                )}
              </div>
            ) : null}

            <DialogFooter>
              {selectedTruckAudit && (
                <Button variant="outline" onClick={() => setSelectedTruckAudit(null)}>
                  Back to Overview
                </Button>
              )}
              <Button onClick={() => {
                setShowAuditDialog(false);
                setSelectedTruckAudit(null);
              }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      {/* Floating Total Selected Balance */}
      <AnimatePresence>
        {selectedTrucks.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 w-auto max-w-md z-50"
          >
            <div
              className="p-3 sm:p-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500 rounded-lg shadow-xl border border-emerald-300 dark:border-emerald-700"
            >
              <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4">
                <span className="text-sm font-medium text-white dark:text-gray-100">
                  {selectedTrucks.size} truck{selectedTrucks.size === 1 ? '' : 's'} selected
                </span>
                <span className="text-base sm:text-lg font-semibold text-white dark:text-gray-50">
                  Total: ${formatNumber(selectedTrucksTotal)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTrucks(new Set())}
                  className="text-emerald-100 dark:text-blue-200 hover:bg-white/20 dark:hover:bg-white/10 h-7 px-2"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

