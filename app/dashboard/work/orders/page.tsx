'use client'

// Add AnimatePresence and motion imports
import { motion, AnimatePresence } from 'framer-motion'
// Add Avatar imports
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
// Remove useTheme and Sun/Moon imports since they're now in theme-toggle
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
// Add Triangle to imports
import { ArrowLeft, Plus, Trash2, FileText, Loader2, Edit, Check, X, Copy, Triangle, Download, FileSpreadsheet, History, Receipt, RefreshCw } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { database, storage } from "@/lib/firebase"
import { ref, onValue, update, remove, push, get, query, orderByChild, equalTo, set } from "firebase/database"
import { ref as storageRef, getDownloadURL } from "firebase/storage"
import { toast } from "@/components/ui/use-toast"
import { AddWorkDialog } from "@/components/ui/molecules/add-work-dialog"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx' // Add this import for Excel export
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { syncTruckPaymentStatus } from "@/lib/payment-utils";
import { cn } from '@/lib/utils'

// Add new interfaces
interface Payment {
  id: string;
  amountPaid: number;
  timestamp: string;
  allocatedTo?: string[]; // Array of truck IDs this payment is allocated to
  note?: string;
}

interface TruckPayment {
  truckId: string;
  amount: number;
  paymentId: string;
  timestamp: string;
}

interface WorkDetail {
  id: string
  owner: string
  product: string
  truck_number: string
  quantity: string
  status: string
  orderno: string
  depot: string
  destination: string
  loaded?: boolean
  paid?: boolean
  at20?: string
  previous_trucks?: string[]
  price: string;
  createdAt?: string;
  released?: boolean;    // New field to track release status
  paymentPending?: boolean;  // New field to track pending payments
  gatePassGenerated?: boolean; // New field to track gate pass generation
  gatePassGeneratedAt?: string; // New field to track gate pass generation time
}

// Update the SummaryStats interface
interface SummaryStats {
  totalOrders: number;
  queuedOrders: number;
  unqueuedOrders: number;
  agoOrders: number;
  pmsOrders: number;
  loadedOrders: number;
  pendingOrders: number;
  pendingAgoOrders: number;  // Add this
  pendingPmsOrders: number;  // Add this
}

interface OwnerSummary {
  [key: string]: {
    totalOrders: number;
    agoOrders: number;
    pmsOrders: number;
    queuedOrders: number;
    unqueuedOrders: number;
    loadedOrders: number;
    pendingOrders: number;
    products: { [key: string]: number };
    loadedTrucks: WorkDetail[]; 
    pendingTrucks: WorkDetail[];
  }
}

// Add new interfaces
interface PaymentFormData {
  amount: number;
  note: string;
  allocatedTrucks: {
    truckId: string;
    amount: number;
  }[];
  useExistingBalance: boolean;  // Add this field
  balanceToUse: number;
}

// Add balance interface
interface OwnerBalance {
  amount: number;
  lastUpdated: string;
}

interface BalanceUsage {
  amount: number;
  timestamp: string;
  usedFor: string[];
  paymentId: string;
}

// Add animation variants before the component
const tableRowVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 30 }
  }
}

const filterVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { 
    opacity: 1, 
    height: "auto",
    transition: { duration: 0.3 }
  }
}

// Update header height calculation - add this CSS at the top of your file after the imports
const HEADER_HEIGHT = {
  mobile: '7rem', // 112px - accounts for both header rows
  desktop: '4rem'  // 64px - single row header
};

