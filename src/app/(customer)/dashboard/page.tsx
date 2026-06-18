"use client";

import React, { useEffect, useState } from 'react';
import { HomeTopBar } from '@/components/customer/home/HomeTopBar';
import { HomeSearchBar } from '@/components/customer/home/HomeSearchBar';
import { PromoBanner } from '@/components/customer/home/PromoBanner';
import { CategoryGrid } from '@/components/customer/home/CategoryGrid';
import { ActiveBookingCard } from '@/components/customer/home/ActiveBookingCard';
import { RecentlyBooked } from '@/components/customer/home/RecentlyBooked';
import { TopCategories } from '@/components/customer/home/TopCategories';
import { WhyChooseZolvo } from '@/components/customer/home/WhyChooseZolvo';
import { PromoStrip } from '@/components/customer/home/PromoStrip';
import { 
  CategoryGridSkeleton, 
  BannerSkeleton 
} from '@/components/customer/home/HomeSkeletons';
import { homeService, ActiveBookingPreview } from '@/services/home';
import { bookingService } from '@/services/booking';
import type { ServiceCategory, Booking } from '@/types';
import logger from '@/lib/logger';

export default function CustomerDashboard() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [activeBooking, setActiveBooking] = useState<ActiveBookingPreview | null>(null);
  const [bookingsHistory, setBookingsHistory] = useState<Booking[]>([]);
  
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingBooking, setLoadingBooking] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [errorCategories, setErrorCategories] = useState(false);
  const [errorBooking, setErrorBooking] = useState(false);
  
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Basic offline detection fallback
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setIsOffline(true);
    }

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadData = () => {
    if (isOffline) return;

    setLoadingCategories(true);
    setLoadingBooking(true);
    setLoadingHistory(true);
    
    setErrorCategories(false);
    setErrorBooking(false);

    // Fetch Categories
    homeService.getCategories()
      .then(data => {
        setCategories(data);
        setLoadingCategories(false);
      })
      .catch(err => {
        logger.error('Failed to load categories', err);
        setErrorCategories(true);
        setLoadingCategories(false);
      });

    // Fetch Active Booking
    homeService.getActiveBooking()
      .then(data => {
        setActiveBooking(data);
        setLoadingBooking(false);
      })
      .catch(err => {
        logger.error('Failed to load active booking', err);
        setErrorBooking(true);
        setLoadingBooking(false);
      });

    // Fetch Booking History
    bookingService.getMyBookings('client')
      .then(res => {
        if (res && res.data) {
          setBookingsHistory(res.data);
        }
        setLoadingHistory(false);
      })
      .catch(err => {
        logger.error('Failed to load bookings history', err);
        setLoadingHistory(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [isOffline]);

  // Combined global loading state for layout skeleton structure
  const isGlobalLoading = loadingCategories && loadingBooking;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* SECTION 1 - Location Header */}
      <HomeTopBar />
      
      <div className="max-w-md mx-auto sm:max-w-none bg-white min-h-screen shadow-sm pb-16">
        {/* SECTION 2 - Search Bar & Pills */}
        <HomeSearchBar />
        
        {/* Offline Fallback */}
        {isOffline && (
          <div className="mx-4 my-2 bg-red-50 border border-red-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-bold text-red-600 mb-1">You are offline</span>
            <span className="text-xs text-red-500">Please check your internet connection to load services.</span>
          </div>
        )}

        {/* Global Loading Skeletons */}
        {isGlobalLoading ? (
          <div className="space-y-4">
            <BannerSkeleton />
            <CategoryGridSkeleton />
          </div>
        ) : (
          <>
            {/* Active Booking Card (only if loaded & valid, hidden on error/null per Empty State Rule) */}
            {!loadingBooking && !errorBooking && activeBooking && (
              <ActiveBookingCard booking={activeBooking} />
            )}

            {/* SECTION 3 - JERO Hero Card */}
            <PromoBanner />
            
            {/* SECTION 4 - Popular Services Grid (hidden on error/empty per Empty State Rule) */}
            {!errorCategories && categories.length > 0 && (
              <CategoryGrid categories={categories} />
            )}
            
            {/* SECTION 6 - Top Categories Cards */}
            <TopCategories />

            {/* SECTION 5 - Recently Booked Section (hidden on error/empty per Empty State Rule) */}
            {!loadingHistory && bookingsHistory.length > 0 && (
              <RecentlyBooked bookings={bookingsHistory} />
            )}

            {/* SECTION 7 - Why Choose Jero (Trust Section) */}
            <WhyChooseZolvo />

            {/* SECTION 8 - Promotional Strip */}
            <PromoStrip />
          </>
        )}
      </div>
    </div>
  );
}
