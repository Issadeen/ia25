import { OrderTracker } from './OrderTracker';

const tracker = new OrderTracker();

// Set current stats
tracker.updateStats({
    total: 91,
    queued: 86,
    unqueued: { ago: 0, pms: 5 },
    loaded: 75,
    pending: { ago: 0, pms: 11 },
    byType: { ago: 41, pms: 50 }
});

// Add the 16 new orders from 2 days ago
const twoDaysAgo = new Date();
twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);

tracker.updateStats({
    total: 107, // 91 + 16
    queued: 102, // 86 + 16
    byType: { ago: 47, pms: 60 }, // Added 6 AGO and 10 PMS
    newOrders: [{
        ago: 6,
        pms: 10,
        timestamp: twoDaysAgo
    }]
});

// Get the formatted summary
console.log(tracker.getFormattedSummary());
