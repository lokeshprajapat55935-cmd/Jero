'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import { ArrowLeft, Search, Zap, Droplet, Wind, Hammer, Brush, Filter, Info, ShieldCheck, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';

interface SubService {
  id: string;
  name: string;
  description: string;
  base_service_charge: number;
  visit_charge: number;
}

interface Service {
  id: string;
  name: string;
  sub_services: SubService[];
}

interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
}

const iconMap: Record<string, React.ReactNode> = {
  electrician: <Zap className="w-6 h-6 text-amber-500" />,
  plumber: <Droplet className="w-6 h-6 text-blue-500" />,
};

export default function ServiceCatalogPage() {
  const params = useParams();
  const router = useRouter();
  const categoryId = typeof params.category === 'string' ? params.category : '';

  const ALLOWED_CATEGORIES = ['electrician', 'plumber'];
  if (categoryId && !ALLOWED_CATEGORIES.includes(categoryId.toLowerCase())) {
    notFound();
  }

  const [category, setCategory] = useState<CategoryInfo | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) return;

    const fetchCatalog = async () => {
      setError(null);
      let retryCount = 0;
      const maxRetries = 2;

      const doFetch = async () => {
        try {
          console.log(`[Catalog Page] Fetching category: ${categoryId} (Attempt ${retryCount + 1})`);
          const response = await fetch(`/api/catalog/services?category=${encodeURIComponent(categoryId)}`, {
            signal: AbortSignal.timeout(15000) // 15s timeout
          });
          const result = await response.json();
          
          if (response.ok && result.success) {
            setCategory(result.data.category);
            setServices(result.data.services);
            setLoading(false);
          } else {
            throw new Error(result.message || result.error || 'Failed to load services catalog.');
          }
        } catch (err: any) {
          console.error(`[Catalog Page] Fetch error:`, err);
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(doFetch, 1500 * retryCount);
          } else {
            setError(err.message || 'Services temporarily unavailable.');
            toast.error(err.message || 'Error loading services. Please try again.');
            setLoading(false);
          }
        }
      };

      doFetch();
    };

    fetchCatalog();
  }, [categoryId]);

  const handleBook = (serviceName: string, subService: SubService) => {
    // Navigate to booking creation with prepopulated options
    const query = new URLSearchParams({
      category: category?.name || categoryId,
      service: serviceName,
      sub_service: subService.name,
      base_charge: subService.base_service_charge.toString(),
      visit_charge: subService.visit_charge.toString(),
    }).toString();

    router.push(`/booking/new?${query}`);
  };

  // Filter services and sub-services based on search term
  const filteredServices = services
    .map(service => {
      const filteredSubs = service.sub_services.filter(sub =>
        sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sub.description && sub.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      return {
        ...service,
        sub_services: filteredSubs,
      };
    })
    .filter(service => service.sub_services.length > 0);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50/50 pb-24">
        {/* Skeleton Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-5 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        {/* Skeleton Search */}
        <div className="p-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
        {/* Skeleton Cards */}
        <div className="p-4 space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 space-y-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-gray-150 shadow-md text-center max-w-sm w-full">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Info className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-gray-900 mb-2">Category Unavailable</h2>
          <p className="text-xs font-semibold text-gray-500 mb-6 leading-relaxed">{error}</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => window.location.reload()} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl">
              Retry
            </Button>
            <Button onClick={() => router.push('/dashboard')} className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold h-12 rounded-xl">
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const categoryIcon = category ? (iconMap[category.id] || iconMap.electrician) : null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50/40 pb-24 animate-in fade-in duration-300">
      {/* Header */}
      <header className="bg-white px-4 py-4 border-b border-gray-100 sticky top-0 z-20 flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard')}
          className="p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
            {categoryIcon}
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 leading-tight">
              {category?.name || 'Service Catalog'}
            </h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Predefined Services</p>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="p-4 sticky top-[73px] bg-gray-50/90 backdrop-blur-md z-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={`Search for ${category?.name.toLowerCase() || 'services'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white border border-gray-100 shadow-sm font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Info Badge */}
      <div className="px-4 mb-2">
        <div className="bg-blue-50/50 border border-blue-100/50 rounded-2xl p-4 flex gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 leading-relaxed font-semibold">
            Standard pricing guarantees no overcharging. Pay after completion. All jobs are geofenced and performed by approved professionals.
          </div>
        </div>
      </div>

      {/* Services List */}
      <div className="p-4 flex-1">
        {filteredServices.length > 0 ? (
          <div className="space-y-6">
            {filteredServices.map((service) => (
              <div key={service.id} className="space-y-3">
                <h2 className="text-base font-black text-gray-900 px-1">
                  {service.name}
                </h2>
                <div className="space-y-3">
                  {service.sub_services.map((sub) => (
                    <div
                      key={sub.id}
                      className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between gap-4 hover:border-blue-200 transition-colors"
                    >
                      <div className="flex-1">
                        <h3 className="font-extrabold text-sm text-gray-900 mb-1">
                          {sub.name}
                        </h3>
                        <p className="text-xs text-gray-500 font-medium leading-relaxed">
                          {sub.description || 'Professional installation or repair service.'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-gray-50 pt-3">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Service Charge</span>
                          <span className="text-sm font-black text-emerald-600">
                            ₹{sub.base_service_charge}{' '}
                            <span className="text-[10px] text-gray-400 font-semibold font-sans">
                              (+ ₹{sub.visit_charge} Visit)
                            </span>
                          </span>
                        </div>

                        <Button
                          onClick={() => handleBook(service.name, sub)}
                          size="sm"
                          className="bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl px-4 py-2 text-xs flex items-center gap-1 shadow-sm transition-transform active:scale-95"
                        >
                          Book Now
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-20 text-center px-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Info className="w-8 h-8 text-gray-400" />
            </div>
            <p className="font-bold text-gray-800 text-base">No services found</p>
            <p className="text-xs text-gray-400 max-w-[200px] mt-1">
              Try searching with another keyword. No free-text booking allowed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
