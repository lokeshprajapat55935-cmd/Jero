'use client';

import React, { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, MapPin, Zap, Banknote, QrCode, CreditCard,
  CheckCircle2, Loader2, Clock, Calendar, X, ImagePlus,
  CalendarClock, Bolt, Info, ShieldCheck, Home
} from 'lucide-react';
import { bookingService } from '@/services/booking';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import logger from '@/lib/logger';

// ─── Constants & Fallbacks ──────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'electrician', label: 'Electrician', emoji: '⚡', desc: 'Wiring, fan, switchboard, inverter' },
  { id: 'plumber', label: 'Plumber', emoji: '🔧', desc: 'Leakage, taps, toilet, tanks' },
];

const PAYMENT_METHODS = [
  { id: 'cash' as const, label: 'Cash on Delivery', desc: 'Pay the worker in cash', Icon: Banknote },
  { id: 'upi' as const, label: 'UPI', desc: 'Pay via PhonePe, GPay, Paytm', Icon: QrCode },
  { id: 'card' as const, label: 'Card (Coming Soon)', desc: 'Debit / Credit card', Icon: CreditCard, disabled: true },
];

const TIME_SLOTS = [
  { id: 'morning' as const, label: 'Morning', time: '7 AM – 12 PM', emoji: '🌅' },
  { id: 'afternoon' as const, label: 'Afternoon', time: '12 PM – 5 PM', emoji: '☀️' },
  { id: 'evening' as const, label: 'Evening', time: '5 PM – 9 PM', emoji: '🌆' },
];

const MAX_IMAGES = 5;
const MAX_TOTAL_STEPS = 6;

