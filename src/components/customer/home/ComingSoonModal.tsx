"use client";

import React, { useEffect } from 'react';
import { X, Sparkles, Bell } from 'lucide-react';
import toast from 'react-hot-toast';

interface ComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceName: string;
}

export function ComingSoonModal({ isOpen, onClose, serviceName }: ComingSoonModalProps) {
  // Prevent background scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNotifyMe = () => {
    toast.success(`We will notify you when ${serviceName} service launches!`, {
      icon: '🔔',
      duration: 3000,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      {/* Tap-to-dismiss background */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Bottom Sheet Card */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-t-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 border-t border-gray-100 pb-8">
        
        {/* Handle bar */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 active:scale-90 transition-transform"
        >
          <X size={16} />
        </button>

        {/* Content */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mb-4 text-amber-500 animate-bounce">
            <Sparkles size={32} className="fill-amber-100" />
          </div>
          
          <h3 className="text-xl font-black text-gray-900 mb-2">
            {serviceName} Coming Soon!
          </h3>
          
          <p className="text-sm font-medium text-gray-500 leading-relaxed max-w-xs mb-8">
            We are expanding our services in Bhilwara. We will be at your doorstep with verified {serviceName.toLowerCase()} professionals very soon!
          </p>

          {/* Action buttons */}
          <div className="w-full space-y-3">
            <button
              onClick={handleNotifyMe}
              className="w-full h-14 rounded-2xl bg-black hover:bg-gray-800 active:scale-[0.98] text-white font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Bell size={18} />
              Notify Me on Launch
            </button>
            
            <button
              onClick={onClose}
              className="w-full h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-[0.98] text-gray-700 font-bold text-base transition-all"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
