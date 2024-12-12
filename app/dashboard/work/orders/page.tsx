'use client'

// Add AnimatePresence and motion imports
import { motion } from 'framer-motion'
// Add Avatar imports
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
// Remove useTheme and Sun/Moon imports since they're now in theme-toggle
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
// Add Triangle to imports
import { ArrowLeft, Plus, Trash2, FileText, Loader2, Edit, Check, X, Copy, Triangle, Download, FileSpreadsheet, History, Receipt } from 'lucide-react'
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
}

interface SummaryStats {
  totalOrders: number;
  queuedOrders: number;
  unqueuedOrders: number;
  agoOrders: number;
  pmsOrders: number;
  loadedOrders: number;
  pendingOrders: number;
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
}

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
    pendingOrders: 0
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
    allocatedTrucks: []
  })

  // Add new state
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null)
  const [selectedTrucks, setSelectedTrucks] = useState<string[]>([])
  const [showTruckHistory, setShowTruckHistory] = useState(false)
  const [selectedTruckHistory, setSelectedTruckHistory] = useState<WorkDetail | null>(null)

  // 2. Define functions before useEffect hooks
  const updateSummaryData = (data: WorkDetail[]) => {
    const stats: SummaryStats = {
      totalOrders: 0,
      queuedOrders: 0,
      unqueuedOrders: 0,
      agoOrders: 0,
      pmsOrders: 0,
      loadedOrders: 0,
      pendingOrders: 0
    };
    
    const ownerSummaryData: OwnerSummary = {};

    data.forEach(detail => {
      stats.totalOrders++;
      
      if (detail.loaded) stats.loadedOrders++;
      if (detail.status === "queued" && !detail.loaded) stats.pendingOrders++;
      if (detail.product.trim().toUpperCase() === "AGO") stats.agoOrders++;
      if (detail.product.trim().toUpperCase() === "PMS") stats.pmsOrders++;
      if (detail.status === "queued") stats.queuedOrders++;
      else stats.unqueuedOrders++;

      if (!ownerSummaryData[detail.owner]) {
        ownerSummaryData[detail.owner] = {
          totalOrders: 1,
          agoOrders: detail.product.trim().toUpperCase() === "AGO" ? 1 : 0,
          pmsOrders: detail.product.trim().toUpperCase() === "PMS" ? 1 : 0,
          queuedOrders: detail.status === "queued" ? 1 : 0,
          unqueuedOrders: detail.status !== "queued" ? 1 : 0,
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
        if (detail.status === "queued") ownerData.queuedOrders++;
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
  const handleOwnerInfo = async (owner: string) => {
    setSelectedOwner(owner)
    
    // Fetch payment details
    const paymentsRef = ref(database, `payments/${owner}`)
    const snapshot = await get(paymentsRef)
    if (snapshot.exists()) {
      const payments = Object.entries(snapshot.val()).map(([id, data]: [string, any]) => ({
        id,
        ...data,
      }))
      setOwnerPayments(payments)
    } else {
      setOwnerPayments([])
    }
    
    setOwnerModalOpen(true)
  }

  // Add new function to handle payment
  const handleAddPayment = (owner: string) => {
    setPaymentFormData({
      amount: 0,
      note: '',
      allocatedTrucks: []
    });
    setSelectedOwner(owner);
    setIsPaymentModalOpen(true);
  };

  // Add new helper function to get truck allocations
  const getTruckAllocations = (truck: WorkDetail) => {
    // Ensure payments is an array
    const payments = truckPayments[truck.id] ? Object.values(truckPayments[truck.id]) : [];
    const totalAllocated = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalDue = parseFloat(truck.price) * (parseFloat(truck.at20 || '0'));
    return {
      totalAllocated,
      totalDue,
      balance: totalDue - totalAllocated
    };
  };

  // Modify handlePaymentSubmit to properly store truck allocations
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOwner) return;

    try {
      const paymentRef = push(ref(database, `payments/${selectedOwner}`));
      const paymentKey = paymentRef.key!;
      
      const paymentData = {
        amountPaid: paymentFormData.amount,
        timestamp: new Date().toISOString(),
        allocatedTrucks: paymentFormData.allocatedTrucks.map(t => ({
          truckId: t.truckId,
          amount: t.amount
        })), // Store the full allocation data
        note: paymentFormData.note
      };

      // Create all updates in a single transaction
      const updates: { [path: string]: any } = {
        [`payments/${selectedOwner}/${paymentKey}`]: paymentData
      };

      // Add truck payment allocations
      paymentFormData.allocatedTrucks.forEach(truck => {
        updates[`truckPayments/${truck.truckId}/${paymentKey}`] = {
          amount: truck.amount,
          timestamp: paymentData.timestamp,
          note: paymentData.note,
          paymentId: paymentKey
        };
      });

      await update(ref(database), updates);

      // Refresh data
      const truckPaymentsRef = ref(database, 'truckPayments');
      const snapshot = await get(truckPaymentsRef);
      if (snapshot.exists()) {
        setTruckPayments(snapshot.val());
      }

      toast({
        title: "Success",
        description: "Payment recorded and allocated successfully",
      });
      setIsPaymentModalOpen(false);
      handleOwnerInfo(selectedOwner); // Refresh owner info
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save payment",
      });
    }
  };

  // Add new helper function for number formatting
  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Add function to calculate owner totals
  const calculateOwnerTotals = (owner: string) => {
    const trucks = ownerSummary[owner]?.loadedTrucks || [];
    const totalToBePaid = trucks.reduce((sum, truck) => sum + (parseFloat(truck.price) * (parseFloat(truck.at20 || '0'))), 0);
    const totalPaid = ownerPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
    const balance = totalToBePaid - totalPaid; // Corrected balance calculation
    
    return { totalToBePaid, totalPaid, balance };
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

  // Add new function to handle batch actions
  const handleBatchAction = async (action: 'release' | 'force-release') => {
    if (!selectedTrucks.length) return
    
    setIsActionLoading(action)
    try {
      const updates: { [key: string]: any } = {}
      selectedTrucks.forEach(truckId => {
        updates[`work_details/${truckId}`] = {
          released: true,
          paid: action === 'release',
          paymentPending: action === 'force-release'
        }
      })
      
      await update(ref(database), updates)
      setSelectedTrucks([])
      toast({
        title: "Success",
        description: `${selectedTrucks.length} trucks ${action === 'release' ? 'released' : 'force-released'}`
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process batch action"
      })
    } finally {
      setIsActionLoading(null)
    }
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
    doc.text([
      `Owner: ${owner}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Total Orders: ${ownerData.totalOrders}`,
      '\nPayment Summary:',
      `Total Amount Due: $${formatNumber(totalToBePaid)}`,
      `Total Amount Paid: $${formatNumber(totalPaid)}`,
      `Balance: $${formatNumber(Math.abs(balance))} ${balance < 0 ? '(Credit)' : '(Due)'}`,
    ], 20, 40)
  
    let yPos = 100
  
    // Add loaded trucks table
    if (ownerData.loadedTrucks.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Truck', 'Product', 'Quantity', 'At20', 'Price', 'Total Due', 'Status']],
        body: ownerData.loadedTrucks.map(truck => {
          const { totalDue, totalAllocated, balance } = getTruckAllocations(truck)
          return [
            truck.truck_number,
            truck.product,
            truck.quantity,
            truck.at20 || '-',
            `$${formatNumber(parseFloat(truck.price))}`,
            `$${formatNumber(totalDue)}`,
            balance <= 0 ? 'Paid' : 
            truck.paymentPending ? 'Payment Pending' :
            `Due: $${formatNumber(balance)}`
          ]
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
  
          return [
            new Date(payment.timestamp).toLocaleDateString(),
            `$${formatNumber(payment.amountPaid)}`,
            allocatedTrucks,
            payment.note || '-'
          ]
        }),
        theme: 'grid',
        headStyles: { fillColor: [40, 167, 69] },
        styles: { fontSize: 8 },
        margin: { left: 20, right: 20 }
      })
    }
  
    // Add summary statistics
    doc.text([
      '\nOrder Statistics:',
      `AGO Orders: ${ownerData.agoOrders}`,
      `PMS Orders: ${ownerData.pmsOrders}`,
      `Queued Orders: ${ownerData.queuedOrders}`,
      `Loaded Orders: ${ownerData.loadedOrders}`,
      `Pending Orders: ${ownerData.pendingOrders}`,
    ], 20, (doc as any).autoTable.previous.finalY + 20)
  
    // Add footer
    doc.setFontSize(8)
    doc.text([
      'This is a computer-generated document.',
      `Generated on: ${new Date().toLocaleString()}`
    ], 20, doc.internal.pageSize.height - 20)
  
    // Save the PDF
    doc.save(`${owner}_Payment_Summary_${new Date().toISOString().split('T')[0]}.pdf`)
  }

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

  const getFilteredWorkDetails = () => {
    return getSortedWorkDetails().filter(detail => {
      const matchesOwner = ownerFilter ? detail.owner.toLowerCase().includes(ownerFilter.toLowerCase()) : true
      const matchesProduct = productFilter !== "ALL" ? detail.product === productFilter : true
      const matchesStatus = statusFilter !== "ALL" ? detail.status === statusFilter : true
      const matchesDepot = depotFilter ? detail.depot.toLowerCase().includes(depotFilter.toLowerCase()) : true
      const matchesDestination = destinationFilter ? detail.destination.toLowerCase().includes(destinationFilter.toLowerCase()) : true
      const matchesSearch = searchTerm
        ? detail.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
          detail.truck_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          detail.orderno.toLowerCase().includes(searchTerm.toLowerCase()) ||
          detail.product.toLowerCase().includes(searchTerm.toLowerCase()) || // Added product search
          detail.destination.toLowerCase().includes(searchTerm.toLowerCase()) // Added destination search
        : true
      return matchesOwner && matchesProduct && matchesStatus && matchesDepot && matchesDestination && matchesSearch
    })
  }

  const handleGenerateGatePass = (detail: WorkDetail) => {
    const params = new URLSearchParams({
      orderNo: detail.orderno,
      destination: detail.destination,
      truck: detail.truck_number,
      product: detail.product,
      quantity: detail.quantity.toString(),
      at20: detail.at20 || ''
    })
    
    router.push(`/dashboard/work/orders/gate-pass?${params.toString()}`)
  }

  return (
    <div className="min-h-screen">
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-emerald-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            {/* Left side */} 
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/dashboard/work')}
                className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold text-emerald-900">Work Management</h1>
            </div>
            {/* Right side */} 
            <div className="flex items-center gap-4">
              <motion.div
                className="relative"
                whileHover={{ width: 'auto' }}
                initial={{ width: 40 }}
                style={{ overflow: 'hidden' }}
              >
                <Button
                  variant="outline"
                  onClick={() => setIsAddModalOpen(true)}
                  className="whitespace-nowrap hover:bg-emerald-100 hover:text-emerald-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </motion.div>
              <ThemeToggle />
              <Avatar className="h-8 w-8 border-2 border-emerald-200">
                <AvatarImage 
                  src={session?.user?.image || lastUploadedImage || ''} 
                  alt="Profile"
                />
                <AvatarFallback className="bg-emerald-100 text-emerald-700">
                  {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
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

      <main className="max-w-7xl mx-auto px-4 pt-24 pb-8">
        {/* Search and Toggle Filters on the same line */} 
        <div className="flex flex-col items-center sm:flex-row sm:justify-center sm:space-x-4 mb-4">
          <Input
            placeholder="Search by owner, truck number, or order number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xl w-full sm:w-1/2"
          />
          <Button
            variant="secondary"
            onClick={() => setShowFilters(prev => !prev)}
            className="mt-2 sm:mt-0"
          >
            {showFilters ? "Hide Filters" : "Show Filters"}
          </Button>
        </div>

        {/* Conditionally Rendered Filter Controls with reduced sizes */} 
        {showFilters && (
          <div className="flex flex-wrap justify-center mb-8 gap-2">
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
          </div>
        )}

        {/* Download PDF Button */} 
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            {selectedTrucks.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleBatchAction('release')}
                  disabled={!!isActionLoading}
                >
                  {isActionLoading === 'release' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Release Selected ({selectedTrucks.length})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleBatchAction('force-release')}
                  disabled={!!isActionLoading}
                >
                  {isActionLoading === 'force-release' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Force Release Selected
                </Button>
              </>
            )}
          </div>
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
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-card text-card-foreground">
              <thead>
                <tr className="border-b">
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        const filtered = getFilteredWorkDetails()
                        setSelectedTrucks(e.target.checked ? filtered.map(d => d.id) : [])
                      }}
                      checked={selectedTrucks.length === getFilteredWorkDetails().length}
                    />
                  </th>
                  <th className="p-3 text-left font-medium">Owner</th>
                  <th className="p-3 text-left font-medium">Product</th>
                  <th className="p-3 text-left font-medium">Truck Number</th>
                  <th className="p-3 text-left font-medium">Quantity</th>
                  <th className="p-3 text-left font-medium">Status</th>
                  <th className="p-3 text-left font-medium">Order No</th>
                  <th className="p-3 text-left font-medium">Depot</th>
                  <th className="p-3 text-left font-medium">Destination</th>
                  <th className="p-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredWorkDetails().map(detail => (
                  <tr 
                    key={detail.id} 
                    className={`border-b hover:bg-muted/50 ${detail.loaded ? 'opacity-50' : ''} ${
                      detail.id === lastAddedId ? 'highlight-new-record' : ''
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedTrucks.includes(detail.id)}
                        onChange={(e) => {
                          setSelectedTrucks(prev => 
                            e.target.checked 
                              ? [...prev, detail.id]
                              : prev.filter(id => id !== detail.id)
                          )
                        }}
                      />
                    </td>
                    <td className="p-3">{detail.owner}</td>
                    <td className="p-3">{detail.product}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
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
                    <td className="p-3">{detail.quantity}</td>
                    <td className="p-3">
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
                    <td className="p-3">{detail.orderno}</td>
                    <td className="p-3">{detail.depot}</td>
                    <td className="p-3">{detail.destination}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {!detail.loaded ? (
                          <Button 
                            variant="default"
                            size="sm"
                            onClick={() => handleLoadedStatus(detail.id)}
                          >
                            Loaded?
                          </Button>
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
                              variant="default"
                              size="sm"
                              onClick={() => handleGenerateGatePass(detail)}
                              disabled={!detail.loaded}
                            >
                              GP
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 space-y-8">
          {/* Summary Stats */} 
          <Card className="p-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold mb-4">Summary</h2>
              <Button variant="ghost" onClick={handleCopySummary}>
                <Copy className="h-5 w-5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div>Total Orders: {summaryStats.totalOrders}</div>
                <div>Queued Orders: {summaryStats.queuedOrders}</div>
                <div>Unqueued Orders: {summaryStats.unqueuedOrders}</div>
              </div>
              <div className="space-y-2">
                <div>Loaded Orders: {summaryStats.loadedOrders}</div>
                <div>Pending Orders: {summaryStats.pendingOrders}</div>
              </div>
              <div className="space-y-2">
                <div>AGO Orders: {summaryStats.agoOrders}</div>
                <div>PMS Orders: {summaryStats.pmsOrders}</div>
              </div>
            </div>
          </Card>

          {/* Owner Summary */} 
          <Card className="p-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold mb-4">Owner Summary</h2>
              <Button variant="ghost" onClick={handleCopySummary}>
                <Copy className="h-5 w-5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(ownerSummary).map(([owner, data]) => (
                <Card key={owner} className="p-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold mb-2">{owner}</h3>
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
              ))}
            </div>
          </Card>
        </div>
      </main>

      {/* Add Work Dialog */} 
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[800px] w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Work Detail</DialogTitle>
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
      </Dialog>

      {/* Add Owner Info Modal */} 
      <Dialog open={ownerModalOpen} onOpenChange={setOwnerModalOpen}>
        <DialogContent className="sm:max-w-[800px] w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedOwner} Details</DialogTitle>
          </DialogHeader>
          
          {selectedOwner && ownerSummary[selectedOwner] && (
            <div className="space-y-6">
              {/* Owner Payment Summary */} 
              {(() => {
                const { totalToBePaid, totalPaid, balance } = calculateOwnerTotals(selectedOwner);
                return (
                  <Card className="p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-sm font-medium">Total To Be Paid</div>
                        <div className="text-lg">${formatNumber(totalToBePaid)}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Total Paid</div>
                        <div className="text-lg">${formatNumber(totalPaid)}</div>
                      </div>
                      <div>
                        <div className={`text-lg ${
                          balance < 0 ? 'text-emerald-500' : balance > 0 ? 'text-red-500' : ''
                        }`}>
                          ${formatNumber(Math.abs(balance))}
                          {balance !== 0 && (balance < 0 ? ' (Credit)' : ' (Due)')}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })()}

              {/* Loaded Trucks Section with Updated Payment Status */} 
              <div>
                <h4 className="text-lg font-semibold mb-2">Loaded Trucks</h4>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-2">Truck</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Price</th>
                      <th className="text-left p-2">At20</th>
                      <th className="text-left p-2">Total Due</th>
                      <th className="text-left p-2">Allocated</th>
                      <th className="text-left p-2">Balance</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownerSummary[selectedOwner].loadedTrucks.map((truck: any) => {
                      const { totalAllocated, totalDue, balance } = getTruckAllocations(truck);
                      const isPaid = balance <= 0;
                      
                      return (
                        <tr key={truck.id} className={`border-t ${
                          isPaid ? 'text-gray-500' :
                          truck.paymentPending ? 'text-orange-500' :
                          balance < 0 ? 'text-emerald-500' :
                          'text-red-500'
                        }`}>
                          <td className="p-2">{truck.truck_number}</td>
                          <td className="p-2">{truck.product}</td>
                          <td className="p-2">${formatNumber(truck.price)}</td>
                          <td className="p-2">{truck.at20 || '-'}</td>
                          <td className="p-2">${formatNumber(totalDue)}</td>
                          <td className="p-2">${formatNumber(totalAllocated)}</td>
                          <td className="p-2">${formatNumber(Math.abs(balance))}</td>
                          <td className="p-2">
                            {isPaid ? 'Paid' : 
                             truck.paymentPending ? 'Payment Pending' :
                             balance < 0 ? `Overpaid: $${formatNumber(Math.abs(balance))}` :
                             `Due: $${formatNumber(balance)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Payment History section */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-lg font-semibold">Payment History</h4>
                  <Button onClick={() => handleAddPayment(selectedOwner)}>Add Payment</Button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Amount</th>
                      <th className="text-left p-2">Allocated To</th>
                      <th className="text-left p-2">Note</th>
                      <th className="text-left p-2">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownerPayments.map((payment) => (
                      <tr key={payment.id} className="border-t">
                        <td className="p-2">
                          {new Date(payment.timestamp).toLocaleDateString()}
                        </td>
                        <td className="p-2">${formatNumber(payment.amountPaid)}</td>
                        <td className="p-2">
                          {payment.allocatedTrucks && payment.allocatedTrucks.length > 0 ? (
                            <div className="space-y-1">
                              {payment.allocatedTrucks.map((allocation: { truckId: string; amount: number }) => {
                                const truckDetail = workDetails.find(t => t.id === allocation.truckId);
                                return truckDetail ? (
                                  <div key={allocation.truckId} className="text-sm">
                                    {truckDetail.truck_number} (${formatNumber(allocation.amount)})
                                  </div>
                                ) : null;
                              })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unallocated</span>
                          )}
                        </td>
                        <td className="p-2">{payment.note || '-'}</td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => generatePaymentReceipt(selectedOwner)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Summary
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Payment Modal */} 
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-[800px] w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Payment for {selectedOwner}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label>Total Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentFormData.amount}
                  onChange={(e) => setPaymentFormData(prev => ({
                    ...prev,
                    amount: parseFloat(e.target.value)
                  }))}
                  required
                />
              </div>
              <div>
                <Label>Note</Label>
                <Input
                  value={paymentFormData.note}
                  onChange={(e) => setPaymentFormData(prev => ({
                    ...prev,
                    note: e.target.value
                  }))}
                  placeholder="Add payment note"
                />
              </div>
              <div>
                <Label>Allocate to Trucks</Label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {selectedOwner && ownerSummary[selectedOwner]?.loadedTrucks.map((truck) => {
                    const totalDue = parseFloat(truck.price) * (parseFloat(truck.at20 ?? '0'));
                    const allocated = paymentFormData.allocatedTrucks.find(t => t.truckId === truck.id);
                    
                    return (
                      <div key={truck.id} className="flex items-center gap-4 p-2 border rounded">
                        <Label>
                          <input
                            type="checkbox"
                            checked={!!allocated}
                            onChange={(e) => {
                              setPaymentFormData(prev => ({
                                ...prev,
                                allocatedTrucks: e.target.checked
                                  ? [...prev.allocatedTrucks, { truckId: truck.id, amount: 0 }]
                                  : prev.allocatedTrucks.filter(t => t.truckId !== truck.id)
                              }));
                            }}
                            className="mr-2"
                          />
                          {truck.truck_number} ({truck.product}) - Due: ${totalDue.toFixed(2)}
                        </Label>
                        {allocated && (
                          <Input
                            type="number"
                            step="0.01"
                            value={allocated.amount}
                            onChange={(e) => {
                              setPaymentFormData(prev => ({
                                ...prev,
                                allocatedTrucks: prev.allocatedTrucks.map(t =>
                                  t.truckId === truck.id
                                    ? { ...t, amount: parseFloat(e.target.value) }
                                    : t
                                )
                              }));
                            }}
                            className="w-32"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Payment</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add truck history dialog */}
      <Dialog open={showTruckHistory} onOpenChange={setShowTruckHistory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
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
    </div>
  )
}