// ─── Helpers ────────────────────────────────────────────────────────────────
function getScheduledFor(date: string, slot: string): string | null {
  if (!date || !slot) return null;
  const times: Record<string, string> = {
    morning: 'T09:00:00',
    afternoon: 'T13:00:00',
    evening: 'T17:00:00',
  };
  return `${date}${times[slot] || 'T09:00:00'}+05:30`;
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getTomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ─── Wizard Component ────────────────────────────────────────────────────────
function BookingNewWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Search parameters for prefilled catalog item
  const categoryParam = searchParams.get('category');
  const serviceParam = searchParams.get('service');
  const subServiceParam = searchParams.get('sub_service');
  const baseChargeParam = searchParams.get('base_charge');
  const visitChargeParam = searchParams.get('visit_charge');

  // Step state
  const [step, setStep] = useState(1);
  const [isPrefilled, setIsPrefilled] = useState(false);

  // Form Fields
  const [category, setCategory] = useState('');
  const [issue, setIssue] = useState('');
  
  // Pricing Details
  const [baseCharge, setBaseCharge] = useState(0);
  const [visitCharge, setVisitCharge] = useState(0);

  // Address Selector Option: 'manual' | 'gps' | 'saved'
  const [addressOption, setAddressOption] = useState<'manual' | 'gps' | 'saved'>('manual');
  const [address, setAddress] = useState('');
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  // Schedule (ASAP or Scheduled)
  const [bookingType, setBookingType] = useState<'asap' | 'scheduled'>('asap');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTimeSlot, setScheduledTimeSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning');

  // Description + Photos
  const [jobNotes, setJobNotes] = useState('');
  const [images, setImages] = useState<{ file: File; previewUrl: string; uploadedUrl?: string }[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic issues loaded from Database Service Catalog
  const [dynamicIssues, setDynamicIssues] = useState<{ name: string; base: number; visit: number }[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);

  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validate session, customer profile, and options on mount
  useEffect(() => {
    const validateAccess = async () => {
      try {
        const response = await fetch('/api/client/profile');
        if (!response.ok) {
          setValidationError('Please log in to continue booking.');
          setIsValidating(false);
          return;
        }

        const payload = await response.json();
        if (!payload.success || !payload.data) {
          setValidationError('Customer profile not found. Workers and Admins cannot access the customer booking flow.');
          setIsValidating(false);
          return;
        }

        const profileData = payload.data;
        if (profileData.role !== 'client') {
          setValidationError('Customer profile not found. Workers and Admins cannot access the customer booking flow.');
          setIsValidating(false);
          return;
        }

        const clientRecord = Array.isArray(profileData.clients) ? profileData.clients[0] : profileData.clients;
        if (clientRecord && clientRecord.address) {
          setSavedAddress(clientRecord.address);
          setAddressOption('saved');
          setAddress(clientRecord.address);
        }

        // Validate query params if present
        if (categoryParam) {
          const activeCategories = CATEGORIES.map(c => c.id);
          const isValidCategory = activeCategories.includes(categoryParam.toLowerCase()) || 
                                  CATEGORIES.some(c => c.label.toLowerCase() === categoryParam.toLowerCase());
          if (!isValidCategory) {
            setValidationError('Selected service category is currently unavailable.');
            setIsValidating(false);
            return;
          }
        }

        setIsValidating(false);
      } catch (err) {
        logger.error('Error during booking page validation', err);
        setValidationError('An unexpected error occurred. Please try again.');
        setIsValidating(false);
      }
    };

    validateAccess();
  }, [categoryParam]);

  // Prepopulate form if redirected from search or services page
  useEffect(() => {
    if (categoryParam && subServiceParam) {
      // Find matching category ID from the parameter string
      const matchedCat = CATEGORIES.find(
        c => c.label.toLowerCase() === categoryParam.toLowerCase() || c.id === categoryParam.toLowerCase()
      );
      
      setCategory(matchedCat?.id || categoryParam);
      setIssue(subServiceParam);
      setBaseCharge(Number(baseChargeParam || 0));
      setVisitCharge(Number(visitChargeParam || 0));
      setIsPrefilled(true);
      setStep(3); // Skip straight to address capture
    }
  }, [categoryParam, serviceParam, subServiceParam, baseChargeParam, visitChargeParam]);

  // Load predefined catalog issues dynamically when category is selected
  useEffect(() => {
    if (!category || isPrefilled) return;

    const fetchIssues = async () => {
      setLoadingIssues(true);
      try {
        const response = await fetch(`/api/catalog/services?category=${encodeURIComponent(category)}`);
        if (!response.ok) throw new Error('Catalog fetch failed');
        const payload = await response.json();
        if (payload.success && payload.data?.services) {
          // Flatten sub-services across all service groups in the category
          const issuesList: { name: string; base: number; visit: number }[] = [];
          payload.data.services.forEach((srv: any) => {
            (srv.sub_services || []).forEach((sub: any) => {
              issuesList.push({
                name: sub.name,
                base: sub.base_service_charge,
                visit: sub.visit_charge,
              });
            });
          });
          setDynamicIssues(issuesList);
        }
      } catch (err) {
        console.error('Error loading issues from catalog:', err);
      } finally {
        setLoadingIssues(false);
      }
    };

    fetchIssues();
  }, [category, isPrefilled]);

  // GPS Location handler
  const handleGps = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('GPS not supported on this device.');
      return;
    }
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAddress(`${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E (GPS captured)`);
        setIsGpsLoading(false);
        toast.success('Location coordinates captured!');
      },
      () => {
        setIsGpsLoading(false);
        toast.error('Could not obtain GPS. Enter manually.');
      },
      { timeout: 10000 }
    );
  }, []);

  // Sync address textarea with selected option
  useEffect(() => {
    if (addressOption === 'saved' && savedAddress) {
      setAddress(savedAddress);
    } else if (addressOption === 'gps') {
      if (latitude && longitude) {
        setAddress(`${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E (GPS captured)`);
      } else {
        setAddress('');
        handleGps();
      }
    } else if (addressOption === 'manual') {
      // Clear address if switching from GPS to manual
      if (address.includes('GPS captured')) {
        setAddress('');
      }
    }
  }, [addressOption, savedAddress, latitude, longitude, handleGps, address]);

  // Image file select handler
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, remaining);

    if (files.length > remaining) {
      toast.error(`Maximum ${MAX_IMAGES} photos allowed.`);
    }

    const newImages = toAdd.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages(prev => [...prev, ...newImages]);

    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [images]);

  const removeImage = useCallback((idx: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const uploadImages = useCallback(async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const img of images) {
      if (img.uploadedUrl) {
        urls.push(img.uploadedUrl);
        continue;
      }
      try {
        const { url } = await bookingService.uploadImage(img.file);
        urls.push(url);
      } catch (err: any) {
        toast.error(`Failed to upload photo: ${err.message}`);
        throw err;
      }
    }
    return urls;
  }, [images]);

  const canProceed = useCallback(() => {
    switch (step) {
      case 1: return !!category;
      case 2: return !!issue;
      case 3: return address.trim().length > 5;
      case 4:
        if (bookingType === 'asap') return true;
        return !!scheduledDate && !!scheduledTimeSlot;
      case 5: return true; // Description is optional
      case 6: return !!paymentMethod;
      default: return false;
    }
  }, [step, category, issue, address, bookingType, scheduledDate, scheduledTimeSlot, paymentMethod]);

  const handleNext = useCallback(() => {
    if (canProceed() && step < MAX_TOTAL_STEPS) setStep(s => s + 1);
  }, [canProceed, step]);

  const handleBack = useCallback(() => {
    if (isPrefilled && step === 3) {
      router.back();
    } else if (step > 1) {
      setStep(s => s - 1);
    } else {
      router.back();
    }
  }, [step, router, isPrefilled]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const toastId = toast.loading(
      bookingType === 'scheduled' ? 'Scheduling your booking...' : 'Creating your booking...'
    );

    try {
      let imageUrls: string[] = [];
      if (images.length > 0) {
        setIsUploadingImages(true);
        imageUrls = await uploadImages();
        setIsUploadingImages(false);
      }

      const scheduledFor = bookingType === 'scheduled'
        ? getScheduledFor(scheduledDate, scheduledTimeSlot)
        : null;

      // Find original display category text (like 'Electrician' from 'electrician')
      const catObj = CATEGORIES.find(c => c.id === category);
      const categoryLabel = catObj ? catObj.label : category;

      const booking = await bookingService.createBooking({
        category: categoryLabel,
        description: issue,
        location_address: address,
        latitude,
        longitude,
        payment_method: paymentMethod,
        booking_type: bookingType,
        scheduled_for: scheduledFor,
        scheduled_date: bookingType === 'scheduled' ? scheduledDate : null,
        scheduled_time_slot: bookingType === 'scheduled' ? scheduledTimeSlot : 'asap',
        image_urls: imageUrls,
        job_notes: jobNotes || undefined,
      });

      toast.success(
        bookingType === 'scheduled'
          ? 'Booking scheduled! Professionals will be dispatched dynamically.'
          : 'Booking created! Finding professionals near you...',
        { id: toastId }
      );
      router.push(`/booking/${booking.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create booking', { id: toastId });
    } finally {
      setIsSubmitting(false);
      setIsUploadingImages(false);
    }
  }, [
    isSubmitting, bookingType, images, uploadImages, scheduledDate, scheduledTimeSlot,
    category, issue, address, latitude, longitude, paymentMethod, jobNotes, router,
  ]);

  const STEP_TITLES = [
    'What do you need?',
    "What's the issue?",
    'Where are you?',
    'When do you need it?',
    'Describe the problem',
    'Pricing & Summary',
  ];

  if (isValidating) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <span className="text-xs text-gray-450 font-bold">Validating booking state...</span>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-gray-150 shadow-md text-center max-w-sm w-full">
          <Info className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-black text-gray-900 mb-2">Booking Issue</h2>
          <p className="text-xs font-semibold text-gray-500 mb-6 leading-relaxed">{validationError}</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => router.push('/dashboard')} className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold h-12 rounded-xl">
              Go to Dashboard
            </Button>
            {validationError.includes('onboarding') && (
              <Button onClick={() => router.push('/dashboard')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl">
                Complete Onboarding
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Book a Service</h1>
          <p className="text-xs text-gray-400">Step {step} of {MAX_TOTAL_STEPS}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-blue-600 transition-all duration-500"
          style={{ width: `${(step / MAX_TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 p-4 max-w-2xl mx-auto w-full overflow-y-auto">
        {/* Step 1: Category */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 mt-2">
              <h2 className="text-2xl font-black text-gray-900">{STEP_TITLES[0]}</h2>
              <p className="text-gray-500 text-sm mt-1">Select the service category</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setCategory(cat.id); setIssue(''); }}
                  className={cn(
                    'flex flex-col items-start p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]',
                    category === cat.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-100 bg-white hover:border-blue-200'
                  )}
                >
                  <span className="text-3xl mb-2">{cat.emoji}</span>
                  <p className={cn('font-bold text-sm', category === cat.id ? 'text-blue-900' : 'text-gray-900')}>
                    {cat.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{cat.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Issue */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 mt-2">
              <h2 className="text-2xl font-black text-gray-900">{STEP_TITLES[1]}</h2>
              <p className="text-gray-500 text-sm mt-1">Select the predefined service</p>
            </div>

            {loadingIssues ? (
              <div className="flex flex-col gap-2 pt-10 items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                <span className="text-xs text-gray-400 font-bold">Loading predefined catalog...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {dynamicIssues.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      setIssue(item.name);
                      setBaseCharge(item.base);
                      setVisitCharge(item.visit);
                    }}
                    className={cn(
                      'flex items-center justify-between w-full px-4 py-3.5 rounded-xl border-2 text-left transition-all',
                      issue === item.name
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-100 bg-white hover:border-blue-200'
                    )}
                  >
                    <div>
                      <span className={cn('font-bold text-sm block', issue === item.name ? 'text-blue-900' : 'text-gray-900')}>
                        {item.name}
                      </span>
                      <span className="text-[10px] text-gray-400 font-bold block mt-0.5">
                        Base: ₹{item.base} | Visit: ₹{item.visit}
                      </span>
                    </div>
                    {issue === item.name && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Location */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 mt-2">
              <h2 className="text-2xl font-black text-gray-900">{STEP_TITLES[2]}</h2>
              <p className="text-gray-500 text-sm mt-1">Choose where you need the service</p>
            </div>

            {/* Address Type Selector */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setAddressOption('saved')}
                disabled={!savedAddress}
                className={cn(
                  'py-3 px-2 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all',
                  addressOption === 'saved'
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-100 bg-white text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:border-blue-100'
                )}
              >
                <Home className="w-4 h-4" />
                <span>Saved Address</span>
              </button>
              
              <button
                type="button"
                onClick={() => setAddressOption('gps')}
                className={cn(
                  'py-3 px-2 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all',
                  addressOption === 'gps'
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-100 bg-white text-gray-500 hover:border-blue-100'
                )}
              >
                <MapPin className="w-4 h-4" />
                <span>Current Location</span>
              </button>

              <button
                type="button"
                onClick={() => setAddressOption('manual')}
                className={cn(
                  'py-3 px-2 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all',
                  addressOption === 'manual'
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-100 bg-white text-gray-500 hover:border-blue-100'
                )}
              >
                <MapPin className="w-4 h-4" />
                <span>Manual Entry</span>
              </button>
            </div>

            {/* Address display box or prompt */}
            {addressOption === 'saved' && savedAddress && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-xs font-semibold text-emerald-800">
                  Using your saved account address: <span className="block mt-1 font-bold text-emerald-950">{savedAddress}</span>
                </div>
              </div>
            )}

            {addressOption === 'gps' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGps}
                  disabled={isGpsLoading}
                  className="w-full flex items-center justify-center gap-2 h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-60"
                >
                  {isGpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  {isGpsLoading ? 'Locking Coordinates...' : 'Recapture GPS Location'}
                </button>
                {latitude && longitude && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-xs font-semibold text-emerald-800">
                      GPS coordinates locked successfully ({latitude.toFixed(5)}, {longitude.toFixed(5)})
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                Full Delivery Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                readOnly={addressOption !== 'manual'}
                placeholder="Flat, building, street, area, landmark in Bhilwara..."
                rows={4}
                className={cn(
                  "w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none outline-none transition-all",
                  addressOption !== 'manual' && "bg-gray-50 text-gray-500 border-gray-100 cursor-not-allowed"
                )}
              />
            </div>
          </div>
        )}

        {/* Step 4: Schedule */}
        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 mt-2">
              <h2 className="text-2xl font-black text-gray-900">{STEP_TITLES[3]}</h2>
              <p className="text-gray-500 text-sm mt-1">Choose when you need the service</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => setBookingType('asap')}
                className={cn(
                  'flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all',
                  bookingType === 'asap'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-200'
                )}
              >
                <div className={cn('p-3 rounded-xl', bookingType === 'asap' ? 'bg-blue-600' : 'bg-gray-100')}>
                  <Bolt className={cn('w-5 h-5', bookingType === 'asap' ? 'text-white' : 'text-gray-500')} />
                </div>
                <div className="text-center">
                  <p className={cn('font-black text-sm', bookingType === 'asap' ? 'text-blue-900' : 'text-gray-900')}>
                    ASAP
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Instant matching</p>
                </div>
                {bookingType === 'asap' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
              </button>

              <button
                onClick={() => setBookingType('scheduled')}
                className={cn(
                  'flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all',
                  bookingType === 'scheduled'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-indigo-200'
                )}
              >
                <div className={cn('p-3 rounded-xl', bookingType === 'scheduled' ? 'bg-indigo-600' : 'bg-gray-100')}>
                  <CalendarClock className={cn('w-5 h-5', bookingType === 'scheduled' ? 'text-white' : 'text-gray-500')} />
                </div>
                <div className="text-center">
                  <p className={cn('font-black text-sm', bookingType === 'scheduled' ? 'text-indigo-900' : 'text-gray-900')}>
                    Schedule
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Book future slot</p>
                </div>
                {bookingType === 'scheduled' && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
              </button>
            </div>

            {bookingType === 'asap' && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                <Zap className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-900">Instant Dispatch</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    We will find the nearest available verified professional in real-time. Sequence dispatch ensures fastest response.
                  </p>
                </div>
              </div>
            )}

            {bookingType === 'scheduled' && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                    Select Date
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: 'Today', value: getTodayStr() },
                      { label: 'Tomorrow', value: getTomorrowStr() },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setScheduledDate(opt.value)}
                        className={cn(
                          'py-2.5 rounded-xl border-2 font-bold text-sm transition-all',
                          scheduledDate === opt.value
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="date"
                    value={scheduledDate}
                    min={getTodayStr()}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                </div>

                {scheduledDate && (
                  <div className="animate-in fade-in duration-200">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                      Preferred Time Slot
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {TIME_SLOTS.map((slot) => (
                        <button
                          key={slot.id}
                          onClick={() => setScheduledTimeSlot(slot.id)}
                          className={cn(
                            'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all',
                            scheduledTimeSlot === slot.id
                              ? 'border-indigo-600 bg-indigo-50'
                              : 'border-gray-200 bg-white hover:border-indigo-200'
                          )}
                        >
                          <span className="text-xl">{slot.emoji}</span>
                          <p className={cn('font-bold text-xs', scheduledTimeSlot === slot.id ? 'text-indigo-900' : 'text-gray-800')}>
                            {slot.label}
                          </p>
                          <p className="text-[10px] text-gray-400">{slot.time}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Description + Photos */}
        {step === 5 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 mt-2">
              <h2 className="text-2xl font-black text-gray-900">{STEP_TITLES[4]}</h2>
              <p className="text-gray-500 text-sm mt-1">Provide details and photos of the problem (optional)</p>
            </div>

            <div className="mb-5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                Problem Description
              </label>
              <textarea
                value={jobNotes}
                onChange={(e) => setJobNotes(e.target.value.slice(0, 500))}
                placeholder="Give details - e.g. Ceiling fan switch regulator isn't working, making clicking noise..."
                rows={4}
                className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-1">{jobNotes.length}/500 characters</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Upload Photos (Max 5)
                </label>
                <span className="text-xs text-gray-400">{images.length}/{MAX_IMAGES}</span>
              </div>

              <div className="flex gap-3 flex-wrap">
                {images.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-gray-250">
                    <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}

                {images.length < MAX_IMAGES && (
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-1"
                  >
                    <ImagePlus className="w-5 h-5 text-gray-400" />
                    <span className="text-[10px] text-gray-450 font-bold">Add Photo</span>
                  </button>
                )}
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleImageSelect}
              />
              <p className="text-[10px] text-gray-400 mt-2">
                PNG, JPG, or WEBP. Max 5MB per file.
              </p>
            </div>
          </div>
        )}

        {/* Step 6: Pricing Summary */}
        {step === 6 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 mt-2">
              <h2 className="text-2xl font-black text-gray-900">{STEP_TITLES[5]}</h2>
              <p className="text-gray-500 text-sm mt-1">Review estimate and select payment</p>
            </div>

            {/* Pricing Preview Panel */}
            <div className="bg-gradient-to-br from-gray-900 to-slate-800 text-white rounded-3xl p-5 mb-5 shadow-md">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Estimates Pricing Preview</p>
              
              <div className="space-y-2 border-b border-slate-700/60 pb-3 mb-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-350">Worker Service Charge</span>
                  <span className="font-bold">₹{baseCharge}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-350">Visit Charge</span>
                  <span className="font-bold">₹{visitCharge}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 bg-slate-800/40 p-2.5 rounded-xl border border-slate-700/20">
                  <span className="font-medium">Material Cost</span>
                  <span className="font-bold">Not Included (Inspection decides)</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-300">Est. Total Pay</span>
                <span className="text-2xl font-black text-emerald-400">₹{baseCharge + visitCharge}</span>
              </div>
            </div>

            {/* Payment options */}
            <div className="flex flex-col gap-2.5 mb-5">
              {PAYMENT_METHODS.map(({ id, label, desc, Icon, disabled }) => (
                <button
                  key={id}
                  onClick={() => !disabled && setPaymentMethod(id)}
                  disabled={!!disabled}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                    paymentMethod === id && !disabled ? 'border-blue-600 bg-blue-50' : 'border-gray-100 bg-white',
                    disabled && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <div className={cn('p-2.5 rounded-xl', paymentMethod === id && !disabled ? 'bg-blue-600' : 'bg-gray-100')}>
                    <Icon className={cn('w-5 h-5', paymentMethod === id && !disabled ? 'text-white' : 'text-gray-600')} />
                  </div>
                  <div>
                    <p className={cn('font-bold text-sm', paymentMethod === id && !disabled ? 'text-blue-900' : 'text-gray-900')}>{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Booking Summary */}
            <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3.5">Booking Details</p>
              <div className="flex flex-col gap-2.5 text-sm font-medium">
                <SummaryRow label="Category" value={category.charAt(0).toUpperCase() + category.slice(1)} />
                <SummaryRow label="Predefined Service" value={issue} />
                <SummaryRow label="Address" value={address} truncate />
                {bookingType === 'scheduled' && scheduledDate ? (
                  <SummaryRow
                    label="Scheduled Time"
                    value={`${new Date(scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${TIME_SLOTS.find(s => s.id === scheduledTimeSlot)?.label}`}
                  />
                ) : (
                  <SummaryRow label="Timing Type" value="ASAP Dispatch" />
                )}
                {images.length > 0 && <SummaryRow label="Photos" value={`${images.length} photos uploaded`} />}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="sticky bottom-0 p-4 bg-white border-t border-gray-100 safe-area-bottom">
        {step < MAX_TOTAL_STEPS ? (
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="w-full h-14 bg-gray-900 hover:bg-gray-800 text-white font-bold text-base rounded-2xl flex items-center justify-center gap-2 disabled:opacity-40 transition-transform active:scale-[0.99]"
          >
            Continue <ArrowRight className="w-5 h-5" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !canProceed()}
            className={cn(
              'w-full h-14 font-bold text-base rounded-2xl flex items-center justify-center gap-2 disabled:opacity-40 text-white transition-transform active:scale-[0.99]',
              bookingType === 'scheduled'
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {isUploadingImages ? 'Uploading photos...' : bookingType === 'scheduled' ? 'Scheduling...' : 'Finding professionals...'}
              </>
            ) : bookingType === 'scheduled' ? (
              <><CalendarClock className="w-5 h-5" /> Schedule Booking</>
            ) : (
              <><Zap className="w-5 h-5" /> Confirm Booking</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4 py-1 border-b border-gray-50 last:border-b-0">
      <span className="text-gray-405 font-bold shrink-0">{label}</span>
      <span className={cn('font-black text-gray-850 text-right', truncate && 'max-w-[200px] line-clamp-2')}>{value}</span>
    </div>
  );
}

export default function BookingNewPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-gray-550" />
          <span className="text-xs text-gray-450 font-bold">Initializing Wizard...</span>
        </div>
      </div>
    }>
      <BookingNewWizard />
    </Suspense>
  );
}
