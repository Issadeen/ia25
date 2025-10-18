"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  XCircle,
  X 
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  count?: number;
}

interface ToastNotificationProps {
  notification: ToastNotification;
  onClose: (id: string) => void;
}

const ToastNotificationItem: React.FC<ToastNotificationProps> = ({ 
  notification, 
  onClose 
}) => {
  const { id, title, message, type, duration = 5000, count = 1 } = notification;
  
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);
    
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);
  
  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-white" />,
    error: <XCircle className="h-5 w-5 text-white" />,
    warning: <AlertCircle className="h-5 w-5 text-white" />,
    info: <Info className="h-5 w-5 text-white" />
  };
  
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500"
  };
  
  return (
    <div
      className={cn(
        "relative flex w-full sm:max-w-sm items-stretch rounded-lg shadow-xl overflow-hidden",
        "border-2 backdrop-blur-sm",
        {
          "border-green-400 dark:border-green-600": type === 'success',
          "border-red-400 dark:border-red-600": type === 'error',
          "border-amber-400 dark:border-amber-600": type === 'warning',
          "border-blue-400 dark:border-blue-600": type === 'info',
        }
      )}
    >
      <div className={`${colors[type]} p-3 flex items-center justify-center min-w-[48px]`}>
        {icons[type]}
      </div>
      <div className="p-3 bg-white/95 dark:bg-gray-900/95 flex-1 backdrop-blur-sm">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-tight">
                {title}
              </h4>
              {count > 1 && (
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-white rounded-full",
                  colors[type]
                )}>
                  {count}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed break-words">
              {message}
            </p>
          </div>
          <button 
            onClick={() => onClose(id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-100 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 p-1"
            aria-label="Close notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div 
        className={`absolute bottom-0 left-0 h-1 ${colors[type]} opacity-70`}
        style={{
          width: '100%',
          animation: `shrink ${duration}ms linear forwards`
        }}
      />
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};

interface ToastContainerProps {
  notifications: ToastNotification[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ 
  notifications,
  onClose
}) => {
  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto z-[9999] flex flex-col items-stretch sm:items-end space-y-3 max-h-screen overflow-y-auto overflow-x-hidden pointer-events-none pr-0 sm:pr-2 pb-4">
      <style jsx>{`
        div::-webkit-scrollbar {
          width: 6px;
        }
        div::-webkit-scrollbar-track {
          background: transparent;
        }
        div::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.3);
          border-radius: 3px;
        }
        div::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.5);
        }
      `}</style>
      <AnimatePresence mode="popLayout" initial={false}>
        {notifications.map((notification, index) => (
          <motion.div 
            key={notification.id} 
            className="pointer-events-auto w-full"
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              x: 0, 
              scale: 1,
              transition: {
                type: "spring",
                stiffness: 500,
                damping: 30,
                mass: 1
              }
            }}
            exit={{ 
              opacity: 0, 
              x: 50,
              scale: 0.8,
              transition: { duration: 0.2 }
            }}
            layout
          >
            <ToastNotificationItem 
              notification={notification} 
              onClose={onClose} 
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Create a React context to manage toast notifications
const ToastContext = React.createContext<{
  showToast: (toast: Omit<ToastNotification, 'id'>) => void;
  closeToast: (id: string) => void;
}>({
  showToast: () => {},
  closeToast: () => {},
});

export const useToastNotification = () => React.useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const notificationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = (toast: Omit<ToastNotification, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    setNotifications(prev => {
      // Check for similar notifications (same title and type within 3 seconds)
      const existingIndex = prev.findIndex(
        n => n.title === toast.title && 
             n.type === toast.type
      );
      
      if (existingIndex !== -1) {
        // Update the existing notification with a count
        const updated = [...prev];
        const existing = updated[existingIndex];
        
        // If it's the same notification, increment count
        if (existing.message === toast.message) {
          updated[existingIndex] = {
            ...existing,
            count: (existing.count || 1) + 1,
            // Reset the duration animation
            id: Math.random().toString(36).substring(2, 9)
          };
          return updated;
        }
      }
      
      // Add new notification and limit to 4 toasts at a time for better UX
      return [{ id, ...toast, count: 1 }, ...prev].slice(0, 4);
    });
  };

  const closeToast = (id: string) => {
    setNotifications(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, closeToast }}>
      {children}
      <ToastContainer notifications={notifications} onClose={closeToast} />
    </ToastContext.Provider>
  );
};
