"use client";

import React, { useEffect, useState } from 'react';
import { HomeTopBar } from '@/components/customer/home/HomeTopBar';
import { HomeSearchBar } from '@/components/customer/home/HomeSearchBar';
import { PromoBanner } from '@/components/customer/home/PromoBanner';
import { CategoryGrid } from '@/components/customer/home/CategoryGrid';
import { RecommendedWorkers } from '@/components/customer/home/RecommendedWorkers';
import { ActiveBookingCard } from '@/components/customer/home/ActiveBookingCard';
import { CategoryGridSkeleton, RecommendedWorkersSkeleton } from '@/components/customer/home/HomeSkeletons';
import { homeService, RecommendedWorker, ActiveBookingPreview } from '@/services/home';
import type { ServiceCategory } from '@/types';
import logger from '@/lib/logger';

export default function CustomerDashboard() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedWorker[]>([]);
  const [activeBooking, setActiveBooking] = useState<ActiveBookingPreview | null>(null);
  
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState(true);
  const [loadingBooking, setLoadingBooking] = useState(true);

  const [errorCategories, setErrorCategories] = useState(false);
  const [errorRecommendations, setErrorRecommendations] = useState(false);
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
    setLoadingRecommendations(true);
    setLoadingBooking(true);
    
    setErrorCategories(false);
    setErrorRecommendations(false);
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

    // Fetch Recommendations
    homeService.getRecommendations()
      .then(data => {
        setRecommendations(data);
        setLoadingRecommendations(false);
      })
      .catch(err => {
        logger.error('Failed to load recommendations', err);
        setErrorRecommendations(true);
        setLoadingRecommendations(false);
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
  };

  useEffect(() => {
    loadData();
  }, [isOffline]);

  return (
    <div className="min-h-screen bg-white pb-24">
      <HomeTopBar />
      
      <div className="max-w-md mx-auto sm:max-w-none">
        <HomeSearchBar />
        
        {/* Offline Fallback */}
        {isOffline && (
          <div className="mx-4 my-2 bg-red-50 border border-red-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-bold text-red-600 mb-1">You are offline</span>
            <span className="text-xs text-red-500">Please check your internet connection to load services.</span>
          </div>
        )}

        {/* Active Booking Block */}
        {errorBooking && (
          <div className="mx-4 my-2 p-3 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-between">
            <span className="text-xs font-bold text-red-700">Failed to refresh active bookings</span>
            <button 
              onClick={loadData} 
              className="text-xs font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider"
            >
              Retry
            </button>
          </div>
        )}
        {!loadingBooking && !errorBooking && activeBooking && (
          <ActiveBookingCard booking={activeBooking} />
        )}

        <PromoBanner />
        
        {/* Categories Section */}
        {errorCategories ? (
          <div className="mx-4 my-4 p-4 border border-red-100 bg-red-50 rounded-2xl text-center">
            <p className="text-sm font-semibold text-red-700">Failed to load categories</p>
            <button 
              onClick={loadData}
              className="mt-2 text-xs font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider"
            >
              Retry
            </button>
          </div>
        ) : loadingCategories ? (
          <CategoryGridSkeleton />
        ) : categories.length > 0 ? (
          <CategoryGrid categories={categories} />
        ) : (
          <div className="mx-4 my-4 p-4 border border-gray-100 bg-gray-50 rounded-2xl text-center">
            <p className="text-sm font-medium text-gray-500">No categories available at the moment</p>
          </div>
        )}
        
        {/* Recommendations Section */}
        {errorRecommendations ? (
          <div className="mx-4 my-4 p-4 border border-red-100 bg-red-50 rounded-2xl text-center">
            <h3 className="text-sm font-semibold text-red-700 mb-1">Failed to load recommendations</h3>
            <button 
              onClick={loadData}
              className="mt-1.5 text-xs font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider"
            >
              Retry
            </button>
          </div>
        ) : loadingRecommendations ? (
          <RecommendedWorkersSkeleton />
        ) : recommendations.length > 0 ? (
          <RecommendedWorkers workers={recommendations} />
        ) : (
          <div className="mx-4 my-4 p-4 border border-gray-100 bg-gray-50 rounded-2xl text-center">
            <p className="text-sm font-medium text-gray-500 font-semibold">No recommended professionals nearby</p>
          </div>
        )}
      </div>
    </div>
  );
}