export default function WorkManagementPage() {
  // 1. Declare all hooks at the top level, before any conditional logic
  const { data: session, status } = useSession()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [workDetails, setWorkDetails] = useState<WorkDetail[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    totalOrders: 0,
    queuedOrders: 0,
    unqueuedOrders: 0,
    agoOrders: 0,
    pmsOrders: 0,
    loadedOrders: 0,
    pendingOrders: 0,
    pendingAgoOrders: 0,  // Add this
    pendingPmsOrders: 0  // Add this
  })
  const [ownerSummary, setOwnerSummary] = useState<OwnerSummary>({})
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState("")
  const [productFilter, setProductFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [depotFilter, setDepotFilter] = useState("")
  const [destinationFilter, setDestinationFilter] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)

  // Add new state
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null)
  const [ownerModalOpen, setOwnerModalOpen] = useState(false)
  const [ownerPayments, setOwnerPayments] = useState<any[]>([])
  const [selectedTruckForPayment, setSelectedTruckForPayment] = useState<string | null>(null)
  const [truckPayments, setTruckPayments] = useState<{ [truckId: string]: TruckPayment[] }>({})
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentFormData, setPaymentFormData] = useState<PaymentFormData>({
    amount: 0,
    note: '',
    allocatedTrucks: [],
    useExistingBalance: false,
    balanceToUse: 0
  })

  // Add new state
  const [showTruckHistory, setShowTruckHistory] = useState(false)
  const [selectedTruckHistory, setSelectedTruckHistory] = useState<WorkDetail | null>(null)

  // Add state for owner balances
  const [ownerBalances, setOwnerBalances] = useState<{[owner: string]: OwnerBalance}>({});

  // Add new state
  const [balanceUsageHistory, setBalanceUsageHistory] = useState<{[owner: string]: BalanceUsage[]}>({});

  // Add to existing state declarations
  const [profileClickCount, setProfileClickCount] = useState(0);
  const [showUnloadedGP, setShowUnloadedGP] = useState(false);

  // Add new state for hiding completed orders
  const [showCompleted, setShowCompleted] = useState(false);
  const [titleClickCount, setTitleClickCount] = useState(0);

  // Add new state
  const [showUnpaidSummary, setShowUnpaidSummary] = useState(false);

  // Add click handler for the title
  const handleTitleClick = () => {
    const newCount = titleClickCount + 1;
    if (newCount === 3) {
      setShowCompleted(!showCompleted);
      setTitleClickCount(0);
      toast({
        title: showCompleted ? "Showing Active Orders Only" : "Showing All Orders",
        description: showCompleted ? "Triple click title to show all orders" : "Triple click title to hide completed orders",
      });
    } else {
      setTitleClickCount(newCount);
    }
  };

  // 2. Define functions before useEffect hooks
  const updateSummaryData = (data: WorkDetail[]) => {
    const stats: SummaryStats = {
      totalOrders: 0,
      queuedOrders: 0,
      unqueuedOrders: 0,
      agoOrders: 0,
      pmsOrders: 0,
      loadedOrders: 0,
      pendingOrders: 0,
      pendingAgoOrders: 0,  // Add this
      pendingPmsOrders: 0  // Add this
    };
    
    const ownerSummaryData: OwnerSummary = {};

    data.forEach(detail => {
      stats.totalOrders++;
      
      if (detail.loaded) stats.loadedOrders++;
      if (detail.status === "queued" && !detail.loaded) stats.pendingOrders++;
      if (detail.product.trim().toUpperCase() === "AGO") stats.agoOrders++;
      if (detail.product.trim().toUpperCase() === "PMS") stats.pmsOrders++;
      
      // Update status counting logic
      if (detail.status === "queued") stats.queuedOrders++;
      else if (detail.status === "completed") stats.queuedOrders++; // Count completed as queued
      else stats.unqueuedOrders++;

      // Add pending product counts
      if (detail.status === "queued" && !detail.loaded) {
        if (detail.product.trim().toUpperCase() === "AGO") stats.pendingAgoOrders++;
        if (detail.product.trim().toUpperCase() === "PMS") stats.pendingPmsOrders++;
      }

      // Update owner summary with the same logic
      if (!ownerSummaryData[detail.owner]) {
        ownerSummaryData[detail.owner] = {
          totalOrders: 1,
          agoOrders: detail.product.trim().toUpperCase() === "AGO" ? 1 : 0,
          pmsOrders: detail.product.trim().toUpperCase() === "PMS" ? 1 : 0,
          queuedOrders: (detail.status === "queued" || detail.status === "completed") ? 1 : 0,
          unqueuedOrders: (detail.status !== "queued" && detail.status !== "completed") ? 1 : 0,
          loadedOrders: detail.loaded ? 1 : 0,
          pendingOrders: detail.status === "queued" && !detail.loaded ? 1 : 0,
          products: { [detail.product]: 1 },
          loadedTrucks: detail.loaded ? [detail] : [],
          pendingTrucks: detail.status === "queued" && !detail.loaded ? [detail] : []
        };
      } else {
        const ownerData = ownerSummaryData[detail.owner];
        ownerData.totalOrders++;
        if (detail.product.trim().toUpperCase() === "AGO") ownerData.agoOrders++;
        if (detail.product.trim().toUpperCase() === "PMS") ownerData.pmsOrders++;
        if (detail.status === "queued" || detail.status === "completed") ownerData.queuedOrders++;
        else ownerData.unqueuedOrders++;
        if (detail.loaded) {
          ownerData.loadedOrders++;
          ownerData.loadedTrucks.push(detail);
        }
        if (detail.status === "queued" && !detail.loaded) {
          ownerData.pendingOrders++;
          ownerData.pendingTrucks.push(detail);
        }
      }
    });

    setSummaryStats(stats);
    setOwnerSummary(ownerSummaryData);
  };

  const handleStatusChange = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "queued" ? "not queued" : "queued"
      await update(ref(database, `work_details/${id}`), { status: newStatus })
      toast({
        title: "Status Updated",
        description: `Status changed to ${newStatus}`,
      })
    } catch (error: unknown) {
      console.error('Error updating loaded status:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update status",
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this record?")) {
      try {
        await remove(ref(database, `work_details/${id}`))
        toast({
          title: "Deleted",
          description: "Record deleted successfully",
        })
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete record",
        })
      }
    }
  }

  const handleTruckNumberChange = async (id: string, newTruckNumber: string, oldTruckNumber: string) => {
    if (editingTruckId !== id) return;

    try {
      const workDetail = workDetails.find(detail => detail.id === id);
      if (workDetail && !workDetail.loaded) {
        const previous_trucks = workDetail.previous_trucks || [];
        const shouldUpdate = window.confirm("Save changes to truck number?");
        
        if (shouldUpdate) {
          previous_trucks.push(oldTruckNumber);
          await update(ref(database, `work_details/${id}`), {
            truck_number: newTruckNumber,
            previous_trucks
          });
          setEditingTruckId(null);
          toast({
            title: "Updated",
            description: "Truck number updated successfully",
          });
        }
      }
    } catch (error) {
      console.error('Error updating truck number:', error);
      toast({
        title: "Error",
        description: "Failed to update truck number: " + (error instanceof Error ? error.message : 'Unknown error'),
      });
    }
  };

  const handleLoadedStatus = async (id: string) => {
    try {
      const workDetail = workDetails.find(detail => detail.id === id);
      if (workDetail && !workDetail.loaded) {
        const at20 = prompt("Please enter at20 before marking as loaded");
        if (at20) {
          await update(ref(database, `work_details/${id}`), {
            loaded: true,
            at20
          });
          
          toast({
            title: "Updated",
            description: "Order marked as loaded",
          });

          // Check if destination is non-local and redirect to entries
          if (!workDetail.destination.toLowerCase().includes('local')) {
            const params = new URLSearchParams({
              truckNumber: workDetail.truck_number,
              product: workDetail.product,
              destination: workDetail.destination,
              // Multiply at20 by 1000 for the entries page
              at20Quantity: (parseFloat(at20) * 1000).toString()
            });
            router.push(`/dashboard/work/entries?${params.toString()}`);
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update loaded status",
      });
    }
  };

  // Modify handlePaidStatus to update the payment allocation
  const handlePaidStatus = async (id: string) => {
    try {
      const workDetail = workDetails.find(detail => detail.id === id);
      if (workDetail && workDetail.loaded && !workDetail.paid) {
        const amount = prompt("Please enter the payment amount");
        if (amount && !isNaN(parseFloat(amount))) {
          const paymentRef = push(ref(database, `payments/${workDetail.owner}`));
          const paymentData = {
            amountPaid: parseFloat(amount),
            timestamp: new Date().toISOString(),
            allocatedTo: [id],
            note: "Direct payment from table"
          };

          await Promise.all([
            // Update work detail
            update(ref(database, `work_details/${id}`), {
              paid: true,
              amountPaid: parseFloat(amount)
            }),
            // Add payment record
            set(paymentRef, paymentData),
            // Add truck payment allocation
            set(ref(database, `truckPayments/${id}/${paymentRef.key}`), {
              amount: parseFloat(amount),
              timestamp: paymentData.timestamp,
              note: paymentData.note
            })
          ]);

          toast({
            title: "Updated",
            description: "Payment recorded and allocated successfully",
          });
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update payment status",
      });
    }
  };

  interface WorkFormData {
    owner: string;
    product: string;
    truck_number: string;
    quantity: string;
    status: string;
    orderno: string;
    depot: string;
    destination: string;
    price: string;
  }

  const handleAddNew = async (formData: WorkFormData): Promise<{ success: boolean; id: string }> => {
    try {
      // Check for duplicate order number
      const orderRef = ref(database, 'work_details')
      const orderSnapshot = await get(query(
        orderRef, 
        orderByChild('orderno'), 
        equalTo(formData.orderno)
      ))

      if (orderSnapshot.exists()) {
        const existingOrder = Object.values(orderSnapshot.val())[0] as WorkDetail
        toast({
          title: "Duplicate Order Number",
          description: `Order number ${formData.orderno} is already used by truck ${existingOrder.truck_number}`,
        })
        return { success: false, id: '' }
      }

      // Check stock availability
      const stockRef = ref(database, `stocks/${formData.product.toLowerCase()}`)
      const stockSnapshot = await get(stockRef)
      const currentStock = stockSnapshot.val()?.quantity || 0
      const requestedQuantity = parseFloat(formData.quantity)
      
      if (currentStock < requestedQuantity) {
        toast({
          title: "Insufficient Stock",
          description: `Available ${formData.product}: ${currentStock.toLocaleString()} litres. Requested: ${requestedQuantity.toLocaleString()} litres`,
        })
        return { success: false, id: '' }
      }

      // Create new work detail reference
      const newWorkDetailRef = push(ref(database, 'work_details'))
      
      const workDetailData = {
        owner: formData.owner,
        product: formData.product,
        truck_number: formData.truck_number,
        quantity: parseFloat(formData.quantity),
        status: formData.status,
        orderno: formData.orderno,
        depot: formData.depot,
        destination: formData.destination,
        price: parseFloat(formData.price),
        loaded: false,
        paid: false,
        previous_trucks: [],
        createdAt: new Date().toISOString(),
        id: newWorkDetailRef.key
      }

      // Save work detail
      await set(newWorkDetailRef, workDetailData)

      // Update stock
      await update(ref(database, `stocks/${formData.product.toLowerCase()}`), {
        quantity: currentStock - parseFloat(formData.quantity)
      })

      // Set the last added ID to trigger the highlight effect
      setLastAddedId(newWorkDetailRef.key)
      
      // Reset the highlight after 3 blinks (1.5 seconds)
      setTimeout(() => {
        setLastAddedId(null)
      }, 1500)

      toast({
        title: "Success",
        description: "Work detail added successfully",
      })
      
      return { success: true, id: newWorkDetailRef.key! }

    } catch (error) {
      console.error('Save error:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save work detail",
      })
      return { success: false, id: '' }
    }
  }

  const handleCopySummary = () => {
    let summaryText = `Summary:\n` +
      `1. Total Orders: ${summaryStats.totalOrders}\n` +
      `2. Queued Orders: ${summaryStats.queuedOrders}\n` +
      `3. Unqueued Orders: ${summaryStats.unqueuedOrders}\n` +
      `4. Loaded Orders: ${summaryStats.loadedOrders}\n` +
      `5. Pending Orders: ${summaryStats.pendingOrders}\n` +
      `6. AGO Orders: ${summaryStats.agoOrders}\n` +
      `7. PMS Orders: ${summaryStats.pmsOrders}\n\n` +
      `Owner Summary:\n`;

    Object.entries(ownerSummary).forEach(([owner, data], index) => {
      summaryText += `${index + 1}. ${owner}:\n` +
        `   a. Total Orders: ${data.totalOrders}\n` +
        `   b. Queued Orders: ${data.queuedOrders}\n` +
        `   c. Loaded Orders: ${data.loadedOrders}\n` +
        `   d. Pending Orders: ${data.pendingOrders}\n` +
        `   e. AGO Orders: ${data.agoOrders}\n` +
        `   f. PMS Orders: ${data.pmsOrders}\n` +
        `   g. Loaded Trucks:\n`;

      data.loadedTrucks.forEach((truck, truckIndex) => {
        summaryText += `      ${truckIndex + 1}. Truck Number: ${truck.truck_number}, Quantity: ${truck.quantity}, Product: ${truck.product}, Loaded: Yes\n`;
      });

      summaryText += `   h. Pending Trucks:\n`;

      data.pendingTrucks.forEach((truck, truckIndex) => {
        summaryText += `      ${truckIndex + 1}. Truck Number: ${truck.truck_number}, Quantity: ${truck.quantity}, Product: ${truck.product}, Loaded: No\n`;
      });

      summaryText += `\n`;
    });

    navigator.clipboard.writeText(summaryText)
      .then(() => {
        toast({
          title: "Copied",
          description: "Summary copied to clipboard",
        });
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to copy summary",
        });
      });
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4',
    })

    // Add Title
    doc.setFontSize(18)
    doc.text('Work Orders Summary', 40, 40)

    // Add Work Orders Table closer to the title
    autoTable(doc, {
      startY: 60, // Reduced from 300 to 60
      head: [
        ['Owner', 'Product', 'Truck Number', 'Quantity', 'Status', 'Order No', 'Depot', 'Destination'],
      ],
      body: getFilteredWorkDetails().map(detail => [
        detail.owner,
        detail.product,
        detail.truck_number,
        detail.quantity.toString(),
        detail.status,
        detail.orderno,
        detail.depot,
        detail.destination,
      ]),
      theme: 'grid',
      styles: { fontSize: 10 },
      headStyles: { fillColor: [52, 152, 219] },
      margin: { top: 60, left: 40, right: 40 }, // Updated margin.top
      pageBreak: 'auto',
    })

    // Move Summary immediately after the table without large gaps
    doc.text('Summary:', 40, (doc as any).autoTable.previous.finalY + 20)
    doc.text('Summary:', 40, (doc as any).autoTable.previous.finalY + 20)
    const summaryLines = [
      `Total Orders: ${summaryStats.totalOrders}`,
      `Queued Orders: ${summaryStats.queuedOrders}`,
      `Unqueued Orders: ${summaryStats.unqueuedOrders}`,
      `Loaded Orders: ${summaryStats.loadedOrders}`,
      `Pending Orders: ${summaryStats.pendingOrders}`,
      `AGO Orders: ${summaryStats.agoOrders}`,
      `PMS Orders: ${summaryStats.pmsOrders}`,
    ]
    doc.text(summaryLines, 40, (doc as any).autoTable.previous.finalY + 40)
    doc.text(summaryLines, 40, (doc as any).autoTable.previous.finalY + 40)
    // Save the PDF
    doc.save('Work_Orders_Summary.pdf')
  }

  // Add new function to handle owner info click
  const handleOwnerInfo = (owner: string) => {
    router.push(`/dashboard/work/${encodeURIComponent(owner)}`);
  }

  // Add new function to handle payment
  const handleAddPayment = (owner: string) => {
    setPaymentFormData({
      amount: 0,
      note: '',
      allocatedTrucks: [],
      useExistingBalance: false,
      balanceToUse: 0
    });
    setSelectedOwner(owner);
    setIsPaymentModalOpen(true);
  };


  // Update handlePaymentSubmit to handle balance-only payments
const handlePaymentSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedOwner) return;

  try {
    const paymentRef = push(ref(database, `payments/${selectedOwner}`));
    const paymentKey = paymentRef.key!;
    const timestamp = new Date().toISOString();
    const updates: { [path: string]: any } = {};

    // Calculate total allocation amount
    const totalAllocation = toFixed2(
      paymentFormData.allocatedTrucks.reduce((sum, t) => sum + t.amount, 0)
    );

    // Validate total allocation against available funds
    const totalAvailable = toFixed2(
      paymentFormData.amount + 
      (paymentFormData.useExistingBalance ? paymentFormData.balanceToUse : 0)
    );

    if (totalAllocation > totalAvailable) {
      toast({
        title: "Error",
        description: "Total allocation exceeds available funds",
      });
      return;
    }

    // Create payment record if there's a new payment amount
    if (paymentFormData.amount > 0) {
      updates[`payments/${selectedOwner}/${paymentKey}`] = {
        amountPaid: paymentFormData.amount,
        timestamp,
        allocatedTrucks: paymentFormData.allocatedTrucks,
        note: paymentFormData.note
      };
    }

    // Handle balance usage
    if (paymentFormData.useExistingBalance && paymentFormData.balanceToUse > 0) {
      const balanceUsageRef = push(ref(database, `balance_usage/${selectedOwner}`));
      updates[`balance_usage/${selectedOwner}/${balanceUsageRef.key}`] = {
        amount: paymentFormData.balanceToUse,
        timestamp,
        usedFor: paymentFormData.allocatedTrucks.map(t => t.truckId),
        paymentId: paymentKey
      };

      // Update owner balance
      const currentBalance = ownerBalances[selectedOwner]?.amount || 0;
      updates[`owner_balances/${selectedOwner}`] = {
        amount: currentBalance - paymentFormData.balanceToUse,
        lastUpdated: timestamp
      };
    }

    // Process truck payment records
    paymentFormData.allocatedTrucks.forEach(allocation => {
      updates[`truckPayments/${allocation.truckId}/${paymentKey}`] = {
        amount: allocation.amount,
        timestamp,
        note: paymentFormData.note
      };

      // Update truck payment status
      const truck = workDetails.find(t => t.id === allocation.truckId);
      if (truck && truck.at20) {
        const { totalAllocated, totalDue } = getTruckAllocations(truck);
        if (totalAllocated + allocation.amount >= totalDue) {
          updates[`work_details/${allocation.truckId}/paid`] = true;
          updates[`work_details/${allocation.truckId}/paymentPending`] = false;
        }
      }
    });

    // Apply all updates
    await update(ref(database), updates);

    // Refresh data
    await Promise.all([
      fetchOwnerBalances(),
      fetchBalanceUsageHistory(selectedOwner)
    ]);

    toast({
      title: "Success",
      description: "Payment processed successfully",
    });
    setIsPaymentModalOpen(false);
    handleOwnerInfo(selectedOwner);
  } catch (error) {
    toast({
      title: "Error",
      description: "Failed to process payment",
    });
  }
};

  // Add new helper function for number formatting
  const formatNumber = (num: number) => {
    return Number(num.toFixed(2)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Add function to calculate owner totals
  // Update the calculateOwnerTotals function to include pending amounts
const calculateOwnerTotals = (owner: string | null) => {
  if (!owner) return {
    totalToBePaid: 0,
    totalPaid: 0,
    balance: 0,
    existingBalance: 0,
    pendingTotal: 0
  };

  const trucks = ownerSummary[owner]?.loadedTrucks || [];
  
  // Calculate total amounts including pending
  const totalAmounts = trucks.reduce((sum, truck) => {
    const { totalDue, totalAllocated, pendingAmount } = getTruckAllocations(truck);
    return {
      totalDue: sum.totalDue + totalDue,
      totalPending: sum.totalPending + (pendingAmount || 0),
      totalAllocated: sum.totalAllocated + totalAllocated
    };
  }, { totalDue: 0, totalPending: 0, totalAllocated: 0 });

  const totalToBePaid = totalAmounts.totalDue; // All amounts that need to be paid
  const totalPaid = totalAmounts.totalAllocated; // Actually paid amounts
  const existingBalance = ownerBalances[owner]?.amount || 0;
  
  // Calculate final balance including pending amounts
  const balance = totalToBePaid - totalPaid - existingBalance;
  const pendingTotal = totalAmounts.totalPending;

  return { 
    totalToBePaid,
    totalPaid,
    balance,
    existingBalance,
    pendingTotal
  };
};

  // Add new helper function to check payment allocation
  const isTruckPaymentAllocated = (truckId: string) => {
    if (!truckPayments[truckId]) return false;
    const payments = Object.values(truckPayments[truckId]);
    const totalAllocated = payments.reduce((sum, p) => sum + p.amount, 0);
    const truck = workDetails.find(t => t.id === truckId);
    if (!truck || !truck.at20) return false;
    const totalDue = parseFloat(truck.price) * parseFloat(truck.at20);
    return totalAllocated >= totalDue;
  };

  // Add new function to handle force release
  const handleForceRelease = async (detail: WorkDetail) => {
    if (!detail.loaded) return;

    const shouldForceRelease = confirm(
      'Are you sure you want to release this truck without payment? Payment will be marked as pending.'
    );

    if (shouldForceRelease) {
      try {
        await update(ref(database, `work_details/${detail.id}`), {
          released: true,
          paymentPending: true,
          paid: false
        });

        toast({
          title: "Truck Released",
          description: "Truck has been released with payment pending",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to release truck",
        });
      }
    }
  };

  // Add new function to handle export to Excel
  const handleExportToExcel = () => {
    const data = getFilteredWorkDetails().map(detail => ({
      Owner: detail.owner,
      Product: detail.product,
      'Truck Number': detail.truck_number,
      Quantity: detail.quantity,
      Status: detail.status,
      'Order No': detail.orderno,
      Depot: detail.depot,
      Destination: detail.destination,
      Loaded: detail.loaded ? 'Yes' : 'No',
      'Payment Status': detail.paymentPending ? 'Pending' : detail.paid ? 'Paid' : 'Not Paid'
    }))
  
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Work Orders')
    XLSX.writeFile(wb, `Work_Orders_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // Add new function to generate payment receipt
  const generatePaymentReceipt = (owner: string) => {
    const doc = new jsPDF()
    const ownerData = ownerSummary[owner]
    const { totalToBePaid, totalPaid, balance } = calculateOwnerTotals(owner)
    
    // Add company header
    doc.setFontSize(20)
    doc.text('Owner Payment Summary', 105, 20, { align: 'center' })
    
    // Add owner details
    doc.setFontSize(12)
    doc.text([`Owner: ${owner}`, `Date: ${new Date().toLocaleDateString()}`, `Total Orders: ${ownerData.totalOrders}`, '\nPayment Summary:', `Total Amount Due: $${formatNumber(totalToBePaid)}`, `Total Amount Paid: $${formatNumber(totalPaid)}`, `Balance: $${formatNumber(Math.abs(balance))} ${balance < 0 ? '(Credit)' : '(Due)'}`, ], 20, 40)
  
    let yPos = 100
  
    // Add loaded trucks table
    if (ownerData.loadedTrucks.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Truck', 'Product', 'Quantity', 'At20', 'Price', 'Total Due', 'Status']],
        body: ownerData.loadedTrucks.map(truck => {
          const { totalDue, totalAllocated, balance } = getTruckAllocations(truck)
          return [truck.truck_number, truck.product, truck.quantity, truck.at20 || '-', `$${formatNumber(parseFloat(truck.price))}`, `$${formatNumber(totalDue)}`, balance <= 0 ? 'Paid' : truck.paymentPending ? 'Payment Pending' : `Due: $${formatNumber(balance)}`]
        }),
        theme: 'grid',
        headStyles: { fillColor: [40, 167, 69] },
        styles: { fontSize: 8 },
        margin: { left: 20, right: 20 }
      })
      yPos = (doc as any).autoTable.previous.finalY + 20
    }
  
    // Add payment history table
    if (ownerPayments.length > 0) {
      doc.text('Payment History:', 20, yPos)
      yPos += 10
  
      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Amount', 'Allocated Trucks', 'Note']],
        body: ownerPayments.map(payment => {
          const allocatedTrucks = payment.allocatedTrucks?.map((allocation: any) => {
            const truck = workDetails.find(t => t.id === allocation.truckId)
            return truck ? `${truck.truck_number} ($${formatNumber(allocation.amount)})` : ''
  
          }).filter(Boolean).join(', ') || 'Unallocated'
  
          return [new Date(payment.timestamp).toLocaleDateString(), `$${formatNumber(payment.amountPaid)}`, allocatedTrucks, payment.note || '-']
        }),
        theme: 'grid',
        headStyles: { fillColor: [40, 167, 69] },
        styles: { fontSize: 8 },
        margin: { left: 20, right: 20 }
      })
    }
  
    // Add summary statistics
    doc.text(['\nOrder Statistics:', `AGO Orders: ${ownerData.agoOrders}`, `PMS Orders: ${ownerData.pmsOrders}`, `Queued Orders: ${ownerData.queuedOrders}`, `Loaded Orders: ${ownerData.loadedOrders}`, `Pending Orders: ${ownerData.pendingOrders}`, ], 20, (doc as any).autoTable.previous.finalY + 20)
  
    // Add footer
    doc.setFontSize(8)
    doc.text(['This is a computer-generated document.', `Generated on: ${new Date().toLocaleString()}`], 20, doc.internal.pageSize.height - 20)
  
    // Save the PDF
    doc.save(`${owner}_Payment_Summary_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  // Add function to fetch balance usage history
  const fetchBalanceUsageHistory = async (owner: string) => {
    const historyRef = ref(database, `balance_usage/${owner}`);
    const snapshot = await get(historyRef);
    if (snapshot.exists()) {
      setBalanceUsageHistory(prev => ({
        ...prev,
        [owner]: Object.values(snapshot.val())
      }));
    }
  };

  // 3. Group all useEffect hooks together
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    const workDetailsRef = ref(database, 'work_details')
    const unsubscribe = onValue(workDetailsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const details = Object.entries(data).map(([id, detail]: [string, any]) => ({
          id,
          ...detail
        }))
        setWorkDetails(details)
        updateSummaryData(details)
      }
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchImageUrl = async () => {
      if (!session?.user?.email || session?.user?.image) return
  
      try {
        const filename = `${session.user.email}.jpg`
        const imageRef = storageRef(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        console.log('Profile image not found:', error)
      }
    }
  
    fetchImageUrl()
  }, [session?.user])

  // Add useEffect to fetch truck payments
  useEffect(() => {
    const truckPaymentsRef = ref(database, 'truckPayments');
    const unsubscribe = onValue(truckPaymentsRef, (snapshot) => {
      if (snapshot.exists()) {
        setTruckPayments(snapshot.val());
      }
    });

    return () => unsubscribe();
  }, []);

  // Inside the component, add this new useEffect
  useEffect(() => {
    // Monitor payments and update work details
    const paymentsRef = ref(database, 'truckPayments');
    const unsubscribe = onValue(paymentsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const payments = snapshot.val();
        // Update work details that have payments
        const updates: { [key: string]: any } = {};
        
        Object.keys(payments).forEach((truckId) => {
          const truckPayments = Object.values(payments[truckId]) as TruckPayment[];
          const totalPaid = truckPayments.reduce((sum, payment) => sum + payment.amount, 0);
          const workDetail = workDetails.find(w => w.id === truckId);
          
          if (workDetail && workDetail.at20) {
            const totalDue = parseFloat(workDetail.price) * parseFloat(workDetail.at20);
            updates[`work_details/${truckId}/paid`] = totalPaid >= totalDue;
            updates[`work_details/${truckId}/paymentPending`] = totalPaid < totalDue;
          }
        });

        if (Object.keys(updates).length > 0) {
          await update(ref(database), updates);
        }
      }
    });

    return () => unsubscribe();
  }, [workDetails]);

  // Add function to fetch owner balances
  const fetchOwnerBalances = async () => {
    const balancesRef = ref(database, 'owner_balances');
    const snapshot = await get(balancesRef);
    if (snapshot.exists()) {
      setOwnerBalances(snapshot.val());
    }
  };

  // Update useEffect to fetch balances
  useEffect(() => {
    // ...existing code for work details...
    
    // Add balance fetching
    fetchOwnerBalances();
  }, []);

  // Add a useEffect to handle toast notifications
  useEffect(() => {
    if (showUnloadedGP) {
      toast({
        title: "Developer Mode",
        description: "Unloaded Gate Pass enabled",
        variant: "default"
      });
    }
  }, [showUnloadedGP]);

  // 4. Early return after hooks
  if (!mounted) {
    return null
  }

  const getSortedWorkDetails = () => {
    return [...workDetails].sort((a, b) => {
      // Sort by owner name alphabetically
      return a.owner.toLowerCase().localeCompare(b.owner.toLowerCase())
    })
  }

  // Modify getFilteredWorkDetails to include the completed filter
const getFilteredWorkDetails = () => {
  return getSortedWorkDetails().filter(detail => {
    // First check if we should show this completed order
    if (!showCompleted && detail.released) {
      return false;
    }

    const matchesOwner = ownerFilter ? detail.owner.toLowerCase().includes(ownerFilter.toLowerCase()) : true;
    const matchesProduct = productFilter !== "ALL" ? detail.product === productFilter : true;
    const matchesStatus = statusFilter !== "ALL" ? detail.status === statusFilter : true;
    const matchesDepot = depotFilter ? detail.depot.toLowerCase().includes(depotFilter.toLowerCase()) : true;
    const matchesDestination = destinationFilter ? detail.destination.toLowerCase().includes(destinationFilter.toLowerCase()) : true;
    const matchesSearch = searchTerm
      ? detail.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
        detail.truck_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        detail.orderno.toLowerCase().includes(searchTerm.toLowerCase()) ||
        detail.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
        detail.destination.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchesOwner && matchesProduct && matchesStatus && matchesDepot && matchesDestination && matchesSearch;
  });
};

  // Update handleGenerateGatePass to show warning for unloaded trucks
const handleGenerateGatePass = async (detail: WorkDetail) => {
  let shouldProceed = true;

  if (detail.gatePassGenerated) {
    shouldProceed = window.confirm(
      "⚠️ WARNING: Gate pass has already been generated!\n\n" +
      "This should only be done in special circumstances.\n" +
      "Are you sure you want to continue?"
    );
  }
  
  if (!shouldProceed) return;
  
  const updates: { [key: string]: any } = {
    [`work_details/${detail.id}/gatePassGenerated`]: true,
    [`work_details/${detail.id}/gatePassGeneratedAt`]: detail.gatePassGenerated 
      ? detail.gatePassGeneratedAt 
      : new Date().toISOString()
  };
  
  await update(ref(database), updates);
  
  const params = new URLSearchParams({
    orderNo: detail.orderno,
    destination: detail.destination,
    truck: detail.truck_number,
    product: detail.product,
    quantity: detail.quantity.toString(),
    at20: detail.at20 || '',
    isLoaded: detail.loaded ? 'true' : 'false'
  });
  
  router.push(`/dashboard/work/orders/gate-pass?${params.toString()}`);
};

// Add new function to handle profile click
const handleProfileClick = () => {
  const newCount = profileClickCount + 1;
  if (newCount === 3) {
    setProfileClickCount(0);
    setShowUnloadedGP(true);
    // Move toast to useEffect
    setTimeout(() => {
      toast({
        title: "Developer Mode",
        description: "Unloaded Gate Pass enabled",
        variant: "default"
      });
    }, 0);
  } else {
    setProfileClickCount(newCount);
  }
};

// Modify the helper function for decimal precision
const toFixed2 = (num: number) => Number(Math.round(num * 100) / 100);

// Update the calculateOptimalAllocation function to handle exact amounts
const calculateOptimalAllocation = (
  totalAmount: number,
  trucks: WorkDetail[],
  truckPayments: { [truckId: string]: TruckPayment[] },
  balanceAmount: number = 0  // Add parameter for balance amount
) => {
  const owner = trucks[0]?.owner;
  const totalAvailable = toFixed2(totalAmount + balanceAmount);
  const allocations: { truckId: string; amount: number }[] = [];

  // Sort trucks by creation date and balance
  const trucksWithBalances = trucks
    .map(truck => {
      const { balance } = getTruckAllocations(truck);
      return {
        truck,
        balance: toFixed2(balance),
        createdAt: truck.createdAt || ''
      };
    })
    .sort((a, b) => {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      return b.balance - a.balance;
    })
    .filter(({ balance }) => balance > 0); // Only include trucks with outstanding balance

  let remainingAmount = totalAvailable;

  // Allocate available amount across trucks
  for (const { truck, balance } of trucksWithBalances) {
    if (remainingAmount <= 0) break;

    const allocation = Math.min(balance, remainingAmount);
    if (allocation > 0) {
      allocations.push({
        truckId: truck.id,
        amount: toFixed2(allocation)
      });
      remainingAmount = toFixed2(remainingAmount - allocation);
    }
  }

  return allocations;
};

// Update the getTruckAllocations helper to use precise calculations
const getTruckAllocations = (truck: WorkDetail) => {
  // Get actual payments
  const payments = truckPayments[truck.id] ? Object.values(truckPayments[truck.id]) : [];
  const totalAllocated = toFixed2(payments.reduce((sum, p) => sum + p.amount, 0));
  
  // Calculate total due
  const totalDue = truck.at20 
    ? toFixed2(parseFloat(truck.price) * parseFloat(truck.at20))
    : 0;
  
  // Calculate balance
  const balance = toFixed2(totalDue - totalAllocated);
  
  // A truck should only be marked as pending if it has an outstanding balance
  // and is specifically marked as paymentPending
  const pendingAmount = (balance > 0 && truck.paymentPending) ? balance : 0;
  
  return {
    totalAllocated,
    totalDue,
    balance,
    pendingAmount
  };
};

// Update the payment input handler to use precise calculations
const handlePaymentInputChange = (e: React.ChangeEvent<HTMLInputElement>, truckId: string) => {
  const newAmount = toFixed2(parseFloat(e.target.value));
  const truck = ownerSummary[selectedOwner!].loadedTrucks.find(t => t.id === truckId);
  
  if (!truck) return;

  const { balance: outstandingBalance } = getTruckAllocations(truck);
  const otherAllocations = toFixed2(
    paymentFormData.allocatedTrucks
      .filter(t => t.truckId !== truckId)
      .reduce((sum, t) => sum + t.amount, 0)
  );
  
  const remainingPayment = toFixed2(paymentFormData.amount - otherAllocations);
  const maxAllowed = Math.min(
    remainingPayment,
    toFixed2(outstandingBalance)
  );

  if (newAmount >= 0 && newAmount <= maxAllowed) {
    setPaymentFormData(prev => ({
      ...prev,
      allocatedTrucks: prev.allocatedTrucks.map(t =>
        t.truckId === truckId
          ? { ...t, amount: newAmount }
          : t
      )
    }));
  }
};

// Update the truck selection handler
const handleTruckSelection = (checked: boolean, truck: WorkDetail) => {
  if (checked) {
    const currentAllocated = toFixed2(
      paymentFormData.allocatedTrucks.reduce((sum, t) => sum + t.amount, 0)
    );
    
    const remainingAmount = toFixed2(paymentFormData.amount - currentAllocated);
    const { balance: outstandingBalance } = getTruckAllocations(truck);
    
    // Calculate optimal amount with precise decimal handling
    const optimalAmount = toFixed2(Math.min(outstandingBalance, remainingAmount));

    setPaymentFormData(prev => ({
      ...prev,
      allocatedTrucks: [
        ...prev.allocatedTrucks,
        { truckId: truck.id, amount: optimalAmount }
      ]
    }));
  } else {
    setPaymentFormData(prev => ({
      ...prev,
      allocatedTrucks: prev.allocatedTrucks.filter(t => t.truckId !== truck.id)
    }));
  }
};

// Update the calculateRemainingAmount helper
const calculateRemainingAmount = (totalAmount: number, allocations: { truckId: string, amount: number }[]) => {
  const totalAllocated = toFixed2(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  return toFixed2(totalAmount - totalAllocated);
};

// Update the balance checkbox handler
const handleBalanceUseChange = (checked: boolean) => {
  if (!selectedOwner) return;
  
  const isChecked = checked as boolean;
  const availableBalance = ownerBalances[selectedOwner]?.amount || 0;
  
  setPaymentFormData(prev => ({
    ...prev,
    useExistingBalance: isChecked,
    // When checked, add balance to amount field instead of separate balance field
    amount: isChecked ? (prev.amount + availableBalance) : (prev.amount - (prev.balanceToUse || 0)),
    balanceToUse: isChecked ? availableBalance : 0,
    allocatedTrucks: [] // Reset allocations when changing balance use
  }));
};

  // Add this function to your component
const handleSyncStatus = async (truck: WorkDetail) => {
  try {
    const updates = await syncTruckPaymentStatus(database, truck, truckPayments);
    await update(ref(database), updates);
    
    toast({
      title: "Status Synced",
      description: `Payment status synchronized for truck ${truck.truck_number}`,
    });
  } catch (error) {
    console.error('Sync error:', error);
    toast({
      title: "Error",
      description: "Failed to sync payment status",
      variant: "destructive"
    });
  }
};

// Add new helper function
const getUnpaidSummary = () => {
  const summary = workDetails
    .filter(detail => detail.loaded && !detail.paid)
    .reduce((acc, detail) => {
      const owner = detail.owner;
      const { balance } = getTruckAllocations(detail);
      
      if (!acc[owner]) {
        acc[owner] = {
          trucks: [],
          totalAmount: 0,
          agoCount: 0,
          pmsCount: 0
        };
      }
      
      acc[owner].trucks.push({
        truck_number: detail.truck_number,
        amount: balance,
        product: detail.product
      });
      acc[owner].totalAmount += balance;
      if (detail.product === 'AGO') acc[owner].agoCount++;
      if (detail.product === 'PMS') acc[owner].pmsCount++;
      
      return acc;
    }, {} as { [key: string]: { 
      trucks: { truck_number: string; amount: number; product: string }[],
      totalAmount: number,
      agoCount: number,
      pmsCount: number
    }});

  return summary;
};

  return (
    <div className="min-h-screen">
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-2 py-2">
            {/* Main header row */}
            <div className="flex items-center justify-between">
              {/* Left side - essential controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push('/dashboard/work')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 
                  className="text-sm font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none sm:text-base"
                  onClick={handleTitleClick}
                >
                  Work Management
                </h1>
              </div>

              {/* Right side - actions */}
              <div className="flex items-center gap-2">
                {/* Only show on desktop */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnpaidSummary(true)}
                  className="hidden sm:flex text-xs items-center"
                >
                  Unpaid Summary
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsAddModalOpen(true)}
                  className="h-8 w-8"
                >
                  <Plus className="h-4 w-4" />
                </Button>

                <ThemeToggle />
                
                <Avatar 
                  className="h-8 w-8 ring-1 ring-pink-500/50"
                  onClick={handleProfileClick}
                >
                  <AvatarImage 
                    src={session?.user?.image || lastUploadedImage || ''} 
                    alt="Profile"
                  />
                  <AvatarFallback className="text-xs">
                    {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Secondary row for mobile only - shows up below main header */}
            <div className="flex mt-2 sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUnpaidSummary(true)}
                className="text-xs w-full"
              >
                View Unpaid Summary
              </Button>
            </div>
          </div>
        </div>
      </header>

      <style jsx global>{`
        @keyframes highlight {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgb(16 185 129 / 0.2); }
        }
        .highlight-new-record {
          animation: highlight 0.5s ease-in-out 3;
        }
      `}</style>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-28 sm:pt-24 pb-6 sm:pb-8">
        <div className="space-y-4">
          {/* Search and Toggle Filters on the same line */} 
          <div className="flex flex-col items-center sm:flex-row sm:justify-center sm:space-x-4 gap-2 sm:gap-0">
            <Input
              placeholder="Search by owner, truck number, or order number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xl w-full sm:w-1/2"
            />
            <Button
              variant="secondary"
              onClick={() => setShowFilters(prev => !prev)}
              className="w-full sm:w-auto"
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
          </div>

          {/* Conditionally Rendered Filter Controls with reduced sizes */} 
          <AnimatePresence>
            {showFilters && (
              <motion.div
                variants={filterVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 w-full max-w-4xl mx-auto"
              >
                {/* Owner Filter */} 
                <Input
                  placeholder="Filter by Owner"
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                  className="max-w-xs w-full sm:w-auto"
                />
                {/* Product Filter */} 
                <div className="max-w-xs w-full sm:w-auto">
                  <Select
                    value={productFilter}
                    onValueChange={(value) => setProductFilter(value)}
                  >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="AGO">AGO</SelectItem>
                    <SelectItem value="PMS">PMS</SelectItem> {/* Fixed missing closing tag */} 
                  </SelectContent>
                  </Select>
                </div>
                {/* Status Filter */} 
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="not queued">Not Queued</SelectItem>
                  </SelectContent>
                </Select>
                {/* Depot Filter */} 
                <Input
                  placeholder="Filter by Depot"
                  value={depotFilter}
                  onChange={(e) => setDepotFilter(e.target.value)}
                  className="max-w-xs w-full sm:w-auto"
                />
                {/* Destination Filter */} 
                <Input
                  placeholder="Filter by Destination"
                  value={destinationFilter}
                  onChange={(e) => setDestinationFilter(e.target.value)}
                  className="max-w-xs w-full sm:w-auto"
                />
                {/* Clear Filters Button */} 
                <Button
                  variant="outline"
                  onClick={() => {
                    setOwnerFilter("")
                    setProductFilter("ALL")
                    setStatusFilter("ALL")
                    setDepotFilter("")
                    setDestinationFilter("")
                    // Removed setSearchTerm("") to keep the search box intact
                  }}
                  className="max-w-xs w-full sm:w-auto"
                >
                  Clear Filters
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download PDF Button */} 
          <div className="flex justify-end mb-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDownloadPDF}>
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={handleExportToExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>

          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-center items-center h-64"
            >
              <Loader2 className="h-8 w-8 animate-spin" />
            </motion.div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-[800px] p-4 sm:p-0">
                <table className="w-full text-sm sm:text-base">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Owner</th>
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Product</th>
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Truck Number</th>
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Quantity</th>
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Status</th>
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Order No</th>
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Depot</th>
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Destination</th>
                      <th className="p-3 text-left font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Actions</th>
                    </tr>
                  </thead>
                  <AnimatePresence>
                    <tbody>
                      {getFilteredWorkDetails().map((detail, index) => (
                        <motion.tr
                          key={detail.id}
                          variants={tableRowVariants}
                          initial="hidden"
                          animate="visible"
                          transition={{ delay: index * 0.05 }}
                          className={`border-b hover:bg-muted/50 ${
                            detail.loaded ? 'opacity-50 bg-muted/20' : ''
                          } ${
                            detail.id === lastAddedId ? 'highlight-new-record' : ''
                          }`}
                        >
                          <td className="p-2 sm:p-3">{detail.owner}</td>
                          <td className="p-2 sm:p-3">{detail.product}</td>
                          <td className="p-2 sm:p-3">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                              {editingTruckId === detail.id ? (
                                <Input
                                  value={detail.truck_number}
                                  onChange={(e) => handleTruckNumberChange(detail.id, e.target.value, detail.truck_number)}
                                  className="w-32"
                                />
                              ) : (
                                <span>{detail.truck_number}</span>
                              )}
                              {!detail.loaded && (
                                editingTruckId === detail.id ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleTruckNumberChange(detail.id, detail.truck_number, detail.truck_number)}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingTruckId(null)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingTruckId(detail.id)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedTruckHistory(detail)
                                  setShowTruckHistory(true)
                                }}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            </div>
                            {detail.previous_trucks && detail.previous_trucks.length > 0 && (
                              <small className="text-muted-foreground">
                                Previous: {detail.previous_trucks[detail.previous_trucks.length - 1]}
                              </small>
                            )}
                          </td>
                          <td className="p-2 sm:p-3">{detail.quantity}</td>
                          <td className="p-2 sm:p-3">
                            <Button
                              variant={detail.status === "queued" ? "default" : "secondary"}
                              size="sm"
                              className={detail.status === "queued" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                              disabled={detail.loaded}
                              onClick={() => handleStatusChange(detail.id, detail.status)}
                            >
                              {detail.status}
                            </Button>
                          </td>
                          <td className="p-2 sm:p-3">{detail.orderno}</td>
                          <td className="p-2 sm:p-3">{detail.depot}</td>
                          <td className="p-2 sm:p-3">{detail.destination}</td>
                          <td className="p-2 sm:p-3">
                            <div className="flex flex-col sm:flex-row gap-2">
                              {!detail.loaded ? (
                                <div className="flex gap-2">
                                  <Button 
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleLoadedStatus(detail.id)}
                                  >
                                    Loaded?
                                  </Button>
                                  {showUnloadedGP && (
                                    <Button
                                      variant={detail.gatePassGenerated ? "secondary" : "outline"}
                                      size="sm"
                                      onClick={() => handleGenerateGatePass(detail)}
                                      className={cn(
                                        "relative",
                                        detail.gatePassGenerated && "bg-amber-100 hover:bg-amber-200 text-amber-700"
                                      )}
                                    >
                                      {detail.gatePassGenerated ? "BG" : "GP"}
                                      {detail.gatePassGenerated && (
                                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              ) : !detail.released ? (
                                <div className="flex gap-2">
                                  {isTruckPaymentAllocated(detail.id) ? (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={async () => {
                                        if (confirm('Confirm release of truck?')) {
                                          await update(ref(database, `work_details/${detail.id}`), {
                                            released: true,
                                            paid: true,
                                            paymentPending: false
                                          });
                                          toast({
                                            title: "Released",
                                            description: "Truck has been released",
                                          });
                                        }
                                      }}
                                    >
                                      Release
                                    </Button>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          toast({
                                            title: "Payment Required",
                                            description: "Please allocate payment from owner details",
                                          });
                                        }}
                                      >
                                        Payment Required
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700"
                                        onClick={() => handleForceRelease(detail)}
                                      >
                                        <Triangle className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <Button
                                    variant={detail.gatePassGenerated ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => handleGenerateGatePass(detail)}
                                    className={cn(
                                      "relative",
                                      detail.gatePassGenerated && "bg-amber-100 hover:bg-amber-200 text-amber-700"
                                    )}
                                  >
                                    {detail.gatePassGenerated ? "BG" : "GP"}
                                    {detail.gatePassGenerated && (
                                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
                                    )}
                                  </Button>
                                  {detail.paymentPending && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOwnerInfo(detail.owner)}
                                      className="text-red-500"
                                    >
                                      Payment Pending
                                    </Button>
                                  )}
                                </div>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(detail.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSyncStatus(detail)}
                                className="h-6 w-6 p-0"
                                title="Sync payment status"
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </AnimatePresence>
                </table>
              </div>
            </div>
          )}

          <div className="mt-8 space-y-8">
            {/* Summary Stats */}
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              <Card className="p-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold mb-4 bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Summary</h2>
                  <Button variant="ghost" onClick={handleCopySummary}>
                    <Copy className="h-5 w-5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div className="space-y-2">
                    <div>Total Orders: {summaryStats.totalOrders}</div>
                    <div>Queued Orders: {summaryStats.queuedOrders}</div>
                    <div>Unqueued Orders: {summaryStats.unqueuedOrders}</div>
                  </div>
                  <div className="space-y-2">
                    <div>Loaded Orders: {summaryStats.loadedOrders}</div>
                    <div className="flex flex-col">
                      <span>Pending Orders: {summaryStats.pendingOrders}</span>
                      <div className="ml-4 text-sm text-muted-foreground">
                        <div>AGO: {summaryStats.pendingAgoOrders}</div>
                        <div>PMS: {summaryStats.pendingPmsOrders}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>AGO Orders: {summaryStats.agoOrders}</div>
                    <div>PMS Orders: {summaryStats.pmsOrders}</div>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Owner Summary */} 
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.2 }}
            >
              <Card className="p-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold mb-4 bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Owner Summary</h2>
                  <Button variant="ghost" onClick={handleCopySummary}>
                    <Copy className="h-5 w-5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(ownerSummary).map(([owner, data], index) => (
                    <motion.div
                      key={`owner-${owner}`}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="p-4">
                        <div className="flex justify-between items-start">
                          <h3 className="text-lg font-semibold mb-2 bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">{owner}</h3>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleOwnerInfo(owner)}
                          >
                            Info
                          </Button>
                        </div>
                        <div className="space-y-1">
                          <div>Total Orders: {data.totalOrders}</div>
                          <div>Queued Orders: {data.queuedOrders}</div>
                          <div>Loaded Orders: {data.loadedOrders}</div>
                          <div>Pending Orders: {data.pendingOrders}</div>
                          <div>AGO Orders: {data.agoOrders}</div>
                          <div>PMS Orders: {data.pmsOrders}</div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Add Work Dialog */} 
      <AnimatePresence>
        {isAddModalOpen && (
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <DialogContent className="sm:max-w-[800px] w-[90vw] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">Add New Work Detail</DialogTitle>
                </DialogHeader>
                <AddWorkDialog 
                  onClose={() => setIsAddModalOpen(false)} 
                  onSave={async (formData) => {
                    const result = await handleAddNew(formData);
                    if (result.success) {
                      setIsAddModalOpen(false);
                    }
                    return result; // Return the full result object
                  }} 
                />
              </DialogContent>
            </motion.div>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Add truck history dialog */}
      <Dialog open={showTruckHistory} onOpenChange={setShowTruckHistory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Truck History - {selectedTruckHistory?.truck_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedTruckHistory?.previous_trucks?.map((truck, index) => (
              <div key={index} className="flex justify-between items-center p-2 border rounded">
                <span>{truck}</span>
                <span className="text-sm text-muted-foreground">
                  Previous {selectedTruckHistory.previous_trucks!.length - index}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Unpaid Summary Dialog */}
      <Dialog open={showUnpaidSummary} onOpenChange={setShowUnpaidSummary}>
        <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] p-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Unpaid Trucks Summary</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[calc(80vh-100px)] pr-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(getUnpaidSummary()).map(([owner, data]) => (
                <Card key={owner} className="p-3 sm:p-4 shadow-sm">
                  {/* Owner Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-3 pb-2 border-b">
                    <div className="w-full">
                      <h3 className="font-semibold text-base">{owner}</h3>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                        <p className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                          Total Due: ${formatNumber(data.totalAmount)}
                        </p>
                        <div className="flex gap-2 text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 whitespace-nowrap">
                            AGO: {data.agoCount}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">
                            PMS: {data.pmsCount}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowUnpaidSummary(false);
                        router.push(`/dashboard/work/${encodeURIComponent(owner)}`);
                      }}
                      className="w-full sm:w-auto whitespace-nowrap"
                    >
                      View Details
                    </Button>
                  </div>

                  {/* Trucks List */}
                  <div className="space-y-2">
                    {data.trucks.map(truck => (
                      <div 
                        key={truck.truck_number}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{truck.truck_number}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                            truck.product === 'AGO' 
                              ? "bg-blue-100 text-blue-700" 
                              : "bg-green-100 text-green-700"
                          )}>
                            {truck.product}
                          </span>
                        </div>
                        <span className="text-red-600 font-medium">
                          ${formatNumber(truck.amount)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Summary Footer */}
                  <div className="mt-3 pt-2 border-t text-sm text-muted-foreground">
                    {data.trucks.length} unpaid truck{data.trucks.length !== 1 ? 's' : ''}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


