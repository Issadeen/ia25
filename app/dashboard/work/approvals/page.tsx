'use client'

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { database } from "@/lib/firebase"
import { ref, onValue, update, get } from "firebase/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { motion } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"
import { useProfileImage } from '@/hooks/useProfileImage'
import { ArrowLeft, Loader2, Check, X, FileText, AlertTriangle, Search, Clock, CheckSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
import { DialogTitle } from "@radix-ui/react-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"


interface GatePassApproval {
  id: string;
  truckId: string;
  requestedAt: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  orderNo: string;
  truckNumber: string;
  owner: string; // Add owner field
  rejectionReason?: string; // Add rejection reason field
  driverDetails?: {
    name: string;
    phone: string;
  };
  expiresAt?: string; // Add expiration field
}

interface WorkDetail {
  id: string;
  owner: string;
  truck_number: string;
  // ...other fields...
}

export default function ApprovalsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [workId, setWorkId] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState<GatePassApproval[]>([])
  const [gatePassHistory, setGatePassHistory] = useState<{[key: string]: { count: number, lastGenerated: string }}>({})
  const profilePicUrl = useProfileImage()
  const [searchFilter, setSearchFilter] = useState("")
  const [rejectionDialog, setRejectionDialog] = useState<{
    open: boolean;
    approvalId: string | null;
  }>({ open: false, approvalId: null });
  const [rejectionReason, setRejectionReason] = useState("");
  const [countdowns, setCountdowns] = useState<{ [key: string]: number }>({}); // Add countdown state
  const [workDetails, setWorkDetails] = useState<{ [key: string]: WorkDetail }>({});

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (!isVerified) return;

    const approvalsRef = ref(database, 'gatepass_approvals')
    const unsubscribe = onValue(approvalsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const approvals = Object.values(data) as GatePassApproval[]
        setPendingApprovals(approvals.filter(a => a.status === 'pending'))
      }
    })

    return () => unsubscribe()
  }, [isVerified])

  useEffect(() => {
    if (!isVerified) return;

    const historyRef = ref(database, 'gate_pass_history');
    const unsubscribe = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        setGatePassHistory(snapshot.val());
      }
    });

    return () => unsubscribe();
  }, [isVerified]);

  // Add function to calculate remaining time
  const calculateRemainingTime = (expiresAt: string) => {
    const now = new Date().getTime();
    const expiration = new Date(expiresAt).getTime();
    return Math.max(0, Math.floor((expiration - now) / 1000));
  };

  // Add effect to handle countdowns
  useEffect(() => {
    if (!pendingApprovals.length) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const updates: { [key: string]: number } = {};
      let hasExpired = false;

      pendingApprovals.forEach(approval => {
        if (approval.expiresAt) {
          const remaining = calculateRemainingTime(approval.expiresAt);
          updates[approval.id] = remaining;
          
          // If timer expired, remove the approval
          if (remaining <= 0) {
            hasExpired = true;
            update(ref(database, `gatepass_approvals/${approval.id}`), {
              status: 'expired'
            });
          }
        }
      });

      setCountdowns(updates);

      // If any approval expired, show toast
      if (hasExpired) {
        toast({
          title: "Approval Expired",
          description: "One or more approval requests have expired",
          variant: "destructive"
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingApprovals]);

  useEffect(() => {
    if (!isVerified) return;

    const workDetailsRef = ref(database, 'work_details');
    const unsubscribe = onValue(workDetailsRef, (snapshot) => {
      if (snapshot.exists()) {
        setWorkDetails(snapshot.val());
      }
    });

    return () => unsubscribe();
  }, [isVerified]);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      if (!session?.user?.email) {
        throw new Error("No user email found");
      }

      // Get user record from Firebase
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      const users = snapshot.val();
      
      // Find user by email and check workId
      const user = Object.values(users).find((u: any) => 
        u.email === session.user?.email
      ) as { workId: string } | undefined;

      if (!user) {
        throw new Error("User not found");
      }

      if (workId === user.workId) {
        setIsVerified(true);
        // Store verification in sessionStorage
        sessionStorage.setItem('approver_verified', 'true');
        toast({
          title: "Verified",
          description: "You can now manage gate pass approvals",
        });
      } else {
        throw new Error("Invalid Work ID");
      }
    } catch (error) {
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "Invalid work ID",
        variant: "destructive"
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleApprove = async (approval: GatePassApproval) => {
    try {
      await update(ref(database, `gatepass_approvals/${approval.id}`), {
        status: 'approved'
      })
      toast({
        title: "Approved",
        description: `Gate pass for ${approval.truckNumber} approved`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve gate pass",
        variant: "destructive"
      })
    }
  }

  const handleReject = async (approval: GatePassApproval) => {
    setRejectionDialog({ open: true, approvalId: approval.id });
  }

  const handleRejectionConfirm = async () => {
    if (!rejectionDialog.approvalId) return;

    try {
      await update(ref(database, `gatepass_approvals/${rejectionDialog.approvalId}`), {
        status: 'rejected',
        rejectionReason,
        rejectedAt: new Date().toISOString()
      });

      // Notify the requestor (you can implement email/notification system here)
      toast({
        title: "Rejected",
        description: "Gate pass request has been rejected",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject gate pass",
        variant: "destructive"
      });
    } finally {
      setRejectionDialog({ open: false, approvalId: null });
      setRejectionReason("");
    }
  };

  const getSortedApprovals = () => {
    return [...pendingApprovals].sort((a, b) => 
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );
  };

  const getFilteredApprovals = () => {
    return getSortedApprovals().filter(approval => 
      approval.truckNumber.toLowerCase().includes(searchFilter.toLowerCase()) ||
      approval.orderNo.toLowerCase().includes(searchFilter.toLowerCase()) ||
      approval.requestedBy.toLowerCase().includes(searchFilter.toLowerCase())
    );
  };

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted/50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="w-full max-w-md p-6 space-y-4 shadow-lg border-muted/20">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Verify Identity
            </h1>
            <p className="text-sm text-muted-foreground">
              Please enter your work ID to access approvals
            </p>
            <Input
              type="password" // Changed from "text" to "password"
              placeholder="Enter your work ID"
              value={workId}
              onChange={(e) => setWorkId(e.target.value)}
              autoComplete="off"
              className="border-muted/20 font-mono tracking-widest" // Added font-mono and tracking-widest for better masking visualization
            />
            <Button 
              onClick={handleVerify} 
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600"
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </Card>
        </motion.div>
      </div>
    )
  }

  const getGatePassInfo = (truckNumber: string) => {
    const history = gatePassHistory[truckNumber];
    if (!history) return null;
    return {
      count: history.count,
      lastGenerated: new Date(history.lastGenerated).toLocaleDateString(),
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/50">
      {/* Update header to be more compact on mobile */}
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-2 py-2 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push('/dashboard/work')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-sm sm:text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                  Gate Pass Approvals
                </h1>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                <ThemeToggle />
                <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-pink-500/50">
                  <AvatarImage src={session?.user?.image || profilePicUrl || ''} alt="Profile" />
                  <AvatarFallback className="text-xs">
                    {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Update main content area spacing */}
      <div className="container mx-auto py-4 pt-16 sm:py-8 sm:pt-24 space-y-4 sm:space-y-6 px-2 sm:px-6">
        {/* Make the controls more compact on mobile */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <Badge variant="secondary" className="h-6 w-fit text-xs sm:text-sm">
            {pendingApprovals.length} Pending
          </Badge>

          <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-2 top-1/2 h-3 w-3 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-7 sm:pl-8 h-8 sm:h-10 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 sm:h-10">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Sort</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuItem>Newest First</DropdownMenuItem>
                <DropdownMenuItem>Oldest First</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Update approval cards to be more compact on mobile */}
        <div className="grid gap-2 sm:gap-4">
          {getFilteredApprovals().map((approval) => {
            const gatePassInfo = getGatePassInfo(approval.truckNumber);
            const workDetail = Object.values(workDetails).find(
              w => w.truck_number === approval.truckNumber
            );
            const owner = workDetail?.owner || 'Unknown Owner';

            return (
              <motion.div
                key={approval.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className={cn(
                  "p-3 sm:p-4 shadow-lg border-muted/20",
                  gatePassInfo && "border-l-4 border-l-amber-500"
                )}>
                  <div className="space-y-3 sm:space-y-4">
                    {/* Compact header for mobile */}
                    <div className="flex flex-col gap-1 sm:gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm sm:text-base">
                          <span className="font-semibold">{approval.truckNumber}</span>
                          <Badge variant="outline" className="text-xs">
                            {owner}
                          </Badge>
                        </div>
                        {countdowns[approval.id] > 0 && (
                          <Badge variant="secondary" className="text-xs animate-pulse">
                            <Clock className="h-3 w-3 mr-1" />
                            {countdowns[approval.id]}s
                          </Badge>
                        )}
                      </div>

                      {/* Compact info section */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:text-sm text-muted-foreground">
                        <p>Order: {approval.orderNo}</p>
                        <p>By: {approval.requestedBy}</p>
                        {gatePassInfo && (
                          <p className="col-span-2 text-amber-600">
                            <AlertTriangle className="inline h-3 w-3 mr-1" />
                            {gatePassInfo.count} previous {gatePassInfo.count === 1 ? 'generation' : 'generations'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Compact driver details */}
                    {approval.driverDetails && (
                      <div className="bg-muted/50 p-2 rounded text-xs sm:text-sm">
                        <div className="grid grid-cols-2 gap-1">
                          <p>{approval.driverDetails.name}</p>
                          <p>{approval.driverDetails.phone}</p>
                        </div>
                      </div>
                    )}

                    {/* Compact action buttons */}
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApprove(approval)}
                        className="h-8 px-2 text-emerald-600"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(approval)}
                        className="h-8 px-2 text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Add Rejection Dialog */}
      <Dialog 
        open={rejectionDialog.open} 
        onOpenChange={() => setRejectionDialog({ open: false, approvalId: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Gate Pass Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for Rejection</Label>
              <Textarea
                placeholder="Enter reason for rejection..."
                value={rejectionReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRejectionDialog({ open: false, approvalId: null })}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectionConfirm}
                disabled={!rejectionReason}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
