"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getDatabase, ref, update, get } from "firebase/database";
import { toast } from "@/components/ui/use-toast";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useSession } from "next-auth/react"; // Add this import
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

// Define the form schema
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

export default function EditTruckPage({ params }: any) { // Change type to any temporarily
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const { data: session } = useSession(); // Add this hook
  const id = params.id;

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

  useEffect(() => {
    const fetchTruck = async () => {
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
        // Explicitly handle old data format
        const ago_comps = data.ago_comps || [
          data.ago_comp_1 || "0",
          data.ago_comp_2 || "0",
          data.ago_comp_3 || "0",
          data.ago_comp_4 || "0",
          "0", "0", "0", "0", "0"
        ];

        const pms_comps = data.pms_comps || [
          data.pms_1 || "0",
          data.pms_2 || "0",
          data.pms_3 || "0",
          data.pms_4 || "0",
          "0", "0", "0", "0", "0"
        ];

        form.reset({
          truck_no: data.truck_no || '',
          driver: data.driver || '',
          transporter: data.transporter || '',
          ago_comps,
          pms_comps,
        });
      } catch (error) {
        console.error("Error fetching truck:", error);
        toast({
          title: "Error",
          description: "Failed to fetch truck details",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchTruck();
    }
  }, [id, router, form]);

  const onSubmit = async (data: TruckFormData) => {
    setIsSaving(true);
    try {
      const db = getDatabase();
      const truckRef = ref(db, `trucks/${id}`);
      
      // First get existing data
      const snapshot = await get(truckRef);
      const existingData = snapshot.val();

      // Prepare updates with all existing data preserved
      const updates = {
        ...existingData, // Keep all existing data
        truck_no: data.truck_no,
        driver: data.driver,
        transporter: data.transporter,
        // Update compartments while preserving structure
        ago_comp_1: data.ago_comps[0] || "0",
        ago_comp_2: data.ago_comps[1] || "0",
        ago_comp_3: data.ago_comps[2] || "0",
        ago_comp_4: data.ago_comps[3] || "0",
        ago_comps: data.ago_comps.map(val => val || "0"),
        pms_1: data.pms_comps[0] || "0",
        pms_2: data.pms_comps[1] || "0",
        pms_3: data.pms_comps[2] || "0",
        pms_4: data.pms_comps[3] || "0",
        pms_comps: data.pms_comps.map(val => val || "0"),
        // Add metadata
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.email || 'unknown'
      };

      // Update the entire node instead of partial updates
      await update(truckRef, updates);
      
      toast({ 
        title: "Success", 
        description: "Truck details updated successfully",
        variant: "default"
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
    <div className="min-h-screen container mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/trucks">
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate">
            Edit: {form.watch("truck_no")}
          </h1>
        </div>
        <Button 
          onClick={form.handleSubmit(onSubmit)} 
          disabled={isSaving}
          className="bg-emerald-600 hover:bg-emerald-700 h-9 sm:h-10 px-3 sm:px-4"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl">Basic Information</CardTitle>
              <CardDescription className="text-sm">Edit the truck's basic details</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <FormField
                control={form.control}
                name="truck_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Truck Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                      <Input {...field} />
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
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:gap-6">
            <Card className="shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">AGO Compartments</CardTitle>
                    <CardDescription className="text-sm">Edit AGO compartment values</CardDescription>
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

            <Card className="shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">PMS Compartments</CardTitle>
                    <CardDescription className="text-sm">Edit PMS compartment values</CardDescription>
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
        </form>
      </Form>
    </div>
  );
}
