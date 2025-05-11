'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil } from 'lucide-react';

interface ViewProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onEdit?: () => void;
}

export function ViewProfileModal({ isOpen, onClose, imageUrl, onEdit }: ViewProfileModalProps) {
  if (!imageUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0">
        <DialogHeader className="p-6 flex flex-row items-center justify-between">
          <DialogTitle>Profile Picture</DialogTitle>
          {onEdit && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
                onClose();
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
        </DialogHeader>
        <div className="relative w-full aspect-square">
          {/* Use img tag instead of Image to avoid next/image configuration issues */}
          <img 
            src={imageUrl}
            alt="Profile picture"
            className="w-full h-full object-cover rounded-md"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
