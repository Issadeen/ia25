'use client'

import { useParams, useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { database, storage } from "@/lib/firebase"
import { ref, onValue, update, get, push, set } from "firebase/database"
import { ref as storageRef, getDownloadURL } from "firebase/storage" // Fix storage imports
import { formatNumber, toFixed2, cn } from "@/lib/utils" // Add cn to imports
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// Import all the interfaces from a shared types file
import type { WorkDetail, TruckPayment, OwnerBalance } from "@/types" 
import { motion } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSession } from "next-auth/react"
import { ArrowLeft, Download, Receipt } from 'lucide-react' // Remove FileSpreadsheet
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle" // Add ThemeToggle import
import { Skeleton } from "@/components/ui/skeleton"
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { OwnerBalanceDialog } from "@/components/ui/molecules/owner-balance-dialog" // Add OwnerBalanceDialog import

// Add interfaces at the top
interface TruckAllocation {
  totalAllocated: number;
  totalDue: number;
  balance: number;
  pendingAmount: number;
}

interface OwnerTotals {
  totalDue: number;
  totalPaid: number;
  pendingTotal: number;
  balance: number;
  existingBalance: number;
}

// Update the BalanceUsage interface to include the type field
interface BalanceUsage {
  amount: number;
  timestamp: string;
  usedFor: string[];
  paymentId: string;
  type: 'deposit' | 'usage';  // Add this field
  note?: string;  // Add optional note field
}

