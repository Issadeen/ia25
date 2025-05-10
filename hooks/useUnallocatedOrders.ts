import { useState, useEffect } from 'react';
import { getDatabase, ref, onValue } from 'firebase/database';
import type { WorkDetail } from '@/types/work';

export const useUnallocatedOrders = () => {
  const [unallocatedOrders, setUnallocatedOrders] = useState<WorkDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getDatabase();
    const workRef = ref(db, 'work_details');
    
    const unsubscribe = onValue(workRef, (snapshot) => {
      if (!snapshot.exists()) {
        setUnallocatedOrders([]);
        setLoading(false);
        return;
      }

      const orders: WorkDetail[] = [];
      snapshot.forEach((child) => {
        const order = child.val() as WorkDetail;
        const id = child.key;
        
        // Skip orders that:
        // 1. Already have permits allocated
        // 2. Are already loaded
        // 3. Are cancelled
        // 4. Have a local destination (case-insensitive)
        // 5. Have no destination
        
        // Check for local destination - using multiple checks to be thorough
        const isLocalDestination = 
          order.destination === 'local' || 
          order.destination === 'LOCAL' || 
          order.destination?.toLowerCase() === 'local';
        
        if (!order.permitAllocated && 
            !order.loaded && 
            order.status !== 'cancelled' && 
            !isLocalDestination && // Exclude local destination
            order.destination) { // Ensure destination exists
          
          orders.push({ 
            ...order, 
            id: id as string 
          });
        }
      });

      // Sort by creation date, newest first
      setUnallocatedOrders(orders.sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      ));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { unallocatedOrders, loading };
};
