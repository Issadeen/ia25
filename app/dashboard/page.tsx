"use client"

import { useSession, signOut, getSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useRef, useCallback } from "react"
import { useTheme } from "next-themes"
import { LogOut, Truck, Briefcase, Plus, Wallet, Moon, Sun } from 'lucide-react'
import { Button } from "components/ui/atoms/button"
import { Avatar, AvatarImage, AvatarFallback } from "components/ui/avatar"
import { auth, storage } from "lib/firebase"
import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage"
import { updateProfile } from "firebase/auth"
import { useToast } from "components/ui/use-toast"
import ReactCrop, { Crop, ReactCropProps } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { ParticlesBackground } from "components/ParticlesBackground"
import { DashboardCard } from "components/DashboardCard"
import { Card, CardHeader, CardTitle, CardContent } from "components/ui/atoms/card"
import { AuthWrapper } from "components/AuthWrapper"
import { GoogleAuthProvider, signInWithCredential, User as FirebaseUser, signInWithCustomToken } from "firebase/auth"

// Add this constant at the top of your component
const INACTIVITY_TIMEOUT = 7 * 60 * 1000; // 7 minutes in milliseconds

// Share the same path generation function
const getProfilePicturePath = (email: string): string => {
  const sanitizedEmail = email?.toLowerCase().replace(/[@.]/g, '_') || '';
  return `profile-pics/${sanitizedEmail}`;
}

