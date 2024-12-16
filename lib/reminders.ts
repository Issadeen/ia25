import { getDatabase, ref, get, set } from 'firebase/database';

type Reminder = {
  id: string;
  message: string;
  interval: number; // in hours
  lastShown?: number;
}

export const verificationReminders: Reminder[] = [
  {
    id: 'volume-verification',
    message: "🔍 Regular Volume Check Required: Please verify if your remaining balances match the KRA system to prevent misallocations.",
    interval: 4 // show every 4 hours
  },
  {
    id: 'balance-reconciliation',
    message: "📊 Time for Balance Reconciliation: Cross-check your system volumes with physical stock to maintain accuracy.",
    interval: 8 // show every 8 hours
  }
];

export const reminderService = {
  shouldShowReminder: async (reminderId: string, userId: string): Promise<boolean> => {
    const db = getDatabase();
    const reminderRef = ref(db, `reminders/${userId}/${reminderId}`);
    
    try {
      const snapshot = await get(reminderRef);
      const lastShown = snapshot.val()?.lastShown;
      if (!lastShown) return true;

      const reminder = verificationReminders.find(r => r.id === reminderId);
      if (!reminder) return false;

      const hoursElapsed = (Date.now() - lastShown) / (1000 * 60 * 60);
      return hoursElapsed >= reminder.interval;
    } catch (error) {
      console.error('Error checking reminder:', error);
      return false;
    }
  },

  markReminderShown: async (reminderId: string, userId: string) => {
    const db = getDatabase();
    const reminderRef = ref(db, `reminders/${userId}/${reminderId}`);
    
    try {
      await set(reminderRef, {
        lastShown: Date.now(),
        reminderId
      });
    } catch (error) {
      console.error('Error marking reminder as shown:', error);
    }
  },

  getNextReminder: async (userId: string): Promise<Reminder | null> => {
    for (const reminder of verificationReminders) {
      if (await reminderService.shouldShowReminder(reminder.id, userId)) {
        return reminder;
      }
    }
    return null;
  }
};