// Add new type
interface Prepayment extends BalanceUsage {
  type: 'deposit';
  amount: number;
  timestamp: string;
  note?: string;
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
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  }>({ key: 'truck_number', direction: 'asc' });
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false); // Add state for balance dialog

  interface PaymentFormData {
    amount: number;
    note: string;
    allocatedTrucks: { truckId: string; amount: number; }[];
    useExistingBalance: boolean;
    balanceToUse: number;
  }

  const [paymentFormData, setPaymentFormData] = useState<PaymentFormData>({
    amount: 0,
    note: '',
    allocatedTrucks: [],
    useExistingBalance: false,
    balanceToUse: 0
  })

  // Fetch data when component mounts
  useEffect(() => {
    const fetchOwnerData = async () => {
      try {
        // Fetch work details
        const workDetailsRef = ref(database, 'work_details')
        onValue(workDetailsRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = Object.entries(snapshot.val())
              .map(([id, detail]: [string, any]) => ({ id, ...detail }))
              .filter(detail => detail.owner === owner)
            setWorkDetails(data)
          }
        })

        // Fetch payments
        const paymentsRef = ref(database, `payments/${owner}`)
        onValue(paymentsRef, (snapshot) => {
          if (snapshot.exists()) {
            const payments = Object.entries(snapshot.val())
              .map(([id, data]: [string, any]) => ({ id, ...data }))
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
        const truckPaymentsRef = ref(database, 'truckPayments')
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

        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching data:', error)
        toast({
          title: "Error",
          description: "Failed to load owner data",
        })
      }
    }

    fetchOwnerData()
  }, [owner])

  // Add useEffect for profile image
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

  // Implement getTruckAllocations with proper typing
  const getTruckAllocations = (truck: WorkDetail): TruckAllocation => {
    const payments = truckPayments[truck.id] ? Object.values(truckPayments[truck.id]) : [];
    const totalAllocated = toFixed2(payments.reduce((sum, p) => sum + p.amount, 0));
    
    const totalDue = truck.at20 
      ? toFixed2(parseFloat(truck.price) * parseFloat(truck.at20))
      : 0;
    
    const balance = toFixed2(totalDue - totalAllocated);
    const pendingAmount = (balance > 0 && truck.paymentPending) ? balance : 0;
    
    return {
      totalAllocated,
      totalDue,
      balance,
      pendingAmount
    };
  };

  // Update calculateTotals with proper typing
  const calculateTotals = (): OwnerTotals => {
    const loadedTrucks = workDetails.filter(truck => truck.loaded);
    
    const totals = loadedTrucks.reduce((sum, truck) => {
      const { totalDue, totalAllocated, pendingAmount } = getTruckAllocations(truck);
      return {
        totalDue: sum.totalDue + totalDue,
        totalPaid: sum.totalPaid + totalAllocated,
        pendingTotal: sum.pendingTotal + (pendingAmount || 0)
      };
    }, { totalDue: 0, totalPaid: 0, pendingTotal: 0 });

    return {
      ...totals,
      balance: totals.totalDue - totals.totalPaid,
      existingBalance: ownerBalance?.amount || 0
    };
  };

  // Payment handling functions
  const handleAddPayment = () => {
    setPaymentFormData({
      amount: 0,
      note: '',
      allocatedTrucks: [],
      useExistingBalance: false,
      balanceToUse: 0
    })
    setIsPaymentModalOpen(true)
  }

  // Add all the payment-related functions from the orders page
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const paymentRef = push(ref(database, `payments/${owner}`));
      const paymentKey = paymentRef.key!;
      const timestamp = new Date().toISOString();
      const updates: { [path: string]: any } = {};

      // Calculate total allocation amount
      const totalAllocation = toFixed2(
        paymentFormData.allocatedTrucks.reduce((sum, t) => sum + t.amount, 0)
      );

      // Validate total allocation matches available funds
      const totalAvailable = getTotalAvailable();
      if (totalAllocation > totalAvailable) {
        toast({
          title: "Error",
          description: "Total allocation exceeds available funds",
        });
        return;
      }

      // Create payment record if there's a new payment amount
      if (paymentFormData.amount > 0) {
        updates[`payments/${owner}/${paymentKey}`] = {
          amount: paymentFormData.amount,
          timestamp,
          allocatedTrucks: paymentFormData.allocatedTrucks,
          note: paymentFormData.note
        };
      }

      // Handle balance usage
      if (paymentFormData.useExistingBalance && paymentFormData.balanceToUse > 0) {
        const balanceUsageRef = push(ref(database, `balance_usage/${owner}`));
        updates[`balance_usage/${owner}/${balanceUsageRef.key}`] = {
          amount: paymentFormData.balanceToUse,
          timestamp,
          usedFor: paymentFormData.allocatedTrucks.map(t => t.truckId),
          paymentId: paymentKey
        };

        // Update owner balance
        const newBalance = toFixed2((ownerBalance?.amount || 0) - paymentFormData.balanceToUse);
        updates[`owner_balances/${owner}`] = {
          amount: newBalance,
          lastUpdated: timestamp
        };
      }

      // Process truck payment records
      for (const allocation of paymentFormData.allocatedTrucks) {
        updates[`truckPayments/${allocation.truckId}/${paymentKey}`] = {
          amount: allocation.amount,
          timestamp,
          note: paymentFormData.note,
          paymentId: paymentKey
        };

        // Update truck payment status if fully paid
        const truck = workDetails.find(t => t.id === allocation.truckId);
        if (truck) {
          const { totalDue, totalAllocated } = getTruckAllocations(truck);
          const newTotal = toFixed2(totalAllocated + allocation.amount);
          
          if (newTotal >= totalDue) {
            updates[`work_details/${allocation.truckId}/paid`] = true;
            updates[`work_details/${allocation.truckId}/paymentPending`] = false;
          }
        }
      }

      // Apply all updates
      await update(ref(database), updates);

      toast({
        title: "Success",
        description: "Payment processed successfully",
      });
      
      setIsPaymentModalOpen(false);
      
      // Refresh the page to show updated data
      router.refresh();
      
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: "Error",
        description: "Failed to process payment",
      });
    }
  };

  // Add helper method to handle truck selection
  const handleTruckSelection = (
      checked: boolean,
      truck: WorkDetail
    ) => {
      if (checked) {
        setPaymentFormData(prev => ({
          ...prev,
          allocatedTrucks: [
            ...prev.allocatedTrucks,
            { truckId: truck.id, amount: 0 }
          ]
        }));
      } else {
        setPaymentFormData(prev => ({
          ...prev,
          allocatedTrucks: prev.allocatedTrucks.filter(t => t.truckId !== truck.id)
        }));
      }
    };

  // Add a helper to handle allocation input changes
  const handleAllocationChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    truckId: string
  ) => {
    // ...existing code from orders page that updates paymentFormData.allocatedTrucks...
  };

  // Add the missing calculateOptimalAllocation function
  function calculateOptimalAllocation(
    totalAmount: number,
    trucks: WorkDetail[],
    truckPayments: { [truckId: string]: TruckPayment[] },
    balanceAmount = 0
  ): { truckId: string; amount: number; }[] {
    const totalAvailable = toFixed2(totalAmount); // totalAmount already includes balance
    const allocations: { truckId: string; amount: number; }[] = [];

    // Sort trucks by creation date and balance
    const trucksWithBalances = trucks
      .filter(truck => {
        const { balance } = getTruckAllocations(truck);
        return balance > 0;
      })
      .sort((a, b) => {
        // Sort by creation date first
        const dateA = new Date(a.createdAt || '').getTime();
        const dateB = new Date(b.createdAt || '').getTime();
        return dateA - dateB; // Oldest first
      });

    let remainingAmount = totalAvailable;

    // Allocate to trucks
    for (const truck of trucksWithBalances) {
      if (remainingAmount <= 0) break;

      const { balance } = getTruckAllocations(truck);
      const allocation = toFixed2(Math.min(balance, remainingAmount));
      
      if (allocation > 0) {
        allocations.push({
          truckId: truck.id,
          amount: allocation
        });
        remainingAmount = toFixed2(remainingAmount - allocation);
      }
    }

    return allocations;
  }

  // Add the missing calculateRemainingAmount function
  const calculateRemainingAmount = (totalAmount: number, allocations: { truckId: string; amount: number }[]) => {
    const totalAllocated = toFixed2(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
    return toFixed2(totalAmount - totalAllocated);
  };

  // Update handlePaymentInputChange to enforce 2 decimal places
  const handlePaymentInputChange = (e: React.ChangeEvent<HTMLInputElement>, truckId: string) => {
    const value = parseFloat(e.target.value);
    if (isNaN(value)) return;
    
    const newAmount = toFixed2(value);
    const truck = workDetails.find(t => t.id === truckId);
    
    if (!truck) return;
  
    const { balance } = getTruckAllocations(truck);
    const otherAllocations = paymentFormData.allocatedTrucks
      .filter(t => t.truckId !== truckId)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const remainingAmount = toFixed2(paymentFormData.amount - otherAllocations);
    const maxAllowed = toFixed2(Math.min(balance, remainingAmount));
  
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

  // Update handleBalanceUseChange to handle amounts correctly
  const handleBalanceUseChange = (checked: boolean) => {
    const availableBalance = ownerBalance?.amount || 0;
    
    setPaymentFormData(prev => ({
      ...prev,
      useExistingBalance: checked,
      amount: checked ? availableBalance : 0, // Set amount to balance when checked
      balanceToUse: checked ? availableBalance : 0,
      allocatedTrucks: [] // Reset allocations when changing balance use
    }));
  };

  // Update the available amount calculation to include balance
  const getTotalAvailable = () => {
    return paymentFormData.useExistingBalance 
      ? paymentFormData.amount 
      : paymentFormData.amount;
  };

  // Add sorting function
  const sortData = (data: any[], key: string) => {
    return [...data].sort((a, b) => {
      if (sortConfig.direction === 'asc') {
        return a[key] > b[key] ? 1 : -1;
      }
      return a[key] < b[key] ? 1 : -1;
    });
  };

  // Add export functions
  const handleDownloadPDF = () => {
    const doc = new jsPDF('landscape');
    const totals = calculateTotals();

    // Add header
    doc.setFontSize(20);
    doc.text(`${owner} - Financial Summary`, 14, 15);

    // Add summary section
    autoTable(doc, {
      startY: 25,
      head: [['Total Due', 'Total Paid', 'Balance', 'Available Balance']],
      body: [[
        `$${formatNumber(totals.totalDue)}`,
        `$${formatNumber(totals.totalPaid)}`,
        `$${formatNumber(Math.abs(totals.balance))}`,
        `$${formatNumber(totals.existingBalance)}`
      ]],
    });

    // Add trucks table
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY + 10 || 45,
      head: [['Truck', 'Product', 'At20', 'Price', 'Total Due', 'Paid', 'Balance', 'Status']],
      body: workDetails.filter(truck => truck.loaded).map(truck => {
        const { totalDue, totalAllocated, balance } = getTruckAllocations(truck);
        return [
          truck.truck_number,
          truck.product,
          truck.at20 || '-',
          `$${formatNumber(parseFloat(truck.price))}`,
          `$${formatNumber(totalDue)}`,
          `$${formatNumber(totalAllocated)}`,
          `$${formatNumber(Math.abs(balance))}`,
          balance <= 0 ? 'Paid' : truck.paymentPending ? 'Pending' : 'Due'
        ];
      }),
    });

    doc.save(`${owner}_summary_${new Date().toISOString().split('T')[0]}.pdf`);
  };

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
  );

  // Add function to fetch owner balances
  const fetchOwnerBalances = async () => {
    try {
      const balanceRef = ref(database, `owner_balances/${owner}`);
      const snapshot = await get(balanceRef);
      if (snapshot.exists()) {
        setOwnerBalance(snapshot.val());
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  // Add this useEffect to fetch balances when the component mounts
  useEffect(() => {
    fetchOwnerBalances();
  }, [owner]);

  return (
    <div className="min-h-screen">
      {/* Header - Make more compact on mobile */}
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3 flex justify-between items-center">
            {/* Left side - Simplified for mobile */}
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <h1 className="text-base sm:text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate">
                {owner}
              </h1>
            </div>
            {/* Right side - Compact layout for mobile */}
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="outline"
                onClick={() => setIsBalanceDialogOpen(true)}
                className="text-xs sm:text-sm px-2 py-1 sm:px-4 sm:py-2"
              >
                Add Prepayment
              </Button>
              <Button
                variant="outline"
                onClick={handleAddPayment}
                className="text-xs sm:text-sm px-2 py-1 sm:px-4 sm:py-2"
              >
                Add Payment
              </Button>
              <ThemeToggle />
              <Avatar className="h-6 w-6 sm:h-8 sm:w-8 ring-2 ring-pink-500/50">
                <AvatarImage 
                  src={session?.user?.image || lastUploadedImage || ''} 
                  alt="Profile"
                />
                <AvatarFallback className="bg-pink-100 text-pink-700">
                  {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      {/* Update main content container to account for fixed header */}
      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-16 sm:pt-24 pb-6 sm:pb-8">
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Export button - Mobile friendly */}
            <div className="flex justify-end">
              <Button variant="outline" onClick={handleDownloadPDF} className="text-xs sm:text-sm">
                <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Summary PDF
              </Button>
            </div>

            {/* Mini stats - Update to 3-column grid */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <Card className="p-2 sm:p-4">
                <div className="text-xs sm:text-sm font-medium text-muted-foreground">Total Trucks</div>
                <div className="text-lg sm:text-2xl font-bold">
                  {workDetails.filter(t => t.loaded).length}
                </div>
              </Card>
              <Card className="p-2 sm:p-4">
                <div className="text-xs sm:text-sm font-medium text-muted-foreground">AGO Trucks</div>
                <div className="text-lg sm:text-2xl font-bold">
                  {workDetails.filter(t => t.loaded && t.product === 'AGO').length}
                </div>
              </Card>
              <Card className="p-2 sm:p-4">
                <div className="text-xs sm:text-sm font-medium text-muted-foreground">PMS Trucks</div>
                <div className="text-lg sm:text-2xl font-bold">
                  {workDetails.filter(t => t.loaded && t.product === 'PMS').length}
                </div>
              </Card>
            </div>

            {/* Financial Summary - Mobile responsive */}
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

            {/* Loaded Trucks - Horizontal scroll on mobile */}
            <Card className="p-3 sm:p-6">
              <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Loaded Trucks</h2>
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
                        const { totalDue, totalAllocated, balance, pendingAmount } = getTruckAllocations(truck);
                        return (
                          <tr key={truck.id} className="border-t">
                            <td className="p-2">{truck.truck_number}</td>
                            <td className="p-2">{truck.product}</td>
                            <td className="p-2">{truck.at20 || '-'}</td>
                            <td className="p-2">${formatNumber(parseFloat(truck.price))}</td>
                            <td className="p-2">${formatNumber(totalDue)}</td>
                            <td className="p-2">${formatNumber(totalAllocated)}</td>
                            <td className="p-2">${formatNumber(Math.abs(balance))}</td>
                            <td className="p-2">
                              {balance <= 0 ? (
                                <span className="text-green-600">Paid</span>
                              ) : truck.paymentPending ? (
                                <span className="text-orange-500">Pending</span>
                              ) : (
                                <span className="text-red-600">Due</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>

            {/* Payment History - Stack on mobile */}
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
                        <th className="p-2 text-left">Amount</th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Allocated Trucks</th>
                        <th className="p-2 text-left">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownerPayments.map((payment) => (
                        <tr key={payment.id} className="border-t">
                          <td className="p-2">{payment.id}</td>
                          <td className="p-2">${formatNumber(payment.amount)}</td>
                          <td className="p-2">{new Date(payment.timestamp).toLocaleString()}</td>
                          <td className="p-2">
                            {payment.allocatedTrucks?.map((allocation: any) => {
                              const truck = workDetails.find(t => t.id === allocation.truckId);
                              return truck ? (
                                <div key={allocation.truckId} className="text-xs">
                                  {truck.truck_number} (${formatNumber(allocation.amount)})
                                </div>
                              ) : null;
                            })}
                          </td>
                          <td className="p-2 whitespace-nowrap">{payment.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>

            {/* Balance History */}
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
          </div>
        )}

        {/* Payment Modal - Mobile optimized */}
        <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] h-[90vh] sm:h-auto overflow-y-auto p-3 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                Add Payment for {owner}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handlePaymentSubmit} className="space-y-4 sm:space-y-6">
              {/* Balance Section */}
              {ownerBalance && ownerBalance.amount > 0 && (
                <Card className="p-4 bg-muted/50">
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
                <Label htmlFor="paymentAmount" className="text-base font-medium">
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
                        amount: parseFloat(e.target.value) || 0,
                        allocatedTrucks: []
                      }))}
                      className="text-lg"
                      placeholder="Enter amount"
                    />
                  </div>
                  {paymentFormData.useExistingBalance && (
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      New Payment: ${formatNumber(paymentFormData.amount - paymentFormData.balanceToUse)}
                    </div>
                  )}
                </div>
              </div>

              {/* Truck Allocation Section */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-medium">Allocate to Trucks</Label>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const totalAvailable = getTotalAvailable();
                        const allocations = calculateOptimalAllocation(
                          totalAvailable, // Pass the total available amount
                          workDetails.filter(t => t.loaded),
                          truckPayments
                        );
                        setPaymentFormData(prev => ({ ...prev, allocatedTrucks: allocations }));
                      }}
                    >
                      Auto Allocate
                    </Button>
                  </div>
                </div>

                <Card className="p-4">
                  <div className="text-sm grid grid-cols-3 gap-2">
                    <div>Available: ${formatNumber(getTotalAvailable())}</div>
                    <div>Allocated: ${formatNumber(
                      paymentFormData.allocatedTrucks.reduce((sum, t) => sum + t.amount, 0)
                    )}</div>
                    <div className={cn(
                      "font-medium",
                      calculateRemainingAmount(getTotalAvailable(), paymentFormData.allocatedTrucks) > 0 
                        ? "text-orange-500" 
                        : "text-emerald-600"
                    )}>
                      Remaining: ${formatNumber(calculateRemainingAmount(
                        getTotalAvailable(),
                        paymentFormData.allocatedTrucks
                      ))}
                    </div>
                  </div>
                </Card>

                <div className="space-y-2 max-h-[400px] overflow-y-auto rounded-lg border bg-card p-4">
                  {workDetails
                    .filter((t) => t.loaded && getTruckAllocations(t).balance > 0)
                    .map((truck) => {
                      const truckAllocation = getTruckAllocations(truck);
                      return (
                        <div key={truck.id} 
                          className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
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
                            className="w-32"
                          />
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Note Input */}
              <div className="space-y-2">
                <Label htmlFor="note" className="text-base font-medium">Note</Label>
                <Input
                  id="note"
                  value={paymentFormData.note}
                  onChange={(e) => setPaymentFormData(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Add a note for this payment"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    paymentFormData.amount <= 0 ||
                    paymentFormData.allocatedTrucks.length === 0 ||
                    calculateRemainingAmount(paymentFormData.amount, paymentFormData.allocatedTrucks) === paymentFormData.amount
                  }
                >
                  Save Payment
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <OwnerBalanceDialog 
          owner={owner}
          open={isBalanceDialogOpen}
          onOpenChange={setIsBalanceDialogOpen}
          currentBalance={ownerBalance?.amount || 0}
          onBalanceUpdate={fetchOwnerBalances}
        />
      </main>
    </div>
  );
}
