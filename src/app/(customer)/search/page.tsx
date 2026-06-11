'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, Zap, Droplet, Wind, Hammer, Brush, Filter, Info, Loader2 } from 'lucide-react';
import { CATEGORIES } from '@/lib/constants';

interface SearchResult {
  id: string;
  sub_service_name: string;
  service_name: string;
  category_id: string;
  category_name: string;
  base_charge: number;
  visit_charge: number;
  description: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  electrician: <Zap size={16} className="text-amber-500" />,
  plumber: <Droplet size={16} className="text-blue-500" />,
};

const SUGGESTIONS = ['fan', 'tap', 'leakage'];

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');
        const payload = await response.json();
        if (payload.success) {
          setResults(payload.data.results || []);
        }
      } catch (err) {
        console.error('Error searching catalog', err);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const handleSelectResult = (item: SearchResult) => {
    const queryParams = new URLSearchParams({
      category: item.category_name,
      service: item.service_name,
      sub_service: item.sub_service_name,
      base_charge: item.base_charge.toString(),
      visit_charge: item.visit_charge.toString(),
    }).toString();
    router.push(`/booking/new?${queryParams}`);
  };

  return (
    <div className="p-4 sm:p-6 pb-24 animate-in fade-in duration-300">
      <h1 className="text-2xl font-black text-gray-900 mb-6">Search Services</h1>
      
      {/* Search Input */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input 
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you need help with? (e.g. fan, tap)"
          className="w-full pl-12 pr-12 py-4 rounded-2xl bg-gray-50 border-none font-semibold text-sm shadow-inner focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}
      </div>

      {/* Dynamic Results vs Fallbacks */}
      {query.trim() ? (
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
            Search Results ({results.length})
          </h2>
          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectResult(item)}
                  className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm active:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="p-1 bg-gray-50 rounded-lg shrink-0">
                        {categoryIcons[item.category_id] || categoryIcons.electrician}
                      </span>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        {item.category_name} &rarr; {item.service_name}
                      </span>
                    </div>
                    <div className="font-extrabold text-gray-900 text-sm">{item.sub_service_name}</div>
                    <div className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{item.description}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-600">₹{item.base_charge}</div>
                      <div className="text-[9px] text-gray-400 font-bold">Base Charge</div>
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Info size={32} className="text-gray-300 mb-2" />
                <p className="font-bold text-gray-700 text-sm">No services found</p>
                <p className="text-xs text-gray-400 max-w-[200px] mt-1">
                  We only support predefined catalog items. Please search using standard terms.
                </p>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick Suggestions */}
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">
              Popular Searches
            </h2>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  onClick={() => setQuery(sug)}
                  className="px-4 py-2 bg-gray-50 border border-gray-100 hover:bg-gray-100 hover:border-gray-200 text-gray-700 font-bold text-xs rounded-xl active:scale-95 transition-all"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* All Categories list */}
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">
              Browse Categories
            </h2>
            <div className="space-y-2">
              {CATEGORIES.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => router.push(`/services/${cat.id}`)}
                  className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm active:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="p-2 bg-gray-50 rounded-xl">
                      {categoryIcons[cat.id] || categoryIcons.electrician}
                    </span>
                    <span className="font-bold text-gray-800 text-sm">{cat.name}</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
