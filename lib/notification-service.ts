import { toast } from "sonner";

export const showToast = (
  title: string,
  message: string,
  type: "success" | "info" | "warning" | "error" = "info",
  duration: number = 5000
) => {
  const options = {
    description: message,
    duration,
  };

  switch (type) {
    case "success":
      toast.success(title, options);
      break;
    case "error":
      toast.error(title, options);
      break;
    case "warning":
      toast.warning(title, options);
      break;
    case "info":
    default:
      toast.info(title, options);
      break;
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
