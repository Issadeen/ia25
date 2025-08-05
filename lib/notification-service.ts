import { useToastNotification } from "@/components/ui/toast-notification";

// This is a singleton instance of the notification service
let toastNotificationHook: ReturnType<typeof useToastNotification> | null = null;

export const setToastNotificationHook = (hook: ReturnType<typeof useToastNotification> | null) => {
  toastNotificationHook = hook;
};

export const showToast = (
  title: string,
  message: string,
  type: "success" | "info" | "warning" | "error" = "info",
  duration: number = 5000
) => {
  if (toastNotificationHook) {
    toastNotificationHook.showToast({
      title,
      message,
      type,
      duration,
    });
  } else {
    console.warn("Toast notification hook not set. Make sure you're using the ToastProvider.");
  }
};

// Helper functions for common notification types
export const showSuccess = (title: string, message: string, duration?: number) => 
  showToast(title, message, "success", duration);

export const showInfo = (title: string, message: string, duration?: number) => 
  showToast(title, message, "info", duration);

export const showWarning = (title: string, message: string, duration?: number) => 
  showToast(title, message, "warning", duration);

export const showError = (title: string, message: string, duration?: number) => 
  showToast(title, message, "error", duration);
