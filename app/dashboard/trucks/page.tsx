"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDatabase, ref as dbRef, get } from "firebase/database";
import { ref as storageRef, getDownloadURL } from "firebase/storage";
import { Loader2, Copy, Edit, Trash2, ArrowLeft, Moon, Sun, Search, ArrowUp } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useSession } from "next-auth/react";
import { getFirebaseStorage } from "@/lib/firebase";
import { updateProfile, User as FirebaseAuthUser } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useRouter } from 'next/navigation';
import { WorkIdDialog } from '@/components/dashboard/WorkIdDialog';

interface TruckData {
  id: string;
  truck_no: string;
  driver: string;
  transporter: string;
  ago_comps: string[];
  pms_comps: string[];
}

interface FirebaseUserData {
  email: string;
  workId: string;
}

const calculateTotal = (compartments: string[] | undefined | null): number => {
  if (!compartments || !Array.isArray(compartments)) {
    return 0;
  }
  return compartments
    .filter(val => val && parseFloat(val) > 0) // Only include positive values
    .reduce((sum, val) => sum + parseFloat(val || '0'), 0);
};

const formatNumber = (value: string): string => {
  const num = parseFloat(value);
  return num % 1 === 0 ? num.toFixed(0) : num.toFixed(1);
};

const getOrderedCompartments = (data: any, prefix: string, count: number = 6): string[] => {
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const value = data[`${prefix}${i}`];
    if (value && !isNaN(parseFloat(value))) {
      result.push(value);
    }
  }
  return result;
};

const formatCompartments = (compartments: string[] | undefined | null): string => {
  if (!compartments || !Array.isArray(compartments)) {
    return '0';
  }
  const validComps = compartments
    .filter(value => value && parseFloat(value) > 0)
    .map(value => formatNumber(value));

  return validComps.length > 0 ? validComps.join(', ') : '0';
};

