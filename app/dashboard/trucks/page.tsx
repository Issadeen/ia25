'use client'

import { getFirebaseAuth, getFirebaseStorage, getFirebaseDatabase } from '@/lib/firebase'
import { signInWithCustomToken } from 'firebase/auth'
import type { FirebaseStorage } from 'firebase/storage'
import type { Database } from 'firebase/database'
import { ref as storageRef, getDownloadURL } from 'firebase/storage'
import { ref as databaseRef, onValue, remove, get } from 'firebase/database'
import React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from "next-auth/react"
import { useRouter } from 'next/navigation'
import { useTheme } from "next-themes"
import { Truck, Copy, Edit, Trash2, ArrowLeft, Check, ArrowUp, Moon, Sun } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast"
import type { Engine } from "tsparticles-engine"
import Particles from "react-tsparticles"
import { loadSlim } from "tsparticles-slim"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"

// Add the ParticlesBackground component from dashboard
const ParticlesBackground = () => {
  const { theme } = useTheme()
  
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine)
  }, [])

  return (
    <Particles
      id="tsparticles"
      init={particlesInit}
      options={{
        background: {
          opacity: 0
        },
        particles: {
          number: { value: 50, density: { enable: true, value_area: 800 } }, // reduced from 80
          color: { value: theme === 'dark' ? "#3b82f680" : "#60a5fa40" }, // more blue, less opacity
          shape: { type: "circle" },
          opacity: { value: 0.3, random: false }, // reduced from 0.5
          size: { value: 2, random: true }, // reduced from 3
          links: {
            enable: true,
            distance: 150,
            color: theme === 'dark' ? "#3b82f650" : "#60a5fa30", // more blue, less opacity
            opacity: 0.2, // reduced from 0.4
            width: 1
          },
          move: {
            enable: true,
            speed: 1, // reduced from 2
            direction: "none",
            random: false,
            straight: false,
            outModes: "out"
          }
        },
        interactivity: {
          detectsOn: "canvas",
          events: {
            onHover: { enable: true, mode: "repulse" },
            onClick: { enable: true, mode: "push" },
            resize: true
          },
          modes: {
            repulse: { distance: 100, duration: 0.4 },
            push: { particles_nb: 2 } // reduced from 4
          }
        },
        retina_detect: true
      }}
      className="!fixed !inset-0" // Changed from fixed inset-0 -z-10
      style={{ 
        position: 'fixed',
        zIndex: 1,
        pointerEvents: 'none'
      }}
    />
  )
}

// Move interfaces outside the component
interface TruckDetail {
  id: string;
  truck_no: string;
  driver: string;
  transporter: string;
  ago_comp_1: string;
  ago_comp_2: string;
  ago_comp_3: string;
  ago_comp_4: string;
  ago_comp_5?: string;
  ago_comp_6?: string;
  ago_comp_7?: string;
  pms_1: string;
  pms_2: string;
  pms_3: string;
  pms_4: string;
  pms_5?: string;
  pms_6?: string;
  pms_7?: string;
}

