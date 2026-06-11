import React from 'react';
import { ActivityFilterType } from '@/services/activity.api';

interface ActivityFilterProps {
  currentFilter: ActivityFilterType;
  onFilterChange: (filter: ActivityFilterType) => void;
}

export function ActivityFilter({ currentFilter, onFilterChange }: ActivityFilterProps) {
  const filters: { label: string; value: ActivityFilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Ongoing', value: 'ongoing' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  return (
    <div className="w-full bg-white border-b border-gray-100 sticky top-safe-offset z-20">
      <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar snap-x">
        {filters.map((filter) => {
          const isActive = currentFilter === filter.value;
          return (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={`
                snap-start flex-none px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all
                ${isActive 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                }
              `}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
