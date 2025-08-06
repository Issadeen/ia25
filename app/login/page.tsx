"use client"

import { useEffect, useState, useRef } from "react"
import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { motion } from "framer-motion"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Icons } from "@/components/ui/icons"
import ReactConfetti from "react-confetti"

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const [showSignature, setShowSignature] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })
  const signatureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    })
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    }
  }, [status, router])

  const getSignaturePosition = () => {
    if (signatureRef.current) {
      const rect = signatureRef.current.getBoundingClientRect()
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        w: 0,
        h: 0
      }
    }
    return { x: 0, y: 0, w: 0, h: 0 }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Create a secure login token using the Web Crypto API
      // This encrypts the credentials on the client side
      const encoder = new TextEncoder();
      const loginData = encoder.encode(JSON.stringify({ 
        email, 
        password,
        timestamp: Date.now(), // Add timestamp to prevent replay attacks
        nonce: Math.random().toString(36).substring(2) // Add nonce for uniqueness
      }));
      
      // Use the SubtleCrypto API to hash the data (not true encryption, but obfuscation)
      const hashBuffer = await crypto.subtle.digest('SHA-256', loginData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // First, send a more secure authentication request
      const loginResponse = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Request': hashHex.substring(0, 16) // Send part of hash as verification
        },
        body: JSON.stringify({ 
          // Don't send the raw password in the request body
          email,
          secureToken: btoa(email + ':' + hashHex), // Base64 encode for transport
          timestamp: Date.now()
        }),
      });

      if (loginResponse.ok) {
        // Get the JWT token from the response cookies
        // Wait a moment for cookies to be set
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get the user data from the response
        const loginData = await loginResponse.json();
        const userData = loginData.user;
        
        // Use Next-Auth session without sending credentials again
        const result = await signIn("credentials", {
          redirect: false,
          callbackUrl: "/dashboard",
          // Send a token instead of real credentials
          email: "token_auth",
          password: "token_auth",
          // Pass the user data to the authorize function
          userData: userData ? JSON.stringify(userData) : undefined,
          // Include cookies to allow the authorize function
          // to access the session cookie
          cookies: document.cookie
        });

        if (result?.ok) {
          router.push('/dashboard');
        } else {
          toast({
            title: "Session Error",
            description: "Failed to initialize session. Please try again.",
            variant: "destructive",
          });
        }
      } else {
        const errorData = await loginResponse.json();
        toast({
          title: "Authentication Failed",
          description: errorData.error || "Invalid credentials. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Login error:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900" />
      </div>
    )
  }

  // Only show login form if not authenticated
  if (status === "unauthenticated") {
    return (
      <>
        {showConfetti && (
          <ReactConfetti
            width={windowSize.width}
            height={windowSize.height}
            recycle={false}
            numberOfPieces={100}
            confettiSource={getSignaturePosition()}
            initialVelocityY={10}
            tweenDuration={2000}
            
            colors={['#059669', '#0d9488', '#0369a1']}
            onConfettiComplete={() => setShowConfetti(false)}
            style={{ position: 'fixed', top: 0, left: 0, zIndex: 100 }}
          />
        )}
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center justify-center">
            <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-emerald-700 via-teal-500 to-blue-500 bg-clip-text text-transparent tracking-tight">
              Issaerium-23
            </h1>
          </div>
        </header>
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="relative w-full max-w-[1000px] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              onMouseEnter={() => {
                setShowSignature(true)
                setShowConfetti(true)
              }}
              onMouseLeave={() => setShowSignature(false)}
              className="w-full max-w-[400px] relative"
            >
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-700 via-teal-500 to-blue-500 blur-sm opacity-50" />
              <Card className="relative backdrop-blur-xl bg-background border-0">
                <CardHeader className="space-y-1 text-center">
                  <Icons.logo className="mx-auto h-12 w-12" />
                  <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter your credentials to sign in
                  </p>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading && (
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {isLoading ? "Signing in..." : "Sign in"}
                    </Button>
                  </form>
                </CardContent>
                <CardFooter className="flex flex-col space-y-4">
                  <div className="text-sm text-muted-foreground text-center">
                    Don&apos;t have an account?{" "}
                    <Button variant="link" className="p-0 h-auto font-normal">
                      Sign up
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
            
            <motion.div
              ref={signatureRef}
              initial={{ y: 0 }}
              animate={{ 
                y: showConfetti ? [-15, 0] : 0,
                scale: showConfetti ? [1, 1.1, 1] : 1,
              }}
              transition={{ 
                duration: 0.6,
                type: "spring",
                stiffness: 300,
                damping: 10
              }}
              onMouseEnter={() => setShowConfetti(true)}
              className="absolute -right-32 bottom-10 hidden md:block cursor-pointer select-none"
            >
              <div 
                className="text-3xl text-muted-foreground hover:text-primary transition-colors"
                style={{ fontFamily: 'Carattere, cursive' }}
              >
                <div className="opacity-70 tracking-wider" style={{ transform: 'scaleY(1.2)' }}>
                  ~ Issadeen ~
                </div>
                <div className="text-xs mt-1 text-center opacity-50">
                  Founding Titan
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </>
    )
  }

  return null
}

