"use client"

import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { database } from "@/lib/firebase"
import { ref, onValue } from "firebase/database"
import { cn, formatNumber, toFixed2 } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { WorkDetail, TruckPayment } from "@/types"
import { ArrowLeft, X, Search, Check, ArrowRight } from "lucide-react"
import { getTruckAllocations } from "@/lib/payment-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Add interfaces at the top
interface Transaction {
  id: string
  type: 'deposit' | 'usage'
  amount: number
  timestamp: Date
  truckNumber?: string
  remainingBalance: number
  note?: string
}

interface PlaygroundState {
  balance: number
  transactions: Transaction[]
  allocations: { [truckId: string]: number }
}

interface AllTrucks {
  [owner: string]: {
    loaded: WorkDetail[]
    pending: WorkDetail[]
    total: number
  }
}

interface TruckWithAmounts extends WorkDetail {
  amounts: {
    total: number
    allocated: number
    remaining: number
  }
}

export default function PaymentPlayground() {
  const params = useParams()
  const router = useRouter()
  const owner = decodeURIComponent(params.owner as string)

  // Simplified state
  const [workDetails, setWorkDetails] = useState<WorkDetail[]>([])
  const [truckPayments, setTruckPayments] = useState<{ [truckId: string]: TruckPayment[] }>({})

  // Add new state for owner trucks
  const [ownerTrucks, setOwnerTrucks] = useState<{
    loaded: WorkDetail[]
    pending: WorkDetail[]
    total: number
  }>({
    loaded: [],
    pending: [],
    total: 0
  })

  // Update state to include all trucks
  const [allTrucks, setAllTrucks] = useState<AllTrucks>({})
  const [selectedOwner, setSelectedOwner] = useState<string>(owner)
  const [searchQuery, setSearchQuery] = useState("")

  const [playgroundState, setPlaygroundState] = useState<PlaygroundState>({
    balance: 0,
    transactions: [],
    allocations: {}
  })
  const [totalAmount, setTotalAmount] = useState<number>(0)

  // Add new state for pending allocations
  const [pendingAllocations, setPendingAllocations] = useState<{ [truckId: string]: number }>({})

  // Update the useEffect to have proper dependencies
  useEffect(() => {
    const workDetailsRef = ref(database, "work_details")
    const workDetailsUnsubscribe = onValue(workDetailsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.entries(snapshot.val())
          .map(([id, detail]: [string, any]) => ({ id, ...detail }))
        
        // Set all work details without filtering by owner
        setWorkDetails(data)

        // Group trucks by owner
        const groupedTrucks = data.reduce((acc: AllTrucks, truck) => {
          const owner = truck.owner
          if (!acc[owner]) {
            acc[owner] = {
              loaded: [],
              pending: [],
              total: 0
            }
          }

          if (truck.loaded) {
            acc[owner].loaded.push(truck)
          } else {
            acc[owner].pending.push(truck)
          }
          acc[owner].total++

          return acc
        }, {})

        setAllTrucks(groupedTrucks)
      }
    })

    const truckPaymentsRef = ref(database, "truckPayments")
    const truckPaymentsUnsubscribe = onValue(truckPaymentsRef, (snapshot) => {
      if (snapshot.exists()) {
        setTruckPayments(snapshot.val())
      }
    })

    // Cleanup function
    return () => {
      workDetailsUnsubscribe()
      truckPaymentsUnsubscribe()
    }
  }, []) // Empty dependency array since we're only setting up listeners

  // Update the useEffect to properly set owner trucks when selected owner changes
  useEffect(() => {
    if (!workDetails.length) return;

    // Filter and set owner trucks when selected owner changes
    const ownerData = workDetails.filter(detail => detail.owner === selectedOwner);
    setOwnerTrucks({
      loaded: ownerData.filter(truck => truck.loaded),
      pending: ownerData.filter(truck => !truck.loaded),
      total: ownerData.length
    });
  }, [selectedOwner, workDetails]);

  // Add search and filter functions
  const getFilteredTrucks = () => {
    // Get all loaded trucks regardless of owner
    const loadedTrucks = workDetails.filter(truck => 
      truck.loaded && getTruckAllocations(truck, truckPayments).balance > 0
    );

    // Apply search filter
    return loadedTrucks.filter(truck => {
      const searchTerms = searchQuery.toLowerCase();
      return (
        truck.truck_number.toLowerCase().includes(searchTerms) ||
        truck.product?.toLowerCase().includes(searchTerms) ||
        truck.owner.toLowerCase().includes(searchTerms)
      );
    });
  }

  // Add owner stats section after header
  const OwnerStats = () => {
    const allLoaded = workDetails.filter(t => t.loaded);
    const withBalance = allLoaded.filter(t => getTruckAllocations(t, truckPayments).balance > 0);
    
    return (
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Total Trucks</h3>
          <p className="text-2xl font-bold">{allLoaded.length}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">With Balance</h3>
          <p className="text-2xl font-bold text-emerald-600">{withBalance.length}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Fully Paid</h3>
          <p className="text-2xl font-bold text-orange-500">
            {allLoaded.length - withBalance.length}
          </p>
        </Card>
      </div>
    );
  };

  // Simplified handlers
  const handleAddDeposit = (amount: number) => {
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'deposit',
      amount,
      timestamp: new Date(),
      remainingBalance: playgroundState.balance + amount,
      note: 'Deposit added'
    }

    setPlaygroundState(prev => ({
      ...prev,
      balance: prev.balance + amount,
      transactions: [...prev.transactions, newTransaction]
    }))
  }

  // Update handleTruckAllocation to handle pending allocations
  const handleTruckAllocation = (truckId: string, amount: number) => {
    setPendingAllocations(prev => ({
      ...prev,
      [truckId]: amount
    }))
  }

  // Add new handler for committing allocations
  const handleCommitAllocation = (truckId: string) => {
    const truck = workDetails.find(t => t.id === truckId)
    if (!truck) return

    const pendingAmount = pendingAllocations[truckId] || 0
    if (pendingAmount <= 0) return

    const newTransaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'usage',
      amount: pendingAmount,
      timestamp: new Date(),
      truckNumber: truck.truck_number,
      remainingBalance: playgroundState.balance - pendingAmount,
      note: `Allocated to ${truck.truck_number}`
    }

    setPlaygroundState(prev => ({
      ...prev,
      balance: prev.balance - pendingAmount,
      allocations: { 
        ...prev.allocations, 
        [truckId]: (prev.allocations[truckId] || 0) + pendingAmount
      },
      transactions: [...prev.transactions, newTransaction]
    }))

    // Clear pending allocation
    setPendingAllocations(prev => {
      const newPending = { ...prev }
      delete newPending[truckId]
      return newPending
    })
  }

  // Add new function to get truck amounts
  const getTruckWithAmounts = (truck: WorkDetail): TruckWithAmounts => {
    const { totalDue, totalAllocated, balance } = getTruckAllocations(truck, truckPayments)
    return {
      ...truck,
      amounts: {
        total: totalDue,
        allocated: totalAllocated,
        remaining: balance
      }
    }
  }

  // Add new function to calculate totals
  const calculateTotals = () => {
    const filteredTrucks = getFilteredTrucks()
    return filteredTrucks.reduce(
      (acc, truck) => {
        const amounts = getTruckWithAmounts(truck).amounts
        return {
          totalDue: acc.totalDue + amounts.total,
          totalAllocated: acc.totalAllocated + amounts.allocated,
          totalRemaining: acc.totalRemaining + amounts.remaining
        }
      },
      { totalDue: 0, totalAllocated: 0, totalRemaining: 0 }
    )
  }

  // Add new function to calculate owner's total amounts
  const calculateOwnerTotals = () => {
    const ownerTrucks = workDetails.filter(truck => truck.owner === selectedOwner && truck.loaded);
    return ownerTrucks.reduce(
      (acc, truck) => {
        const { totalDue, totalAllocated, balance } = getTruckAllocations(truck, truckPayments)
        return {
          totalDue: acc.totalDue + totalDue,
          totalPaid: acc.totalPaid + totalAllocated,
          totalRemaining: acc.totalRemaining + balance
        }
      },
      { totalDue: 0, totalPaid: 0, totalRemaining: 0 }
    )
  }

  // Add total amounts calculation
  const calculateTotalAmounts = () => {
    return workDetails
      .filter(truck => truck.loaded)
      .reduce((acc, truck) => {
        const { totalDue, totalAllocated, balance } = getTruckAllocations(truck, truckPayments);
        return {
          totalDue: acc.totalDue + totalDue,
          totalPaid: acc.totalPaid + totalAllocated,
          totalRemaining: acc.totalRemaining + balance
        };
      }, { totalDue: 0, totalPaid: 0, totalRemaining: 0 });
  };

  // Update the debug logging useEffect
  useEffect(() => {
    if (!workDetails.length) return // Skip if no data yet
    
    console.log('Work Details:', workDetails)
    console.log('Selected Owner:', selectedOwner)
    console.log('Filtered Trucks:', getFilteredTrucks())
  }, [workDetails, selectedOwner, searchQuery])

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Update header to show totals */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">
              Payment Playground - All Trucks
            </h1>
          </div>
          <div className="text-sm space-x-4">
            <span className="text-muted-foreground">
              Total Due: ${formatNumber(calculateTotalAmounts().totalDue)}
            </span>
            <span className="text-muted-foreground">
              Available: ${formatNumber(playgroundState.balance)}
            </span>
          </div>
        </div>

        {/* Add amounts summary after search */}
        <div className="flex gap-4 items-stretch">
          <div className="w-[200px]">
            <Select value={selectedOwner} onValueChange={setSelectedOwner}>
              <SelectTrigger>
                <SelectValue placeholder="Select owner" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(allTrucks).map(ownerName => (
                  <SelectItem key={ownerName} value={ownerName}>
                    {ownerName} ({allTrucks[ownerName].total})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search trucks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Card className="p-4 flex items-center gap-4">
            <div className="text-sm">
              <div className="font-medium">Total Allocatable:</div>
              <div className="text-muted-foreground">
                ${formatNumber(calculateTotals().totalRemaining)}
              </div>
            </div>
          </Card>
        </div>

        {/* Add owner stats */}
        <OwnerStats />

        {/* Add debug info */}
        <div className="mb-4 p-4 bg-muted/10 rounded-lg">
          <p className="text-sm text-muted-foreground">
            Total trucks: {workDetails.length} | 
            Loaded trucks: {workDetails.filter(t => t.loaded).length} |
            Filtered trucks: {getFilteredTrucks().length}
          </p>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column - Controls & History */}
          <div className="space-y-6">
            {/* Deposit Section */}
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">Add Deposit</h2>
              <div className="space-y-4">
                <div>
                  <Label>Amount</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(Number(e.target.value))}
                      className="text-lg"
                    />
                    <Button 
                      onClick={() => handleAddDeposit(totalAmount)}
                      disabled={totalAmount <= 0}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Transaction History */}
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {playgroundState.transactions.map((transaction) => (
                  <div 
                    key={transaction.id}
                    className={cn(
                      "p-3 border rounded-lg",
                      transaction.type === 'deposit' ? 'bg-emerald-50/50' : 'bg-blue-50/50'
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={cn(
                          "text-xs font-medium px-2 py-1 rounded-full",
                          transaction.type === 'deposit' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-blue-100 text-blue-700'
                        )}>
                          {transaction.type === 'deposit' ? 'Deposit' : 'Payment'}
                        </span>
                        <div className="mt-1 font-medium">
                          {transaction.type === 'deposit' ? '+' : '-'}${formatNumber(transaction.amount)}
                        </div>
                        {transaction.truckNumber && (
                          <div className="text-sm text-muted-foreground">
                            Truck: {transaction.truckNumber}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          {transaction.timestamp.toLocaleTimeString()}
                        </div>
                        <div className="font-medium text-sm">
                          Balance: ${formatNumber(transaction.remainingBalance)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {playgroundState.transactions.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No transactions yet
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Update right column truck display */}
          <div className="space-y-6">
            <Card className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  Allocate Payments 
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({getFilteredTrucks().length} trucks)
                  </span>
                </h2>
                <div className="text-sm text-muted-foreground">
                  Total Due: ${formatNumber(calculateTotals().totalDue)}
                </div>
              </div>
              
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {getFilteredTrucks().length > 0 ? (
                  getFilteredTrucks().map(truck => {
                    const truckWithAmounts = getTruckWithAmounts(truck)
                    const committedAllocation = playgroundState.allocations[truck.id] || 0
                    const pendingAllocation = pendingAllocations[truck.id] || 0
                    const remainingAfterAllocation = truckWithAmounts.amounts.remaining - committedAllocation
                    const remainingAfterPending = remainingAfterAllocation - pendingAllocation

                    // Don't show fully paid trucks
                    if (remainingAfterAllocation <= 0) return null

                    return (
                      <div
                        key={truck.id}
                        className={cn(
                          "flex items-center gap-4 p-3 border rounded-lg",
                          committedAllocation > 0 && "bg-emerald-50/50",
                          pendingAllocation > 0 && "bg-blue-50/50"
                        )}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{truck.truck_number}</span>
                            <span className="text-sm px-2 py-1 rounded-full bg-muted">
                              {truck.owner}
                            </span>
                          </div>
                          <div className="text-sm space-x-2">
                            <span className="text-muted-foreground">
                              Due: ${formatNumber(truckWithAmounts.amounts.total)}
                            </span>
                            <span>•</span>
                            <span className="text-muted-foreground">
                              Paid: ${formatNumber(truckWithAmounts.amounts.allocated)}
                            </span>
                            <span>•</span>
                            <span className="font-medium text-orange-500">
                              Balance: ${formatNumber(remainingAfterAllocation)}
                            </span>
                          </div>
                          {(committedAllocation > 0 || pendingAllocation > 0) && (
                            <div className="text-sm mt-1">
                              {committedAllocation > 0 && (
                                <span className="text-emerald-600">
                                  Allocated: ${formatNumber(committedAllocation)}
                                </span>
                              )}
                              {pendingAllocation > 0 && (
                                <>
                                  {committedAllocation > 0 && <span className="mx-2">•</span>}
                                  <span className="text-blue-600">
                                    Pending: ${formatNumber(pendingAllocation)}
                                  </span>
                                  <ArrowRight className="inline-block h-3 w-3 mx-1" />
                                  <span className={remainingAfterPending <= 0 ? "text-emerald-600" : "text-orange-500"}>
                                    Will remain: ${formatNumber(remainingAfterPending)}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 items-center">
                          <div className="flex gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={Math.min(remainingAfterAllocation, playgroundState.balance)}
                              value={pendingAllocation || ''}
                              onChange={(e) => {
                                const amount = Number(e.target.value)
                                if (isNaN(amount)) return
                                handleTruckAllocation(truck.id, amount)
                              }}
                              className={cn(
                                "w-32",
                                pendingAllocation > 0 && "border-blue-500 focus-visible:ring-blue-500"
                              )}
                              placeholder="Amount"
                            />
                            {pendingAllocation > 0 && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleCommitAllocation(truck.id)}
                                className="text-emerald-600 hover:text-emerald-700"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          {committedAllocation > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setPlaygroundState(prev => {
                                  const newAllocations = { ...prev.allocations }
                                  delete newAllocations[truck.id]
                                  return {
                                    ...prev,
                                    balance: prev.balance + committedAllocation,
                                    allocations: newAllocations,
                                    transactions: [
                                      ...prev.transactions,
                                      {
                                        id: Math.random().toString(36).substr(2, 9),
                                        type: 'deposit',
                                        amount: committedAllocation,
                                        timestamp: new Date(),
                                        truckNumber: truck.truck_number,
                                        remainingBalance: prev.balance + committedAllocation,
                                        note: `Reversed allocation for ${truck.truck_number}`
                                      }
                                    ]
                                  }
                                })
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center p-8 border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground">
                      {workDetails.length === 0 
                        ? "No trucks found. Please check the database connection."
                        : searchQuery 
                          ? "No trucks match your search criteria."
                          : "No loaded trucks found for this owner."}
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Add pending trucks section */}
            {ownerTrucks.pending.length > 0 && (
              <Card className="p-4 border-dashed">
                <h2 className="text-lg font-semibold mb-4 text-orange-500">Pending Trucks</h2>
                <div className="space-y-2">
                  {ownerTrucks.pending.map(truck => (
                    <div
                      key={truck.id}
                      className="flex items-center gap-4 p-3 border rounded-lg bg-orange-50/50"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{truck.truck_number}</div>
                        <div className="text-sm text-muted-foreground">
                          Status: {truck.status || 'Pending'} • Product: {truck.product}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
