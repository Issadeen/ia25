"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getDatabase, ref, update, get } from "firebase/database";
import { ref as storageRef, getDownloadURL } from "firebase/storage";
import { updateProfile, User as FirebaseAuthUser } from "firebase/auth";
import { getFirebaseStorage, getFirebaseAuth } from "@/lib/firebase";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/use-toast";
import { Loader2, ArrowLeft, Save, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useSession } from "next-auth/react"; // Add this import
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

// Simplify the form schema
const truckFormSchema = z.object({
  truck_no: z.string().min(1, "Truck number is required"),
  driver: z.string().min(1, "Driver name is required"),
  transporter: z.string().min(1, "Transporter is required"),
  ago_comps: z.array(z.string()),
  pms_comps: z.array(z.string()),
});

type TruckFormData = z.infer<typeof truckFormSchema>;

const calculateTotal = (values: string[]): number => {
  return values
    .filter(val => val && !isNaN(parseFloat(val)))
    .reduce((sum, val) => sum + parseFloat(val), 0);
};

export default function EditTruckPage({ params }: { params: Promise<{ id: string }> }) {
  const { theme, setTheme } = useTheme(); // Add theme support
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const { data: session } = useSession(); // Add this hook
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);

  const form = useForm<TruckFormData>({
    resolver: zodResolver(truckFormSchema),
    defaultValues: {
      truck_no: "",
      driver: "",
      transporter: "",
      ago_comps: Array(9).fill("0"),
      pms_comps: Array(9).fill("0"),
    },
  });

  // Modified useEffect to prevent recursion
  useEffect(() => {
    let mounted = true;

    const fetchTruck = async () => {
      if (!id) return;
      try {
        const db = getDatabase();
        const truckRef = ref(db, `trucks/${id}`);
        const snapshot = await get(truckRef);

        if (!snapshot.exists()) {
          toast({ title: "Error", description: "Truck not found", variant: "destructive" });
          router.push("/dashboard/trucks");
          return;
        }

        const data = snapshot.val();
        
        // Create new arrays for compartments
        const ago_comps = Array(9).fill("0");
        const pms_comps = Array(9).fill("0");

        // Check if ago_comps array exists and has values
        if (Array.isArray(data.ago_comps)) {
          data.ago_comps.forEach((value: string, index: number) => {
            if (index < 9) ago_comps[index] = value || "0";
          });
        } else {
          // Fall back to individual fields
          for (let i = 1; i <= 4; i++) {
            ago_comps[i-1] = data[`ago_comp_${i}`] || "0";
          }
        }

        // Check if pms_comps array exists and has values
        if (Array.isArray(data.pms_comps)) {
          data.pms_comps.forEach((value: string, index: number) => {
            if (index < 9) pms_comps[index] = value || "0";
          });
        } else {
          // Fall back to individual fields
          for (let i = 1; i <= 4; i++) {
            pms_comps[i-1] = data[`pms_${i}`] || "0";
          }
        }

        if (mounted) {
          form.reset({
            truck_no: data.truck_no || '',
            driver: data.driver || '',
            transporter: data.transporter || '',
            ago_comps,
            pms_comps,
          }, {
            keepDefaultValues: false
          });
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error fetching truck:", error);
        if (mounted) {
          toast({
            title: "Error",
            description: "Failed to fetch truck details",
            variant: "destructive",
          });
          setIsLoading(false);
        }
      }
    };

    fetchTruck();

    return () => {
      mounted = false;
    };
  }, [id, router]); // Remove form from dependencies

  // Add profile picture fetch effect
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
          const fileName = `profile-pics/${currentUser.email.replace(/[.@]/g, "_")}.jpg`;
          const imageRef = storageRef(storage, fileName);
          const url = await getDownloadURL(imageRef);
          setProfilePicUrl(url);
        }
      } catch (error) {
        console.error("Error fetching profile picture:", error);
        setProfilePicUrl(session?.user?.image || null);
      }
    };

    fetchProfilePic();
  }, [session]);

  const onSubmit = async (data: TruckFormData) => {
    setIsSaving(true);
    try {
      const db = getDatabase();
      const truckRef = ref(db, `trucks/${id}`);
      
      interface Updates {
        truck_no: string;
        driver: string;
        transporter: string;
        ago_comps: string[];
        pms_comps: string[];
        updated_at: string;
        updated_by: string;
        [key: string]: string | string[];
      }
      
      const updates: Updates = {
        truck_no: data.truck_no,
        driver: data.driver,
        transporter: data.transporter,
        ago_comps: data.ago_comps,
        pms_comps: data.pms_comps,
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.email || 'unknown',
      };

      // Add individual compartment fields for compatibility
      for (let i = 0; i < 4; i++) {
        updates[`ago_comp_${i + 1}`] = data.ago_comps[i] || "0";
        updates[`pms_${i + 1}`] = data.pms_comps[i] || "0";
      }

      await update(truckRef, updates);
      toast({ 
        title: "Success", 
        description: "Truck details updated successfully"
      });
      router.push("/dashboard/trucks");
    } catch (error) {
      console.error("Error updating truck:", error);
      toast({
        title: "Error",
        description: "Failed to update truck details",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
        <div className="container flex flex-col gap-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/trucks">
                <Button variant="ghost" size="icon" className="hover:bg-transparent h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-base sm:text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate max-w-[200px] sm:max-w-none">
                Edit: {form.watch("truck_no")}
              </h1>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="hover:bg-transparent h-8 w-8"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
              <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                <AvatarImage src={profilePicUrl || ''} alt="Profile" />
                <AvatarFallback>
                  {session?.user?.name?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="p-4">
                <CardTitle className="text-base sm:text-lg">Basic Information</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Edit the truck's basic details</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <FormField
                  control={form.control}
                  name="truck_no"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Truck Number</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="driver"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="transporter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transporter</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="shadow-sm">
                <CardHeader className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-base sm:text-lg">AGO Compartments</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">Edit AGO values</CardDescription>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-medium text-sm">
                      Total: {calculateTotal(form.watch("ago_comps")).toFixed(1)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    {form.watch("ago_comps").map((_, index) => (
                      <FormField
                        key={`ago_${index}`}
                        control={form.control}
                        name={`ago_comps.${index}`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs sm:text-sm">Comp {index + 1}</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.1"
                                className="h-8 text-sm"
                                inputMode="decimal"
                                value={field.value || '0'}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(value === '' ? '0' : value);
                                }}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-base sm:text-lg">PMS Compartments</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">Edit PMS values</CardDescription>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-medium text-sm">
                      Total: {calculateTotal(form.watch("pms_comps")).toFixed(1)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    {form.watch("pms_comps").map((_, index) => (
                      <FormField
                        key={`pms_${index}`}
                        control={form.control}
                        name={`pms_comps.${index}`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs sm:text-sm">Comp {index + 1}</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.1"
                                className="h-8 text-sm"
                                inputMode="decimal"
                                value={field.value || '0'}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(value === '' ? '0' : value);
                                }}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t sm:relative sm:p-0 sm:border-0 sm:bg-transparent sm:backdrop-blur-none">
              <Button 
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
