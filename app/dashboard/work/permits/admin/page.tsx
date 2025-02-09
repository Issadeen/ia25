'use client'

import { useState, useEffect } from 'react'
import { getDatabase, ref, onValue, update } from 'firebase/database'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Save, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

interface Entry {
  id: string;
  number: string;
  product: string;
  remainingQuantity: number;
  initialQuantity: number;
  destination: string;
  createdBy: string;
  timestamp: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const { data: session, status } = useSession()
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [productFilter, setProductFilter] = useState('ALL')

  useEffect(() => {
    const db = getDatabase();
    const entriesRef = ref(db, 'allocations');
    
    const unsubscribe = onValue(entriesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.entries(snapshot.val()).map(([id, entry]: [string, any]) => ({
          id,
          ...entry
        }));
        setEntries(data);
      }
    });

    return () => unsubscribe();
  }, []);

  // Add profile image fetch effect
  useEffect(() => {
    const fetchImageUrl = async () => {
      if (!session?.user?.email || session?.user?.image) return
  
      try {
        const storage = getStorage()
        const filename = `${session.user.email}.jpg`
        const imageRef = storageRef(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        // Silently handle missing profile image
      }
    }
  
    fetchImageUrl()
  }, [session?.user])

  const handleVolumeUpdate = async (entry: Entry, newVolume: number) => {
    if (newVolume < 0) {
      toast({
        title: "Error",
        description: "Volume cannot be negative",
        variant: "destructive"
      });
      return;
    }

    try {
      const db = getDatabase();
      const entryRef = ref(db, `allocations/${entry.id}`);
      
      await update(entryRef, {
        remainingQuantity: newVolume
      });

      toast({
        title: "Success",
        description: `Volume updated to ${newVolume.toLocaleString()}L`
      });
      setEditingEntry(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update volume",
        variant: "destructive"
      });
    }
  };

  // Update the handleSave function to use the new volume update
  const handleSave = async (entry: Entry) => {
    if (!editingEntry) return;
    await handleVolumeUpdate(entry, editValue);
  };

  // Add filter function
  const getFilteredEntries = () => {
    return entries.filter(entry => {
      const matchesSearch = searchTerm === '' || 
        entry.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.createdBy.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesProduct = productFilter === 'ALL' || 
        entry.product.toUpperCase() === productFilter;

      return matchesSearch && matchesProduct;
    });
  };

  return (
    <div className="min-h-screen">
      {/* Inherit Header */}
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-2 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.back()}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-sm font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none sm:text-base">
                  Entry Management
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
                <div className="relative group">
                  <Avatar 
                    className="h-8 w-8 ring-1 ring-pink-500/50"
                    onClick={() => router.push('/dashboard')}
                  >
                    <AvatarImage 
                      src={session?.user?.image || lastUploadedImage || ''} 
                      alt={session?.user?.name || 'User Profile'}
                      className="h-8 w-8"
                    />
                    <AvatarFallback className="text-xs">
                      {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-28 sm:pt-24 pb-6 sm:pb-8">
        {/* Search and Filter Controls */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Search by number or creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select
              value={productFilter}
              onValueChange={setProductFilter}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filter Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Products</SelectItem>
                <SelectItem value="AGO">AGO</SelectItem>
                <SelectItem value="PMS">PMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Entries Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {getFilteredEntries().map(entry => (
            <Card key={entry.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{entry.number}</span>
                  <span className={`text-sm font-normal px-2 py-1 rounded-full ${
                    entry.product === 'AGO' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {entry.product}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Initial:</span>
                    <span>{entry.initialQuantity.toLocaleString()}L</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Remaining:</span>
                    {editingEntry === entry.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(Number(e.target.value))}
                          className="w-32"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSave(entry)}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingEntry(entry.id);
                          setEditValue(entry.remainingQuantity);
                        }}
                      >
                        {entry.remainingQuantity.toLocaleString()}L
                      </Button>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Created by: {entry.createdBy}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
