'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Package, AlertCircle } from 'lucide-react';
import { Booking, BookingItem } from '@/types';
import { toast } from 'react-hot-toast';

interface BookingMaterialsProps {
  bookingId: string;
  onItemsChange?: (items: BookingItem[]) => void;
  readOnly?: boolean;
}

export function BookingMaterials({ bookingId, onItemsChange, readOnly = false }: BookingMaterialsProps) {
  const [items, setItems] = useState<BookingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);

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

  useEffect(() => {
    fetchItems();
  }, [bookingId]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || newItemQty <= 0) return;
    
    setIsAdding(true);
    try {
      const res = await fetch('/api/bookings/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          name: newItemName.trim(),
          quantity: newItemQty,
          unit_price: newItemPrice,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Material added');
        setNewItemName('');
        setNewItemQty(1);
        setNewItemPrice(0);
        fetchItems();
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const totalMaterials = items.reduce((sum, item) => sum + Number(item.total_price), 0);

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
                <p className="text-[10px] text-gray-500">
                  ₹{item.unit_price.toLocaleString('en-IN')} × {item.quantity}
                </p>
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
        <form onSubmit={addItem} className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <input
              type="text"
              placeholder="Material Name (e.g. 15W LED Bulb)"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Qty</label>
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
                <label className="text-[10px] font-bold text-gray-400 uppercase">Unit Price (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(parseInt(e.target.value) || 0)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  required
                />
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={isAdding || !newItemName.trim()}
            className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Material
          </button>
        </form>
      )}
    </div>
  );
}
