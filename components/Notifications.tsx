'use client';

import { showToast, showSuccess, showError, showInfo, showWarning } from '@/lib/notification-service';

/**
 * A utility component that makes it easy to show toast notifications
 * from anywhere in your application using Sonner.
 *
 * Usage: 
 * 1. Import Notifications or toast functions directly: 
 *    import { Notifications } from '@/components/Notifications';
 *    import { toast } from 'sonner';
 * 
 * 2. Use them anywhere in your application:
 *    Notifications.success('Success', 'Your action was completed successfully');
 *    toast.success('Success', { description: 'Your action was completed' });
 */
export const Notifications = {
  show: showToast,
  success: showSuccess,
  error: showError,
  info: showInfo,
  warning: showWarning,
};

export default Notifications;