export default function DashboardPage() {
  // Add new state for profile picture
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const { data: session, status, update } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isEditingProfilePic, setIsEditingProfilePic] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [sessionExpiryWarning, setSessionExpiryWarning] = useState(false)
  const [lastLogin, setLastLogin] = useState<string | null>(null)
  const [imageSrc, setImageSrc] = useState<string>('')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(1)
  const [mounted, setMounted] = useState(false)
  const [previousImages, setPreviousImages] = useState<string[]>([]);
  const [profileUpdated, setProfileUpdated] = useState(false);

  const handleSignOut = useCallback(async () => {
    setIsLoggingOut(true)
    try {
      await signOut({ redirect: false })
      router.push('/login')
    } catch (error) {
      toast({
        title: 'Error logging out',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive'
      })
    } finally {
      setIsLoggingOut(false)
    }
  }, [router, toast])

  useEffect(() => {
    setMounted(true)
    const handleScroll = () => {
      setIsScrolled(window.pageYOffset > 0)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    let inactivityTimer: NodeJS.Timeout;
    let warningTimer: NodeJS.Timeout;

    const resetTimers = () => {
      // Clear existing timers
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (warningTimer) clearTimeout(warningTimer);

      // Set warning timer (6 minutes)
      warningTimer = setTimeout(() => {
        setSessionExpiryWarning(true);
      }, INACTIVITY_TIMEOUT - 60000);

      // Set logout timer (7 minutes)
      inactivityTimer = setTimeout(() => {
        setSessionExpiryWarning(false);
        handleSignOut();
      }, INACTIVITY_TIMEOUT);

      // Hide warning if it's showing
      setSessionExpiryWarning(false);
    };

    // Initial timer setup
    resetTimers();
    setLastLogin(new Date().toLocaleString());

    // Activity event listeners
    const activities = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activities.forEach(activity => {
      window.addEventListener(activity, resetTimers);
    });

    // Cleanup
    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (warningTimer) clearTimeout(warningTimer);
      activities.forEach(activity => {
        window.removeEventListener(activity, resetTimers);
      });
    };
  }, [status, router, handleSignOut]);

  useEffect(() => {
    const initFirebase = async () => {
      // Check both auth state and session status
      if (status !== 'authenticated' || auth.currentUser) {
        return;
      }

      try {
        console.log('Session data:', {
          accessToken: session?.accessToken,
          idToken: session?.idToken,
          firebaseToken: session?.firebaseToken,
          email: session?.user?.email
        });

        let authResult;

        // Try to sign in with custom token first
        try {
          const response = await fetch('/api/auth/firebase-token');
          const { customToken } = await response.json();
          authResult = await signInWithCustomToken(auth, customToken);
        } catch (customTokenError) {
          console.log('Custom token sign in failed, trying access token');
          
          // Fallback to access token
          if (session?.accessToken) {
            authResult = await signInWithCredential(
              auth,
              GoogleAuthProvider.credential(null, session.accessToken)
            );
          } else {
            throw new Error('No valid authentication token found');
          }
        }

        // Check if we have a valid auth result
        if (authResult && authResult.user) {
          console.log('Firebase Auth State:', {
            currentUser: authResult.user.email,
            uid: authResult.user.uid
          });
        } else {
          throw new Error('Failed to initialize Firebase auth');
        }

      } catch (error: any) {
        console.error('Firebase Auth Error:', {
          code: error.code,
          message: error.message,
          additionalData: error.additionalData
        });
        
        toast({
          title: "Authentication Error",
          description: "Please try logging in again",
          variant: "destructive",
        });
      }
    };

    initFirebase();
  }, [status, session, toast]);

  // Add this useEffect for profile picture retrieval
  useEffect(() => {
    const fetchProfilePic = async () => {
      try {
        const currentUser = auth.currentUser as FirebaseUser | null;
        
        if (!currentUser) return;

        if (currentUser.photoURL) {
          setProfilePicUrl(currentUser.photoURL);
        } else if (currentUser.email) {
          const fileName = `profile-pics/${currentUser.email.replace(/[.@]/g, '_')}.jpg`;
          const imageRef = ref(storage, fileName);
          
          try {
            const url = await getDownloadURL(imageRef);
            setProfilePicUrl(url);
            // Update Firebase user profile
            await updateProfile(currentUser, { photoURL: url });
          } catch (error) {
            console.log('No existing profile picture found');
          }
        }
      } catch (error) {
        console.error('Error fetching profile picture:', error);
      } finally {
        setIsLoadingProfile(false);
        setProfileUpdated(false); // Reset the update flag
      }
    };

    if (auth.currentUser || profileUpdated) {
      fetchProfilePic();
    }
  }, [auth.currentUser, profileUpdated]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageSrc(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateCanvas = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
      console.error("generateCanvas: completedCrop or imgRef.current is null");
      return null;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error("generateCanvas: Failed to get canvas context");
      return null;
    }

    // Calculate proper scaling to maintain image quality
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // Set canvas dimensions to desired output size
    const outputWidth = 400; // Set your desired output size
    const outputHeight = 400;
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // Ensure the context is clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the cropped and scaled image
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      outputWidth,
      outputHeight
    );

    return canvas;
  }, [completedCrop]);

  const handleUploadImage = useCallback(async () => {
    if (!completedCrop || !imgRef.current) {
      toast({
        title: "Error",
        description: "Please select and crop an image first",
        variant: "destructive",
      });
      return;
    }
  
    if (!auth.currentUser) {
      toast({
        title: "Error",
        description: "You must be logged in to upload images",
        variant: "destructive",
      });
      return;
    }
  
    setIsUploading(true); // Ensure this is set before any async operations
    
    try {
      console.log('Starting upload process...');
      const canvas = generateCanvas();
      if (!canvas) throw new Error("Failed to generate canvas");
  
      // Add artificial delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500));
  
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to create blob"));
        }, 'image/jpeg', 1);
      });
  
      // Use consistent path generation
      const fileName = `${getProfilePicturePath(auth.currentUser.email || '')}.jpg`;
      const imageRef = ref(storage, fileName);
  
      // Add metadata
      const metadata = {
        contentType: 'image/jpeg',
        customMetadata: {
          'userEmail': auth.currentUser.email || 'unknown'
        }
      };
  
      console.log('Uploading to:', fileName);
      const uploadResult = await uploadBytes(imageRef, blob, metadata);
      console.log('Upload successful:', uploadResult);
  
      const downloadURL = await getDownloadURL(imageRef);
      console.log('Download URL:', downloadURL);
  
      setLastUploadedImage(downloadURL);
      setPreviousImages(prev => [...prev, downloadURL]);
      
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          photoURL: downloadURL,
        });
      }
  
      await update();
      setIsEditingProfilePic(false);
      setProfileUpdated(true); // Add this line to trigger profile refresh
      
      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });
  
    } catch (error) {
      console.error('handleUploadImage error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? 
          `Error: ${error.message}` : 
          "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false); // Ensure this runs after all operations
    }
  }, [completedCrop, generateCanvas, toast, update]);

  if (status === "loading" || !mounted) return null;

  const cards = [
    {
      title: "Truck Details",
      description: "View and manage truck information",
      icon: Truck,
      href: "/dashboard/trucks"
    },
    {
      title: "Work Details",
      description: "Track and review work assignments",
      icon: Briefcase,
      href: "/dashboard/work"
    },
    {
      title: "New Trucks",
      description: "Register and add new trucks to the fleet",
      icon: Plus,
      href: "/dashboard/new-truck"
    },
    {
      title: "Wallet",
      description: "Manage your wallet and transactions",
      icon: Wallet,
      href: "/dashboard/wallet"
    }
  ]

  // Update the avatarSrc logic
  const avatarSrc = profilePicUrl || lastUploadedImage || session?.user?.image || ''

  const getSimpleFirstName = (email: string | null | undefined) => {
    if (!email) return '';
    const [username] = email.split('@');
    return username.slice(0, 4).charAt(0).toUpperCase() + username.slice(1, 4);
  }

  const welcomeMessage = `Welcome back, ${getSimpleFirstName(session?.user?.email)}!`

  return (
    <div className={`relative min-h-screen overflow-hidden ${
      theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'
    }`}>
      <ParticlesBackground />
      
      <div className="relative z-10">
        <AnimatePresence>
          {sessionExpiryWarning && (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="fixed top-20 right-4 z-50 bg-yellow-500/90 text-white px-4 py-2 rounded-md shadow-lg"
            >
              Session expiring in less than 1 minute. Move your mouse or press any key to stay logged in.
            </motion.div>
          )}
        </AnimatePresence>
        
        <header className={`fixed top-0 left-0 w-full z-20 border-b ${
          theme === 'dark'
            ? `border-gray-800 ${isScrolled ? 'bg-gray-900/30' : 'bg-gray-900/70'}`
            : `border-gray-200 ${isScrolled ? 'bg-white/30' : 'bg-white/70'}`
        } backdrop-blur-md transition-all duration-300`}>
          <div className="container mx-auto px-4 py-3 flex justify-between items-center">
            <h1 className="text-2xl font-semibold">Issaerium-23</h1>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-muted-foreground hover:text-foreground"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="text-muted-foreground hover:text-foreground"
              >
                {isLoggingOut ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current" />
                ) : (
                  <LogOut className="h-5 w-5" />
                )}
              </Button>
              <motion.div 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsEditingProfilePic(true)}
                className="cursor-pointer"
              >
                <Avatar>
                  <AvatarImage 
                    src={avatarSrc} 
                    alt="Profile avatar"
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
              </motion.div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <h2 className={`text-4xl font-bold ${
              theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
            }`}>
              {welcomeMessage}
            </h2>
            <p className={`mt-2 text-lg ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Your Issaerium-23 dashboard awaits.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            {cards.map((card, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <DashboardCard {...card} />
              </motion.div>
            ))}
          </motion.div>

          {lastLogin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="text-right text-sm text-muted-foreground/60 mt-8"
            >
              Login time: {lastLogin}
            </motion.div>
          )}
        </main>

        <AnimatePresence>
          {isEditingProfilePic && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 overflow-hidden p-4"
            >
              <div className={`relative w-full max-w-md max-h-[80vh] rounded-lg shadow-lg ${
                theme === 'dark' ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
              }`}>
                {/* Header */}
                <div className="sticky top-0 p-4 border-b backdrop-blur-sm bg-opacity-90 bg-inherit">
                  <h2 className="text-xl font-bold pr-8">Edit Profile Picture</h2>
                  <Button 
                    onClick={() => setIsEditingProfilePic(false)} 
                    className="absolute top-3 right-3"
                    variant="ghost"
                    size="sm"
                  >
                    Close
                  </Button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto p-4 space-y-4" style={{ maxHeight: 'calc(80vh - 140px)' }}>
                  <div className="space-y-4">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageChange}
                      className="w-full"
                    />
                    {imageSrc && (
                      <div className="flex justify-center">
                        <ReactCrop
                          crop={crop}
                          onChange={(newCrop) => setCrop(newCrop)}
                          onComplete={(c) => setCompletedCrop(c)}
                          aspect={1}
                          circularCrop
                          minWidth={100}
                          minHeight={100}
                        >
                          <img 
                            ref={imgRef}
                            src={imageSrc} 
                            alt="Crop preview"
                            style={{ maxHeight: '50vh', maxWidth: '100%' }}
                          />
                        </ReactCrop>
                      </div>
                    )}
                    {completedCrop && (
                      <div className="flex justify-center">
                        <canvas
                          ref={previewCanvasRef}
                          style={{
                            width: Math.round(completedCrop.width ?? 0),
                            height: Math.round(completedCrop.height ?? 0),
                            maxWidth: '100%',
                            maxHeight: '200px'
                          }}
                        />
                      </div>
                    )}
                    {previousImages.length > 0 && (
                      <div className="mt-4">
                        <h3 className="text-sm font-medium mb-2">Previous Uploads</h3>
                        <div className="grid grid-cols-3 gap-2">
                          {previousImages.map((url, index) => (
                            <img
                              key={index}
                              src={url}
                              alt={`Previous upload ${index + 1}`}
                              className="w-full h-20 object-cover rounded cursor-pointer hover:opacity-75 transition-opacity"
                              onClick={() => {
                                setLastUploadedImage(url);
                                setIsEditingProfilePic(false);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fixed Footer */}
                <div className="sticky bottom-0 p-4 border-t backdrop-blur-sm bg-opacity-90 bg-inherit">
                  <Button 
                    onClick={handleUploadImage} 
                    disabled={isUploading || !completedCrop} 
                    className="w-full relative"
                  >
                    {isUploading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                        <span>Uploading...</span>
                      </span>
                    ) : 'Upload Picture'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>      </div>    </div>  )}