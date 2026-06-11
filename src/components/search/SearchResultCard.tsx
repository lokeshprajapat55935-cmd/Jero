import React from 'react';
import { useRouter } from 'next/navigation';
import { SearchResultItem } from '@/services/search.api';
import { Star, MapPin, BadgeCheck, Wrench } from 'lucide-react';

interface SearchResultCardProps {
  result: SearchResultItem;
  onClick: () => void;
}

export function SearchResultCard({ result, onClick }: SearchResultCardProps) {
  const router = useRouter();

  const handlePress = () => {
    onClick();
    if (result.type === 'category') {
      router.push(`/search?category=${result.slug}`);
    } else {
      router.push(`/worker/${result.id}`);
    }
  };

  if (result.type === 'category') {
    return (
      <div 
        onClick={handlePress}
        className="flex items-center gap-4 p-4 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100 cursor-pointer"
      >
        <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xl shadow-sm">
          {result.icon ? result.icon : <Wrench size={24} />}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-gray-900">{result.title}</h4>
          <span className="text-xs font-semibold text-blue-600">Service Category</span>
        </div>
      </div>
    );
  }

  // Worker Result
  return (
    <div 
      onClick={handlePress}
      className="flex items-start gap-4 p-4 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100 cursor-pointer"
    >
      <div className="relative">
        <div className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden border border-gray-200">
          {result.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.avatar_url} alt={result.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xl">
              {result.title.charAt(0)}
            </div>
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 border-2 border-white">
          <BadgeCheck size={12} className="text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <h4 className="font-bold text-gray-900 truncate pr-2">{result.title}</h4>
          <span className="text-sm font-black text-gray-900 whitespace-nowrap">₹{result.price}</span>
        </div>
        
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold text-gray-500 capitalize">{result.category}</span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <div className="flex items-center gap-0.5">
            <Star size={12} className="text-amber-500 fill-amber-500" />
            <span className="text-xs font-bold text-gray-700">{result.rating?.toFixed(1) || 'New'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-gray-500">
          <MapPin size={12} />
          <span className="text-[11px] font-medium truncate">{result.location || 'Nearby'}</span>
        </div>
      </div>
    </div>
  );
}
