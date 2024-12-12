"use client";

import { useEffect, useState } from "react";
import { getDatabase, ref, push, set } from "firebase/database";
import { ref as storageRef, getDownloadURL } from "firebase/storage";
import { updateProfile, User as FirebaseUser } from "firebase/auth";
import { getFirebaseAuth, getFirebaseStorage } from "@/lib/firebase";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ArrowLeft, Moon, Sun, Loader2, Plus, Minus } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const formSchema = z.object({
  truck_no: z.string().min(1, "Truck number is required"),
  driver: z.string().min(1, "Driver name is required"),
  owner: z.string().min(1, "Owner is required"),
  transporter: z.string().min(1, "Transporter is required"),
  ago_comps: z.array(z.string()),
  pms_comps: z.array(z.string()),
});

type FormData = z.infer<typeof formSchema>;

const calculateTotal = (values: string[]): number => {
  return values
    .filter(val => val && !isNaN(parseFloat(val)))
    .reduce((sum, val) => sum + parseFloat(val), 0);
};

export default function NewTruckPage() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddComps, setShowAddComps] = useState(false);
  const [extraComps, setExtraComps] = useState(0);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      truck_no: "",
      driver: "",
      owner: "",
      transporter: "",
      ago_comps: Array(3).fill("0"),
      pms_comps: Array(3).fill("0"),
    },
  });

  // Profile pic fetch effect (copy from trucks page)
  useEffect(() => {
    const fetchProfilePic = async () => {
      const storage = getFirebaseStorage();
      const userEmail = session?.user?.email;

      if (!storage || !userEmail) return;

      try {
        const imageRef = storageRef(storage, `profile-pics/${userEmail}.jpg`);
        const auth = getFirebaseAuth();
        const currentUser = auth ? (auth.currentUser as FirebaseUser | null) : null;

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

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const db = getDatabase();
      const newTruckRef = push(ref(db, 'trucks'));

      // Convert arrays to individual fields and objects
      const agoCompsObj: Record<string, string> = {};
      data.ago_comps.forEach((value, index) => {
        agoCompsObj[`ago_comp_${index + 1}`] = value || "0";
      });

      const pmsCompsObj: Record<string, string> = {};
      data.pms_comps.forEach((value, index) => {
        pmsCompsObj[`pms_${index + 1}`] = value || "0";
      });

      const truckData = {
        truck_no: data.truck_no,
        driver: data.driver,
        owner: data.owner,
        transporter: data.transporter,
        created_at: new Date().toISOString(),
        created_by: session?.user?.email || 'unknown',
        ...agoCompsObj,
        ...pmsCompsObj,
        ago_comps: data.ago_comps,
        pms_comps: data.pms_comps,
      };

      await set(newTruckRef, truckData);
      toast({ title: "Success", description: "New truck added successfully" });
      router.push("/dashboard/trucks");
    } catch (error) {
      console.error("Error creating truck:", error);
      toast({
        title: "Error",
        description: "Failed to create truck",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCompartments = () => {
    if (extraComps > 0) {
      const currentAgo = form.getValues("ago_comps");
      const currentPms = form.getValues("pms_comps");

      form.setValue("ago_comps", [
        ...currentAgo,
        ...Array(extraComps).fill("0")
      ]);
      form.setValue("pms_comps", [
        ...currentPms,
        ...Array(extraComps).fill("0")
      ]);

      setShowAddComps(false);
      setExtraComps(0);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/trucks">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Add New Truck
            </h1>
          </div>

          {/* Theme and Profile */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Avatar className="h-8 w-8">
              <AvatarImage src={profilePicUrl || ""} />
              <AvatarFallback>
                {session?.user?.name?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      {/* Main Form */}
      <main className="container mx-auto px-4 py-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Enter the truck details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="truck_no"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Truck Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., KAU418D/ZE4232" />
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
                        <Input {...field} placeholder="Driver name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="owner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owner</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Owner name" />
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
                        <Input {...field} placeholder="Transporter name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Compartments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* AGO Card */}
              <Card className="shadow-sm">
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg sm:text-xl">AGO Compartments</CardTitle>
                      <CardDescription className="text-sm">Enter AGO compartment values</CardDescription>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Total: {calculateTotal(form.watch("ago_comps")).toFixed(1)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {form.watch("ago_comps").map((_, index) => (
                      <FormField
                        key={`ago_${index}`}
                        control={form.control}
                        name={`ago_comps.${index}`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">Comp {index + 1}</FormLabel>
                            <FormControl>
                              <Input 
                                {...field}
                                type="number"
                                step="0.1"
                                className="h-9 text-base"
                                inputMode="decimal"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* PMS Card - Similar to AGO */}
              <Card className="shadow-sm">
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg sm:text-xl">PMS Compartments</CardTitle>
                      <CardDescription className="text-sm">Enter PMS compartment values</CardDescription>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Total: {calculateTotal(form.watch("pms_comps")).toFixed(1)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {form.watch("pms_comps").map((_, index) => (
                      <FormField
                        key={`pms_${index}`}
                        control={form.control}
                        name={`pms_comps.${index}`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">Comp {index + 1}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                step="0.1"
                                className="h-9 text-base"
                                inputMode="decimal"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddComps(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add More Compartments
              </Button>

              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Create Truck
              </Button>
            </div>
          </form>
        </Form>
      </main>

      {/* Add Compartments Dialog */}
      <Dialog open={showAddComps} onOpenChange={setShowAddComps}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add More Compartments</DialogTitle>
            <DialogDescription>
              How many additional compartments do you want to add?
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-4 py-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setExtraComps(Math.max(0, extraComps - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-2xl font-semibold w-12 text-center">
              {extraComps}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setExtraComps(extraComps + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddComps(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddCompartments}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Add Compartments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
