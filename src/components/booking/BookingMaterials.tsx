'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Package, Tag, Clock } from 'lucide-react';
import { BookingItem } from '@/types';
import { toast } from 'react-hot-toast';

interface BookingMaterialsProps {
  bookingId: string;
  workerId?: string;
  serviceCategory?: string;
  onItemsChange?: (items: BookingItem[]) => void;
  readOnly?: boolean;
}

const PREDEFINED_CATEGORIES: Record<string, { label: string; items: { name: string; suggestedPrice: number; category: string }[] }[]> = {
  Electrician: [
    {
      label: 'Main Items',
      items: [
        { name: 'Ceiling Fan', suggestedPrice: 1500, category: 'Main Items' },
        { name: 'Exhaust Fan', suggestedPrice: 800, category: 'Main Items' },
        { name: 'Water Motor', suggestedPrice: 3000, category: 'Main Items' },
        { name: 'MCB Box', suggestedPrice: 400, category: 'Main Items' },
      ],
    },
    {
      label: 'Electrical Items',
      items: [
        { name: 'Wire (Bundle)', suggestedPrice: 500, category: 'Electrical Items' },
        { name: 'Switch', suggestedPrice: 50, category: 'Electrical Items' },
        { name: 'Socket', suggestedPrice: 70, category: 'Electrical Items' },
        { name: 'MCB', suggestedPrice: 200, category: 'Electrical Items' },
        { name: 'LED Bulb', suggestedPrice: 150, category: 'Electrical Items' },
        { name: 'Holder', suggestedPrice: 40, category: 'Electrical Items' },
        { name: 'Capacitor', suggestedPrice: 120, category: 'Electrical Items' },
      ],
    },
    {
      label: 'Small Items',
      items: [
        { name: 'Screw/Nut Bolt Set', suggestedPrice: 20, category: 'Small Items' },
        { name: 'Insulation Tape', suggestedPrice: 20, category: 'Small Items' },
        { name: 'Connector', suggestedPrice: 15, category: 'Small Items' },
      ],
    },
  ],
  Plumber: [
    {
      label: 'Main Items',
      items: [
        { name: 'Water Tank', suggestedPrice: 2500, category: 'Main Items' },
        { name: 'Motor', suggestedPrice: 3000, category: 'Main Items' },
        { name: 'Flush Tank', suggestedPrice: 800, category: 'Main Items' },
      ],
    },
    {
      label: 'Plumbing Items',
      items: [
        { name: 'Pipe (ft)', suggestedPrice: 50, category: 'Plumbing Items' },
        { name: 'Tap', suggestedPrice: 250, category: 'Plumbing Items' },
        { name: 'Valve', suggestedPrice: 150, category: 'Plumbing Items' },
        { name: 'Elbow', suggestedPrice: 30, category: 'Plumbing Items' },
        { name: 'Tee Joint', suggestedPrice: 40, category: 'Plumbing Items' },
        { name: 'Teflon Tape', suggestedPrice: 15, category: 'Plumbing Items' },
      ],
    },
    {
      label: 'Small Items',
      items: [
        { name: 'Clamp', suggestedPrice: 10, category: 'Small Items' },
        { name: 'Screw Set', suggestedPrice: 20, category: 'Small Items' },
        { name: 'Connector', suggestedPrice: 20, category: 'Small Items' },
      ],
    },
  ],
  'AC Technician': [
    {
      label: 'AC Components',
      items: [
        { name: 'AC Unit Component', suggestedPrice: 1500, category: 'AC Components' },
        { name: 'Capacitor', suggestedPrice: 350, category: 'AC Components' },
        { name: 'Copper Pipe (m)', suggestedPrice: 800, category: 'AC Components' },
        { name: 'Drain Pipe', suggestedPrice: 150, category: 'AC Components' },
        { name: 'Gas Refill', suggestedPrice: 2500, category: 'AC Components' },
        { name: 'Bracket', suggestedPrice: 400, category: 'AC Components' },
      ],
    },
    {
      label: 'Small Items',
      items: [
        { name: 'Insulation Tape', suggestedPrice: 20, category: 'Small Items' },
        { name: 'Screw Set', suggestedPrice: 30, category: 'Small Items' },
      ],
    },
  ],
};

