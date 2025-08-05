'use client';

import { useToastNotification } from "@/components/ui/toast-notification";
import { setToastNotificationHook } from "@/lib/notification-service";
import { useEffect } from "react";

export function ToastNotificationInitializer() {
  const toastNotification = useToastNotification();
  
  useEffect(() => {
    setToastNotificationHook(toastNotification);
    return () => setToastNotificationHook(null);
  }, [toastNotification]);
  
  return null;
}
