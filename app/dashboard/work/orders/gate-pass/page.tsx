'use client'

import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { database } from "@/lib/firebase"
import { ref, onValue } from "firebase/database"
import { ArrowLeft, Clock, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"
import { GatePassForm } from "@/components/ui/molecules/GatePassForm"
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from "@/components/ui/toaster"
import { useProfileImage } from '@/hooks/useProfileImage'
import { useIdleTimer } from 'react-idle-timer'
import { toast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertTriangle } from "lucide-react"

export default function GatePassPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [isApproved, setIsApproved] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const approvalId = searchParams.get('approvalId')
  const profilePicUrl = useProfileImage()
  const IDLE_TIMEOUT = 80000 // 1 minute 20 seconds in milliseconds

  // Add ref to track redirection status
  const redirectingRef = useRef(false);

  // Add a countdown timer state
  const [timeLeft, setTimeLeft] = useState(IDLE_TIMEOUT / 1000)

  // Add new states for security dialog
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [sessionWarningShown, setSessionWarningShown] = useState(false);
  const [isUserActive, setIsUserActive] = useState(true);

  // Update countdown effect with fixed redirect handling
  useEffect(() => {
    if (!isApproved) return;

    let timer: NodeJS.Timeout;
    let hardTimeout: NodeJS.Timeout;

    const startCountdown = () => {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          const newTime = prev - 1;
          if (newTime <= 0 && !redirectingRef.current) {
            redirectingRef.current = true;
            clearInterval(timer);
            clearTimeout(hardTimeout);
            
            // Handle timeout in a separate effect
            setTimeout(() => {
              toast({
                title: "Session Expired",
                description: "Redirecting to dashboard due to timeout",
                variant: "destructive"
              });
              router.push('/dashboard/work');
            }, 0);
            
            return 0;
          }
          return newTime;
        });
      }, 1000);

      // Set a hard timeout as backup
      hardTimeout = setTimeout(() => {
        if (!redirectingRef.current) {
          redirectingRef.current = true;
          clearInterval(timer);
          router.push('/dashboard/work');
        }
      }, IDLE_TIMEOUT);
    };

    startCountdown();

    return () => {
      clearInterval(timer);
      clearTimeout(hardTimeout);
    };
  }, [isApproved, router, IDLE_TIMEOUT]);

  // Update idle timer with fixed redirect handling
  useIdleTimer({
    timeout: IDLE_TIMEOUT,
    onIdle: () => {
      if (!redirectingRef.current) {
        redirectingRef.current = true;
        // Handle idle timeout in a separate effect
        setTimeout(() => {
          toast({
            title: "Session Expired",
            description: "Redirecting to dashboard due to inactivity",
            variant: "destructive"
          });
          router.push('/dashboard/work');
        }, 0);
      }
    },
    debounce: 500,
    crossTab: true,
    leaderElection: true,
    syncTimers: 100
  });

  // Add user activity tracking
  useEffect(() => {
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    const handleUserActivity = () => {
      setIsUserActive(true);
      setSessionWarningShown(false);
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleUserActivity);
    });

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, []);

  // Add session warning
  useEffect(() => {
    if (!isApproved) return;

    const warningTimer = setTimeout(() => {
      if (!sessionWarningShown && timeLeft <= 30) {
        setSessionWarningShown(true);
        setShowSecurityDialog(true);
        playWarningSound();
      }
    }, (IDLE_TIMEOUT - 30000)); // Show warning 30 seconds before timeout

    return () => clearTimeout(warningTimer);
  }, [isApproved, timeLeft, sessionWarningShown]);

  // Add warning sound
  const playWarningSound = () => {
    const audio = new Audio('/sounds/warning.mp3');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  };

  // Add function to extend session
  const extendSession = () => {
    if (redirectingRef.current) return;
    setTimeLeft(IDLE_TIMEOUT / 1000);
    setSessionWarningShown(false);
    setShowSecurityDialog(false);
    toast({
      title: "Session Extended",
      description: "Your session has been extended by 1 minute 20 seconds",
    });
  };

  // Add printability check
  useEffect(() => {
    const handlePrint = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === 'p') || (e.metaKey && e.key === 'p')) {
        e.preventDefault();
        toast({
          title: "Print Restricted",
          description: "Printing is disabled for security reasons",
          variant: "destructive"
        });
      }
    };

    window.addEventListener('keydown', handlePrint);
    return () => window.removeEventListener('keydown', handlePrint);
  }, []);

  // Add copy protection
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      toast({
        title: "Copy Restricted",
        description: "Copying is disabled for security reasons",
        variant: "destructive"
      });
    };

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, []);

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  // Add approval check
  useEffect(() => {
    if (!approvalId) {
      router.push('/dashboard/work/orders')
      return
    }

    const approvalRef = ref(database, `gatepass_approvals/${approvalId}`)
    const unsubscribe = onValue(approvalRef, (snapshot) => {
      setIsLoading(false)
      if (!snapshot.exists()) {
        router.push('/dashboard/work/orders')
        return
      }

      const approval = snapshot.val()
      if (approval.status === 'approved') {
        setIsApproved(true)
      } else if (approval.status === 'rejected') {
        router.push('/dashboard/work/orders')
      }
    })

    return () => unsubscribe()
  }, [approvalId, router])

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Waiting for Approval</h1>
          <p className="text-muted-foreground">
            Your gate pass request is pending approval.
          </p>
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/work/orders')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return to Orders
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
      <div className="w-full">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          {/* Left side */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard/work/orders')}
              className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Gate Pass Generator
            </h1>
          </div>
          {/* Right side */}
          <div className="flex items-center gap-4">
            <Badge 
              variant="outline" 
              className={cn(
                "transition-colors",
                timeLeft <= 20 && "bg-red-100 dark:bg-red-900/20 text-red-600 animate-pulse"
              )}
            >
              <Clock className="mr-1 h-3 w-3" />
              {Math.floor(timeLeft)}s
            </Badge>
            <ThemeToggle />
            <Avatar
              className="h-8 w-8 ring-2 ring-pink-500/50 ring-offset-2 ring-offset-background shadow-lg shadow-pink-500/10 transition-shadow hover:ring-pink-500/75"
            >
              <AvatarImage
                src={session?.user?.image || profilePicUrl || ''}
                alt="Profile" />
              <AvatarFallback className="bg-pink-100 text-pink-700">
                {session?.user?.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>

      <div className="container mx-auto py-10 pt-24">
        <GatePassForm />
        <Toaster />
      </div>

      <Dialog open={showSecurityDialog} onOpenChange={setShowSecurityDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Session Expiring Soon
            </DialogTitle>
            <DialogDescription>
              Your session will expire in {timeLeft} seconds due to inactivity.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/dashboard/work')}>
              Exit
            </Button>
            <Button onClick={extendSession}>
              Extend Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @media print {
          body {
            display: none;
          }
        }
      `}</style>
    </ThemeProvider>
  )
}