export function BookingMaterials({ bookingId, workerId, serviceCategory, onItemsChange, readOnly = false }: BookingMaterialsProps) {
  const [items, setItems] = useState<BookingItem[]>([]);
  const [frequentItems, setFrequentItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState<number | ''>('');

  const fetchItems = async () => {
    try {
      const res = await fetch(`/api/bookings/items?booking_id=${bookingId}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        onItemsChange?.(data.data.items);
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFrequentItems = async () => {
    if (!workerId || !serviceCategory) return;
    try {
      const res = await fetch(`/api/bookings/items/frequent?worker_id=${workerId}&category=${encodeURIComponent(serviceCategory)}`);
      const data = await res.json();
      if (data.success) {
        setFrequentItems(data.data.items);
      }
    } catch (err) {
      console.error('Failed to fetch frequent items:', err);
    }
  };

  useEffect(() => {
    fetchItems();
    if (!readOnly) {
      fetchFrequentItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, workerId, serviceCategory, readOnly]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || newItemQty <= 0 || newItemPrice === '') return;
    
    setIsAdding(true);
    try {
      const res = await fetch('/api/bookings/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          name: newItemName.trim(),
          category: newItemCategory || null,
          quantity: newItemQty,
          unit_price: Number(newItemPrice),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Material added');
        setNewItemName('');
        setNewItemCategory('');
        setNewItemQty(1);
        setNewItemPrice('');
        fetchItems();
        // Refresh frequent items softly
        fetchFrequentItems();
      } else {
        toast.error(data.error || 'Failed to add material');
      }
    } catch (err) {
      toast.error('Failed to add material');
    } finally {
      setIsAdding(false);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!confirm('Remove this material?')) return;
    
    try {
      const res = await fetch(`/api/bookings/items?id=${itemId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Material removed');
        fetchItems();
      } else {
        toast.error(data.error || 'Failed to remove material');
      }
    } catch (err) {
      toast.error('Failed to remove material');
    }
  };

  const selectSuggestion = (name: string, price: number, cat: string) => {
    setNewItemName(name);
    setNewItemPrice(price);
    setNewItemCategory(cat);
    setNewItemQty(1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const totalMaterials = items.reduce((sum, item) => sum + Number(item.total_price), 0);
  const predefined = serviceCategory ? PREDEFINED_CATEGORIES[serviceCategory] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-500" />
          Materials & Extras
        </h3>
        <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded-lg">
          Total: ₹{totalMaterials.toLocaleString('en-IN')}
        </span>
      </div>

      {items.length === 0 && !readOnly && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 font-medium">No materials added yet.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-white">
          {items.map((item) => (
            <div key={item.id} className="p-3 flex items-center justify-between group">
              <div>
                <p className="text-sm font-bold text-gray-800">{item.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.category && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {item.category}
                    </span>
                  )}
                  <p className="text-[10px] text-gray-500">
                    ₹{item.unit_price.toLocaleString('en-IN')} × {item.quantity}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-gray-900">₹{item.total_price.toLocaleString('en-IN')}</span>
                {!readOnly && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="space-y-4">
          {frequentItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Frequently Used
              </h4>
              <div className="flex flex-wrap gap-2">
                {frequentItems.map((fi, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectSuggestion(fi.name, Number(fi.unit_price), fi.category || '')}
                    className="bg-orange-50 hover:bg-orange-100 border border-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    {fi.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {predefined && predefined.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <h4 className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> {group.label}
              </h4>
              <div className="flex flex-wrap gap-2">
                {group.items.map((suggestion, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => selectSuggestion(suggestion.name, suggestion.suggestedPrice, suggestion.category)}
                    className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                  >
                    {suggestion.name} <span className="opacity-60 ml-1">₹{suggestion.suggestedPrice}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <form onSubmit={addItem} className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Custom Item</label>
                <input
                  type="text"
                  placeholder="Material Name (e.g. 15W LED Bulb)"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Unit Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value ? parseInt(e.target.value) : '')}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={isAdding || !newItemName.trim() || newItemPrice === ''}
              className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add Item
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
