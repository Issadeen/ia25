'use client';

import { useEffect } from 'react';
import { showToast, showSuccess, showError, showInfo, showWarning } from '@/lib/notification-service';

/**
 * A utility component that makes it easy to show toast notifications
 * from anywhere in your application.
 *
 * Usage: 
 * 1. Import toast functions directly: 
 *    import { showToast, showSuccess, showError } from '@/lib/notification-service';
 * 
 * 2. Use them anywhere in your application:
 *    showSuccess('Success', 'Your action was completed successfully');
 */
export const Notifications = {
  show: showToast,
  success: showSuccess,
  error: showError,
  info: showInfo,
  warning: showWarning,
};

export default Notifications;