// Move TruckCard component outside
const TruckCard: React.FC<{ truck: TruckDetail, onDelete: (key: string) => void, onEdit: (key: string) => void }> = ({ truck, onDelete, onEdit }) => {
  const [copied, setCopied] = useState(false)
  const { theme } = useTheme()

  const calculateTotal = (values: (string | undefined)[]) => {
    return values.reduce((acc, val) => acc + (parseFloat(val || '0') || 0), 0).toFixed(1)
  }

  const handleCopy = () => {
    const agoValues = [truck.ago_comp_1, truck.ago_comp_2, truck.ago_comp_3, truck.ago_comp_4, truck.ago_comp_5, truck.ago_comp_6, truck.ago_comp_7].filter(Boolean)
    const pmsValues = [truck.pms_1, truck.pms_2, truck.pms_3, truck.pms_4, truck.pms_5, truck.pms_6, truck.pms_7].filter(Boolean)
    
    const formattedText = [
      `${truck.truck_no}`,
      `Driver: ${truck.driver}`,
      `Transporter: ${truck.transporter}`,
      `AGO Comp: ${agoValues.join(', ')} (Total: ${calculateTotal(agoValues)})`,
      `PMS: ${pmsValues.join(', ')} (Total: ${calculateTotal(pmsValues)})`
    ].join('\n')

    navigator.clipboard.writeText(formattedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const agoValues = [truck.ago_comp_1, truck.ago_comp_2, truck.ago_comp_3, truck.ago_comp_4, truck.ago_comp_5, truck.ago_comp_6, truck.ago_comp_7].filter(Boolean)
  const pmsValues = [truck.pms_1, truck.pms_2, truck.pms_3, truck.pms_4, truck.pms_5, truck.pms_6, truck.pms_7].filter(Boolean)

  return (
    <Card className={`group relative z-[5] hover:scale-105 transition-all duration-300
      ${theme === 'dark' 
        ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 hover:shadow-blue-500/20' 
        : 'bg-gradient-to-br from-white to-gray-100 border-gray-200 hover:shadow-blue-500/10'
      }`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className={`text-sm font-medium ${
          theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
        }`}>{truck.truck_no}</CardTitle>
        <div className={`rounded-full p-2 transition-colors duration-300 ${
          theme === 'dark' 
            ? 'bg-blue-500/20 group-hover:bg-blue-500/30' 
            : 'bg-blue-100 group-hover:bg-blue-200'
        }`}>
          <Truck className="h-4 w-4 text-blue-500" />
        </div>
      </CardHeader>
      <CardContent className={`p-6 text-xs ${
        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
      }`}>
        <p className="font-medium">Driver: {truck.driver}</p>
        <p className="font-medium">Transporter: {truck.transporter}</p>
        <p className="font-medium mt-2">
          AGO Comp: {agoValues.join(', ')} (Total: {calculateTotal(agoValues)})
        </p>
        <p className="font-medium">
          PMS: {pmsValues.join(', ')} (Total: {calculateTotal(pmsValues)})
        </p>
        <div className="flex space-x-2 mt-4">
          <Button variant="outline" size="icon" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(truck.id);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => onDelete(truck.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Add LoadingCard component
const LoadingCard = () => {
  const { theme } = useTheme()
  
  return (
    <Card className={`group relative ${
      theme === 'dark' 
        ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700' 
        : 'bg-gradient-to-br from-white to-gray-100 border-gray-200'
    }`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-[200px] bg-gray-200 dark:bg-gray-700" />
        <Skeleton className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-[160px] bg-gray-200 dark:bg-gray-700" />
          <Skeleton className="h-4 w-[140px] bg-gray-200 dark:bg-gray-700" />
          <Skeleton className="h-4 w-[180px] bg-gray-200 dark:bg-gray-700" />
          <Skeleton className="h-4 w-[200px] bg-gray-200 dark:bg-gray-700" />
          <Skeleton className="h-4 w-[160px] bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex space-x-2 mt-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-8 bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Make sure this is properly declared as a React component
const TruckDetails: React.FC = () => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme() // Ensure setTheme is destructured
  const { toast } = useToast()
  const [trucks, setTrucks] = useState<TruckDetail[]>([])
  const [showScrollToTop, setShowScrollToTop] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true) // Add loading state
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Add mounted state
  useEffect(() => {
    setMounted(true)
  }, [])

  // Add session check
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  // Add Firebase authentication effect
  useEffect(() => {
    const initializeAuth = async () => {
      if (!session?.user?.email) return;

      try {
        const auth = getFirebaseAuth();
        if (!auth) {
          throw new Error('Firebase auth is not initialized');
        }

        const response = await fetch('/api/auth/firebase-token');
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get Firebase token: ${errorText}`);
        }

        const { customToken } = await response.json();
        if (!customToken) {
          throw new Error('Custom token is missing in the response');
        }

        await signInWithCustomToken(auth, customToken);
        setAuthInitialized(true);
      } catch (error) {
        console.error('Firebase auth error:', error);
        setError(error instanceof Error ? error.message : 'Authentication failed');
      }
    };

    initializeAuth();
  }, [session?.user?.email]);

  // Update the data fetching effect with better error handling
  useEffect(() => {
    if (!authInitialized) return;

    const database = getFirebaseDatabase();
    if (!database) {
      setError('Database not initialized');
      setIsLoading(false);
      return;
    }
    
    try {
      const trucksRef = databaseRef(database, 'trucks');
      const unsubscribe = onValue(trucksRef, 
        (snapshot) => {
          try {
            const data = snapshot.val();
            if (data) {
              const truckList = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
              }));
              setTrucks(truckList);
            } else {
              setTrucks([]); // Set empty array if no data
            }
          } catch (err) {
            console.error('Error processing trucks data:', err);
            setError('Error loading trucks');
          } finally {
            setIsLoading(false);
          }
        },
        (error) => {
          console.error('Database error:', error);
          setError('Error connecting to database');
          setIsLoading(false);
        }
      );

      // Cleanup subscription
      return () => unsubscribe();
    } catch (err) {
      console.error('Setup error:', err);
      setError('Error setting up database connection');
      setIsLoading(false);
    }
  }, [authInitialized]);

  // Add this single effect for profile picture handling
  useEffect(() => {
    const fetchImageUrl = async () => {
      const userEmail = session?.user?.email
      if (!userEmail || session?.user?.image) return;

      const storage = getFirebaseStorage();
      if (!storage) return;

      try {
        const filename = `${userEmail}.jpg`
        const imageRef = storageRef(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        console.log('Profile image not found:', error)
      }
    }

    fetchImageUrl()
  }, [session?.user?.email, session?.user?.image])

  const handleDelete = async (key: string) => {
    if (!session?.user?.email) {
      toast({
        title: "Error",
        description: "You must be logged in to delete",
        variant: "destructive"
      });
      return;
    }

    const database = getFirebaseDatabase();
    if (!database) {
      toast({
        title: "Error",
        description: "Database not initialized",
        variant: "destructive"
      });
      return;
    }

    try {
      const userInput = prompt("Please enter your work ID to confirm deletion:");
      if (!userInput) {
        toast({
          title: "Cancelled",
          description: "Delete operation cancelled",
          variant: "destructive"
        });
        return;
      }

      // Get all users with explicit typing
      const usersRef = databaseRef(database, 'users');
      const snapshot = await get(usersRef);
      
      if (!snapshot.exists()) {
        toast({
          title: "Error",
          description: "No users found in database",
          variant: "destructive"
        });
        return;
      }

      // Explicitly type usersData
      const usersData = snapshot.val() as Record<string, { email: string; workId: string }>;
      let foundUser: { email: string; workId: string } | null = null as { email: string; workId: string } | null;
      
      // Adjust iteration over usersData
      Object.entries(usersData).forEach(([_key, userData]: [string, { email: string; workId: string }]) => {
        if (userData.workId === userInput) {
          foundUser = {
            email: userData.email,
            workId: userData.workId
          };
        }
      });

      if (!foundUser || foundUser.email.toLowerCase() !== session.user.email.toLowerCase()) {
        toast({
          title: "Error",
          description: "Invalid work ID or permissions",
          variant: "destructive"
        });
        return;
      }

      // If verified, proceed with deletion
      const truckRef = databaseRef(database, `trucks/${key}`);
      await remove(truckRef);
      toast({
        title: "Success",
        description: "Truck deleted successfully",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete truck",
        variant: "destructive"
      });
    }
  };

  // Modify the verify access function to handle typing
  const verifyAccess = async (workId: string): Promise<{ email: string; workId: string } | null> => {
    const database = getFirebaseDatabase();
    if (!database) return null;
    
    const usersRef = databaseRef(database, 'users');
    const snapshot = await get(usersRef);
    
    if (!snapshot.exists()) return null;

    const usersData = snapshot.val() as Record<string, { email: string; workId: string }>;
    
    for (const [_, userData] of Object.entries(usersData)) {
      if (userData.workId === workId) {
        return userData;
      }
    }

    return null;
  };

  // Update handleEdit to use the new verifyAccess function
  const handleEdit = async (truckId: string) => {
    if (!session?.user?.email) {
      toast({
        title: "Error",
        description: "You must be logged in to edit",
        variant: "destructive"
      });
      return;
    }

    try {
      const userInput = prompt("Please enter your work ID to confirm:");
      if (!userInput) {
        toast({
          title: "Cancelled",
          description: "Edit operation cancelled",
          variant: "destructive"
        });
        return;
      }

      const foundUser = await verifyAccess(userInput);

      if (!foundUser || foundUser.email.toLowerCase() !== session.user.email.toLowerCase()) {
        toast({
          title: "Error",
          description: "Invalid work ID or permissions",
          variant: "destructive"
        });
        return;
      }

      // Define userEmail before using it
      const userEmail = session.user.email.toLowerCase();

      // If verified, proceed with setting sessionStorage and redirect
      sessionStorage.clear();
      sessionStorage.setItem('editVerified', 'true');
      sessionStorage.setItem('editVerifiedEmail', userEmail);
      sessionStorage.setItem('editVerifiedTime', new Date().toISOString());
      sessionStorage.setItem('editVerifiedTruck', truckId);

      // Redirect after ensuring sessionStorage is set
      router.push(`/dashboard/trucks/edit/${truckId}`);
      
    } catch {
      toast({
        title: "Error",
        description: "Failed to verify access",
        variant: "destructive"
      });
    }
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const filteredTrucks = trucks.filter(truck => 
    truck.truck_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
    truck.driver.toLowerCase().includes(searchQuery.toLowerCase()) ||
    truck.transporter.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Add error display in the render
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Return loading state if not mounted
  if (!mounted) {
    return null
  }

  // Update avatar sourcing
  const avatarSrc = session?.user?.image || lastUploadedImage || ''

  return (
    <div className="relative min-h-screen overflow-hidden" suppressHydrationWarning>
      <div className={theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}>
        <ParticlesBackground />
        
        <div className="relative">
          <header 
            className={`fixed top-0 left-0 w-full z-[100] border-b backdrop-blur-md transition-all duration-300 ${
              theme === 'dark'
                ? 'border-gray-800 bg-gray-900/70'
                : 'border-gray-200 bg-white/70'
            }`}
            suppressHydrationWarning
          >
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => router.push('/dashboard')}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-xl font-semibold">Truck Details</h1>
              </div>
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} // Now setTheme is defined
                >
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
                <Avatar>
                  <AvatarImage 
                    src={avatarSrc} 
                    alt="Profile"
                    className={isLoadingProfile ? 'animate-pulse' : ''}
                  />
                  <AvatarFallback>
                    {isLoadingProfile ? (
                      <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    ) : (
                      session?.user?.email?.[0]?.toUpperCase() || 'U'
                    )}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </header>

          <main className="w-full px-4 pt-24">
            <div className={`sticky top-20 z-[60] -mx-4 px-4 py-4 backdrop-blur-md transition-all duration-300 mb-6
              ${theme === 'dark' ? 'bg-gray-900/70' : 'bg-white/70'}`}>
              <Input
                placeholder="Search trucks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-none md:max-w-2xl mx-auto"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? (
                <>
                  {[...Array(6)].map((_, i) => (
                    <LoadingCard key={i} />
                  ))}
                </>
              ) : (
                filteredTrucks.map(truck => (
                  <TruckCard 
                    key={truck.id} 
                    truck={truck} 
                    onDelete={handleDelete} 
                    onEdit={handleEdit} 
                  />
                ))
              )}
            </div>
          </main>

          {showScrollToTop && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleScrollToTop}
              className="fixed bottom-4 right-4 rounded-full shadow-lg z-[70]"
            >
              <ArrowUp className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// This is important! Make sure we export the component as default
export default TruckDetails