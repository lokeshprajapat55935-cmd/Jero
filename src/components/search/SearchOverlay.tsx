import React, { useEffect, useRef } from 'react';
import { useSearch } from '@/hooks/useSearch';
import { SearchResultCard } from './SearchResultCard';
import { Search, X, Mic, ArrowLeft, Clock, TrendingUp, AlertCircle, WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    query,
    setQuery,
    debouncedQuery,
    results,
    trending,
    recent,
    isLoading,
    error,
    isOffline,
    handleSearchCommit,
    clearRecent,
  } = useSearch();

  // Handle opening focus & body lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Small delay to ensure transition starts before focus
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const onResultClick = () => {
    handleSearchCommit(query);
    handleClose();
  };

  const handleRecentClick = (term: string) => {
    setQuery(term);
  };

  const handleTrendingClick = (slug: string) => {
    handleSearchCommit(slug);
    router.push(`/search?category=${slug}`);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col animate-in fade-in zoom-in-95 duration-200">
      {/* Header / Search Input */}
      <div className="bg-white px-4 pt-safe pb-4 shadow-sm border-b border-gray-100 z-10 flex flex-col gap-4">
        <div className="flex items-center gap-3 pt-4">
          <button 
            onClick={handleClose}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-900 active:scale-90 transition-transform rounded-full"
          >
            <ArrowLeft size={24} />
          </button>
          
          <div className="flex-1 relative flex items-center">
            <Search size={20} className="absolute left-3 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for plumbers, electricians..."
              className="w-full pl-10 pr-12 py-3.5 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl text-sm font-medium text-gray-900 transition-all placeholder:text-gray-400 shadow-inner"
            />
            {query ? (
              <button 
                onClick={() => setQuery('')}
                className="absolute right-3 p-1 text-gray-400 hover:text-gray-600 bg-gray-200 rounded-full"
              >
                <X size={14} />
              </button>
            ) : (
              <button className="absolute right-3 p-1 text-blue-500 hover:text-blue-600">
                <Mic size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        
        {/* Offline State */}
        {isOffline && (
          <div className="m-4 p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-3">
            <WifiOff className="text-orange-500" size={24} />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-orange-900">You are offline</span>
              <span className="text-xs font-medium text-orange-700">Search is currently unavailable.</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isOffline && (
          <div className="m-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
            <AlertCircle className="text-red-500" size={24} />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-red-900">Something went wrong</span>
              <span className="text-xs font-medium text-red-700">{error}</span>
            </div>
          </div>
        )}

        {/* Empty / Initial State (Recent & Trending) */}
        {!debouncedQuery && !isOffline && (
          <div className="p-4 space-y-8 animate-in fade-in duration-300">
            {recent.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    Recent Searches
                  </h3>
                  <button onClick={clearRecent} className="text-xs font-bold text-gray-400 hover:text-gray-600">
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((term, i) => (
                    <button
                      key={i}
                      onClick={() => handleRecentClick(term)}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 active:bg-gray-50 active:scale-95 transition-all shadow-sm"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {trending.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-blue-500" />
                  Trending Services
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {trending.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleTrendingClick(item.slug)}
                      className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-gray-100 shadow-sm active:scale-95 transition-transform cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl">
                        {item.icon}
                      </div>
                      <span className="text-xs font-bold text-gray-700">{item.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {debouncedQuery && isLoading && !isOffline && (
          <div className="animate-pulse flex flex-col mt-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex gap-4 p-4 border-b border-gray-100 bg-white">
                <div className="w-14 h-14 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results State */}
        {debouncedQuery && !isLoading && !error && !isOffline && results.length > 0 && (
          <div className="flex flex-col animate-in fade-in duration-300">
            {results.map((result) => (
              <SearchResultCard key={`${result.type}-${result.id}`} result={result} onClick={onResultClick} />
            ))}
          </div>
        )}

        {/* No Results State */}
        {debouncedQuery && !isLoading && !error && !isOffline && results.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-24 px-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search size={32} className="text-gray-300" />
            </div>
            <h3 className="text-lg font-black text-gray-900 mb-2">No results found</h3>
            <p className="text-sm font-medium text-gray-500">
              We could not find any services matching &quot;{debouncedQuery}&quot;. Try checking for typos or using different keywords.
            </p>
          </div>
        )}
        
      </div>
    </div>
  );
}
