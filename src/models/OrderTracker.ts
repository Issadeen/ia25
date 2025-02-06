interface OrderStats {
    timestamp: Date;
    total: number;
    queued: number;
    unqueued: {
        ago: number;
        pms: number;
    };
    loaded: number;
    pending: {
        ago: number;
        pms: number;
    };
    byType: {
        ago: number;
        pms: number;
    };
    newOrders: {
        ago: number;
        pms: number;
        timestamp: Date;
    }[];
}

export class OrderTracker {
    private stats: OrderStats;
    private readonly NEW_ORDER_THRESHOLD = 168; // 7 days * 24 hours

    constructor() {
        this.stats = this.initializeStats();
    }

    private initializeStats(): OrderStats {
        return {
            timestamp: new Date(),
            total: 0,
            queued: 0,
            unqueued: { ago: 0, pms: 0 },
            loaded: 0,
            pending: { ago: 0, pms: 0 },
            byType: { ago: 0, pms: 0 },
            newOrders: []
        };
    }

    public updateStats(newStats: Partial<OrderStats>) {
        const previousTotal = this.stats.total;
        this.stats = { ...this.stats, ...newStats, timestamp: new Date() };
        
        if (this.stats.total > previousTotal) {
            const newOrderCount = this.stats.total - previousTotal;
            this.stats.newOrders.push({
                ago: this.stats.byType.ago - (previousTotal ? previousTotal : 0),
                pms: this.stats.byType.pms - (previousTotal ? previousTotal : 0),
                timestamp: new Date()
            });
        }

        // Clean up old new orders
        this.cleanupOldNewOrders();
    }

    private cleanupOldNewOrders() {
        const threshold = new Date();
        threshold.setHours(threshold.getHours() - this.NEW_ORDER_THRESHOLD);
        this.stats.newOrders = this.stats.newOrders.filter(order => 
            order.timestamp > threshold
        );
    }

    public getFormattedSummary(): string {
        const newOrders = this.getNewOrdersSummary();
        return `
Order Summary (as of ${this.stats.timestamp.toLocaleString()}):
Total Orders: ${this.stats.total}
Queued Orders: ${this.stats.queued}
Unqueued Orders: ${this.stats.unqueued.ago + this.stats.unqueued.pms}
  AGO: ${this.stats.unqueued.ago}
  PMS: ${this.stats.unqueued.pms}
Loaded Orders: ${this.stats.loaded}
Pending Orders: ${this.stats.pending.ago + this.stats.pending.pms}
  AGO: ${this.stats.pending.ago}
  PMS: ${this.stats.pending.pms}
AGO Orders: ${this.stats.byType.ago}
PMS Orders: ${this.stats.byType.pms}

${newOrders}`;
    }

    private getNewOrdersSummary(): string {
        if (this.stats.newOrders.length === 0) return "No new orders in the last 7 days.";

        const totalNew = this.stats.newOrders.reduce(
            (acc, curr) => ({
                ago: acc.ago + curr.ago,
                pms: acc.pms + curr.pms
            }),
            { ago: 0, pms: 0 }
        );

        return `New Orders (last 7 days):
  Total New: ${totalNew.ago + totalNew.pms}
  AGO: ${totalNew.ago}
  PMS: ${totalNew.pms}`;
    }
}
