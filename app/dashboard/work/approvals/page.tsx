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
import { ArrowLeft, Loader2, Check, X, FileText, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface GatePassApproval {
  id: string;
  truckId: string;
  requestedAt: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  orderNo: string;
  truckNumber: string;
  driverDetails?: {
    name: string;
    phone: string;
  };
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
    try {
      await update(ref(database, `gatepass_approvals/${approval.id}`), {
        status: 'rejected'
      })
      toast({
        title: "Rejected",
        description: `Gate pass for ${approval.truckNumber} rejected`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject gate pass",
        variant: "destructive"
      })
    }
  }

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
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/dashboard/work')}
                className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Gate Pass Approvals
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Avatar className="h-8 w-8 ring-2 ring-pink-500/50">
                <AvatarImage src={session?.user?.image || profilePicUrl || ''} alt="Profile" />
                <AvatarFallback className="bg-pink-100 text-pink-700">
                  {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8 pt-24 space-y-6">
        <div className="grid gap-4">
          {pendingApprovals.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 text-muted-foreground"
            >
              No pending approvals
            </motion.div>
          ) : (
            pendingApprovals.map((approval) => {
              const gatePassInfo = getGatePassInfo(approval.truckNumber);
              return (
                <motion.div
                  key={approval.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className={cn(
                    "p-4 shadow-lg border-muted/20",
                    gatePassInfo && "border-l-4 border-l-amber-500"
                  )}>
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold text-lg">
                            Truck: {approval.truckNumber}
                          </h2>
                          {gatePassInfo && (
                            <div className="flex items-center gap-1 text-amber-600 text-xs bg-amber-50 px-2 py-1 rounded-full">
                              <AlertTriangle className="h-3 w-3" />
                              Previously generated {gatePassInfo.count} time(s)
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Order: {approval.orderNo}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Requested by: {approval.requestedBy}
                        </p>
                        {approval.driverDetails && (
                          <div className="mt-2 space-y-1 bg-muted/50 p-2 rounded-lg">
                            <p className="text-sm font-medium">Driver Details:</p>
                            <p className="text-sm">{approval.driverDetails.name}</p>
                            <p className="text-sm">{approval.driverDetails.phone}</p>
                          </div>
                        )}
                        {gatePassInfo && (
                          <p className="text-xs text-amber-600">
                            Last generated: {gatePassInfo.lastGenerated}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApprove(approval)}
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(approval)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  )
}
