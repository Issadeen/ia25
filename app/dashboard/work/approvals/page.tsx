'use client'

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTheme } from 'next-themes'
import { database } from "@/lib/firebase"
import { ref, onValue, update, get } from "firebase/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { motion } from "framer-motion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useProfileImage } from '@/hooks/useProfileImage'
import { ArrowLeft, Loader2, Check, X, FileText, AlertTriangle, Search, Clock, CheckSquare, Volume2, VolumeX, Sun, Moon } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

interface ApprovalHistory {
  id: string;
  truckNumber: string;
  status: 'approved' | 'rejected' | 'expired';
  timestamp: string;
  rejectionReason?: string;
  requestedBy: string;
}

interface ApprovalStats {
  total: number;
  approved: number;
  rejected: number;
  expired: number;
  averageResponseTime: number;
}

export default function ApprovalsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
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
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistory[]>([])
  const [approvalStats, setApprovalStats] = useState<ApprovalStats>({
    total: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    averageResponseTime: 0
  })
  const [activeTab, setActiveTab] = useState('pending')
  const [isMuted, setIsMuted] = useState(() => {
    // Check localStorage for saved preference
    if (typeof window !== 'undefined') {
      return localStorage.getItem('approvalsSoundMuted') === 'true'
    }
    return false
  })

  // Add rejection templates
  const rejectionTemplates = [
    "Invalid driver information",
    "Expired request",
    "Incorrect truck details",
    "Documentation incomplete",
    "Payment pending"
  ]

  // Update playConfirmationSound to respect mute setting
  const playConfirmationSound = () => {
    if (isMuted) return;
    
    const audio = new Audio('/sounds/confirmation.mp3');
    audio.volume = 0.5; // Set volume to 50%
    
    // Only play if user has interacted with the page
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.log("Audio playback failed:", error);
      });
    }
  };

  // Add handler for mute toggle
  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStorage.setItem('approvalsSoundMuted', newMuted.toString());
    
    toast({
      title: newMuted ? "Sound Muted" : "Sound Unmuted",
      description: newMuted ? "Notification sounds are now muted" : "Notification sounds are now active",
    });
  };

  // Add keyboard shortcuts
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (e.key === 'a' && e.ctrlKey) {
      // Quick approve focused item
    } else if (e.key === 'r' && e.ctrlKey) {
      // Quick reject focused item
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress])

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

  useEffect(() => {
    if (!isVerified) return

    const historyRef = ref(database, 'gatepass_history')
    const unsubscribe = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const history = Object.values(snapshot.val()) as ApprovalHistory[]
        setApprovalHistory(history)
        
        // Calculate stats
        const stats = history.reduce((acc, item) => {
          acc.total++
          acc[item.status]++
          return acc
        }, { total: 0, approved: 0, rejected: 0, expired: 0, averageResponseTime: 0 })
        
        setApprovalStats(stats)
      }
    })

    return () => unsubscribe()
  }, [isVerified])

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const response = await fetch('/api/auth/verify-approver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workId }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setIsVerified(true);
        toast({
          title: "Verified",
          description: "Identity verified successfully",
        });
      } else {
        throw new Error(result.error || 'Verification failed');
      }
    } catch (error) {
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Add function to verify driver info
  const verifyDriverDetails = async (approval: GatePassApproval) => {
    if (!approval.driverDetails?.phone) return false;
  
    try {
      // Check driver record in database
      const driverRef = ref(database, `drivers/${approval.driverDetails.phone}`);
      const snapshot = await get(driverRef);
      
      if (snapshot.exists()) {
        const driverData = snapshot.val();
        // Verify if this truck is associated with this driver
        return driverData.trucks.includes(approval.truckNumber);
      }
      return false;
    } catch (error) {
      console.error('Driver verification error:', error);
      return false;
    }
  };

  // Update handleApprove to include driver verification
  const handleApprove = async (approval: GatePassApproval) => {
    try {
      // Verify driver details if they exist
      if (approval.driverDetails) {
        const isDriverVerified = await verifyDriverDetails(approval);
        if (!isDriverVerified) {
          toast({
            title: "Verification Failed",
            description: "Driver details do not match our records",
            variant: "destructive"
          });
          return;
        }
      }
  
      // Update approval status
      const updates: { [key: string]: any } = {
        [`gatepass_approvals/${approval.id}/status`]: 'approved',
        [`gatepass_approvals/${approval.id}/respondedAt`]: new Date().toISOString(),
        [`gatepass_approvals/${approval.id}/approvedBy`]: session?.user?.name,
      };
  
      // Also update the work detail to mark gate pass as generated
      updates[`work_details/${approval.truckId}/gatePassGenerated`] = true;
      updates[`work_details/${approval.truckId}/gatePassGeneratedAt`] = new Date().toISOString();
  
      // Apply all updates atomically
      await update(ref(database), updates);
  
      playConfirmationSound();
      toast({
        title: "Approved",
        description: `Gate pass for ${approval.truckNumber} approved`,
      });
    } catch (error) {
      console.error('Approval error:', error);
      toast({
        title: "Error",
        description: "Failed to approve gate pass",
        variant: "destructive"
      });
    }
  };

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
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Approvals
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
            >
              {isMuted ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
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
        <Tabs defaultValue="pending" className="w-full" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending">
              Pending ({pendingApprovals.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              History ({approvalHistory.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
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
          </TabsContent>

          <TabsContent value="history">
            <div className="grid gap-4">
              {/* Stats Card */}
              <Card className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Processed</p>
                    <p className="text-2xl font-bold">{approvalStats.total}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-emerald-600">Approved</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {approvalStats.approved}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-red-600">Rejected</p>
                    <p className="text-2xl font-bold text-red-600">
                      {approvalStats.rejected}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-amber-600">Expired</p>
                    <p className="text-2xl font-bold text-amber-600">
                      {approvalStats.expired}
                    </p>
                  </div>
                </div>
              </Card>

              {/* History List */}
              {approvalHistory.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{item.truckNumber}</h3>
                      <p className="text-sm text-muted-foreground">
                        By: {item.requestedBy}
                      </p>
                      {item.rejectionReason && (
                        <p className="text-sm text-red-600 mt-2">
                          Reason: {item.rejectionReason}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        item.status === 'approved' ? 'default' :
                        item.status === 'rejected' ? 'destructive' : 'secondary'
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
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