export default function TrucksPage() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const [trucks, setTrucks] = useState<TruckData[]>([]);
  const [filteredTrucks, setFilteredTrucks] = useState<TruckData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isVerifyingWorkId, setIsVerifyingWorkId] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchProfilePic = async () => {
      const storage = getFirebaseStorage();
      const userEmail = session?.user?.email;

      if (!storage || !userEmail) return;

      try {
        const imageRef = storageRef(storage, `profile-pics/${userEmail}.jpg`);
        const auth = getFirebaseAuth();
        const currentUser = auth ? (auth.currentUser as FirebaseAuthUser | null) : null;

        if (!currentUser) return;

        if (currentUser.photoURL) {
          setProfilePicUrl(currentUser.photoURL);
        } else if (currentUser.email) {
          const fileName = `profile-pics/${currentUser.email.replace(
            /[.@]/g,
            "_"
          )}.jpg`;
          if (!storage) {
            throw new Error('Firebase storage is not initialized');
          }
          const imageRef = storageRef(storage, fileName);

          try {
            const url = await getDownloadURL(imageRef);
            setProfilePicUrl(url);
            await updateProfile(currentUser, { photoURL: url });
          } catch (error) {
            console.log("No existing profile picture found");
            setProfilePicUrl(session?.user?.image || null);
          }
        }
      } catch (error) {
        console.error("Error fetching profile picture:", error);
        setProfilePicUrl(session?.user?.image || null);
      }
    };

    const auth = getFirebaseAuth();
    if (auth?.currentUser) {
      fetchProfilePic();
    }
  }, [getFirebaseAuth()?.currentUser, session]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTrucks(trucks);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = trucks.filter(truck => 
      truck.truck_no.toLowerCase().includes(query) ||
      truck.driver.toLowerCase().includes(query) ||
      truck.transporter.toLowerCase().includes(query)
    );
    setFilteredTrucks(filtered);
  }, [searchQuery, trucks]);

  useEffect(() => {
    const fetchTrucks = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const db = getDatabase();
        const trucksRef = dbRef(db, 'trucks');
        const snapshot = await get(trucksRef);
        
        if (!snapshot.exists()) {
          setTrucks([]);
          toast({
            title: "No trucks found",
            description: "There are currently no trucks in the system.",
            variant: "default"
          });
          return;
        }

        const trucksData = Object.entries(snapshot.val()).map(([id, data]: [string, any]) => {
          return {
            id,
            truck_no: data.truck_no || '',
            driver: data.driver || '',
            transporter: data.transporter || '',
            ago_comps: getOrderedCompartments(data, 'ago_comp_'),
            pms_comps: getOrderedCompartments(data, 'pms_'),
          };
        });

        console.log('Fetched trucks:', trucksData); // Debug log
        setTrucks(trucksData);
        
        if (trucksData.length > 0) {
          toast({
            title: "Success",
            description: `Found ${trucksData.length} trucks`,
            variant: "default"
          });
        }
      } catch (err) {
        console.error('Error fetching trucks:', err);
        setError('Failed to load trucks. Please try again later.');
        toast({
          title: "Error",
          description: "Failed to load trucks. Please try again later.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrucks();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleCopyTruck = (truck: TruckData) => {
    const agoTotal = calculateTotal(truck.ago_comps);
    const pmsTotal = calculateTotal(truck.pms_comps);
    
    const textToCopy = `${truck.truck_no}

Driver: ${truck.driver}
Transporter: ${truck.transporter}

AGO: ${formatCompartments(truck.ago_comps)} (Total: ${formatNumber(agoTotal.toString())})
PMS: ${formatCompartments(truck.pms_comps)} (Total: ${formatNumber(pmsTotal.toString())})`;

    navigator.clipboard.writeText(textToCopy).then(() => {
      toast({
        title: "Copied",
        description: "Truck details copied to clipboard",
        variant: "default"
      });
    }).catch(() => {
      toast({
        title: "Error",
        description: "Failed to copy truck details",
        variant: "destructive"
      });
    });
  };

  const handleEdit = (truckId: string) => {
    setSelectedTruckId(truckId);
    setIsVerifyingWorkId(true);
  };

  const verifyWorkId = async (workId: string): Promise<boolean> => {
    try {
      const db = getDatabase();
      const userEmail = session?.user?.email;
      
      if (!userEmail) throw new Error('No user email found');

      const usersRef = dbRef(db, 'users');
      const snapshot = await get(usersRef);
      
      if (!snapshot.exists()) return false;

      const users = Object.values(snapshot.val()) as FirebaseUserData[];
      const user = users.find(u => u.email === userEmail);
      
      if (!user || user.workId !== workId.trim()) {
        toast({
          title: "Error",
          description: "Invalid Work ID",
          variant: "destructive"
        });
        return false;
      }

      if (selectedTruckId) {
        router.push(`/dashboard/trucks/edit/${selectedTruckId}`);
        setIsVerifyingWorkId(false); // Close dialog after successful verification
      }
      
      return true;
    } catch (error) {
      console.error('Work ID verification error:', error);
      toast({
        title: "Error",
        description: "Verification failed",
        variant: "destructive"
      });
      return false;
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
        <div className="container flex flex-col gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="hover:bg-transparent">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Truck Details
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="hover:bg-transparent"
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarImage src={profilePicUrl || ''} alt="Profile" />
                <AvatarFallback>
                  {session?.user?.name?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          <div className="flex items-center gap-2 max-w-md mx-auto w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                type="text"
                placeholder="Search trucks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-4">
              <p className="text-red-500 dark:text-red-400">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTrucks.map((truck, index) => (
              <motion.div
                key={truck.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative group"
              >
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600/30 via-teal-500/30 to-blue-600/30 rounded-xl blur-sm opacity-0 group-hover:opacity-100 transition duration-500" />
                <div className="relative p-4 rounded-xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-800/50 shadow-sm hover:shadow-md transition">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                        {truck.truck_no}
                      </h3>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleCopyTruck(truck)}
                        >
                          <Copy className="h-4 w-4" />
                          <span className="sr-only">Copy</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleEdit(truck.id)}
                        >
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p><span className="font-medium">Driver:</span> {truck.driver}</p>
                      <p><span className="font-medium">Transporter:</span> {truck.transporter}</p>
                      
                      <div className="space-y-1 text-sm">
                        <p>
                          <span className="font-medium">AGO:</span>{' '}
                          <span className="text-gray-600 dark:text-gray-400">
                            {formatCompartments(truck.ago_comps)}
                            {' '}
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              (Total: {formatNumber(calculateTotal(truck.ago_comps).toFixed(1))})
                            </span>
                          </span>
                        </p>
                        <p>
                          <span className="font-medium">PMS:</span>{' '}
                          <span className="text-gray-600 dark:text-gray-400">
                            {formatCompartments(truck.pms_comps)}
                            {' '}
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              (Total: {formatNumber(calculateTotal(truck.pms_comps).toFixed(1))})
                            </span>
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 p-3 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-colors duration-200 z-50"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowUp className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <WorkIdDialog
        isOpen={isVerifyingWorkId}
        onClose={() => {
          setIsVerifyingWorkId(false);
          setSelectedTruckId(null);
        }}
        onVerify={verifyWorkId}
      />
    </div>
  );
}
