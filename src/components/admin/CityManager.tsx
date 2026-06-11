'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import logger from '@/lib/logger';
import { MapPin, Plus, Check, Loader2, X } from 'lucide-react';

interface City {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  description?: string;
}

interface Area {
  id: string;
  name: string;
  slug: string;
  pincode?: string;
}

interface State {
  id: string;
  name: string;
  code: string;
}

export function AdminCityManager() {
  const { toast } = useToast();
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [activeCity, setActiveCity] = useState<string>('bhilwara');
  const [loading, setLoading] = useState(false);
  const [savingCity, setSavingCity] = useState(false);

  // Forms Visibility States
  const [showAddCityForm, setShowAddCityForm] = useState(false);
  const [showAddAreaForm, setShowAddAreaForm] = useState(false);

  // Add City Form State
  const [newCityName, setNewCityName] = useState('');
  const [newCitySlug, setNewCitySlug] = useState('');
  const [newCityStateId, setNewCityStateId] = useState('');
  const [newCityDescription, setNewCityDescription] = useState('');
  const [newCityLat, setNewCityLat] = useState('');
  const [newCityLng, setNewCityLng] = useState('');
  const [isSubmittingCity, setIsSubmittingCity] = useState(false);

  // Add Area Form State
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaSlug, setNewAreaSlug] = useState('');
  const [newAreaPincode, setNewAreaPincode] = useState('');
  const [newAreaLat, setNewAreaLat] = useState('');
  const [newAreaLng, setNewAreaLng] = useState('');
  const [isSubmittingArea, setIsSubmittingArea] = useState(false);

  useEffect(() => {
    loadCities();
    loadConfig();
    loadStates();
  }, []);

  const loadCities = async () => {
    try {
      const res = await fetch('/api/admin/cities');
      const data = await res.json();
      if (data.cities) {
        setCities(data.cities);
        // Set Bhilwara as default selected if none selected yet
        if (!selectedCity) {
          const bhilwara = data.cities.find((c: any) => c.slug === 'bhilwara');
          if (bhilwara) {
            setSelectedCity(bhilwara);
            loadAreas(bhilwara.slug);
          } else if (data.cities.length > 0) {
            setSelectedCity(data.cities[0]);
            loadAreas(data.cities[0].slug);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load cities', error);
      toast({ variant: 'destructive', title: 'Failed to load cities' });
    }
  };

  const loadStates = async () => {
    try {
      const res = await fetch('/api/admin/states');
      const data = await res.json();
      if (data.states) {
        setStates(data.states);
        if (data.states.length > 0) {
          setNewCityStateId(data.states[0].id);
        }
      }
    } catch (error) {
      logger.error('Failed to load states', error);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/admin/config/active-city');
      const data = await res.json();
      setActiveCity(data.activeCity || 'bhilwara');
    } catch (error) {
      logger.error('Failed to load platform config', error);
    }
  };

  const loadAreas = async (citySlug: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cities/${citySlug}/areas`);
      const data = await res.json();
      setAreas(data.areas || []);
    } catch (error) {
      logger.error('Failed to load areas', error);
      toast({ variant: 'destructive', title: 'Failed to load areas' });
    } finally {
      setLoading(false);
    }
  };

  const setActiveCityHandler = async (citySlug: string) => {
    const confirmChange = window.confirm(
      'Are you sure you want to change the active city of the platform? This will change the primary market area for all customers.'
    );
    if (!confirmChange) return;

    setSavingCity(true);
    try {
      const res = await fetch('/api/admin/config/active-city', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citySlug })
      });

      if (!res.ok) throw new Error('Failed to update');

      const data = await res.json();
      setActiveCity(citySlug);
      toast({ title: 'Success', description: data.message });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed', description: error.message });
    } finally {
      setSavingCity(false);
    }
  };

  const handleAddCitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName || !newCitySlug || !newCityStateId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please fill in Name, Slug, and State.' });
      return;
    }

    setIsSubmittingCity(true);
    try {
      const res = await fetch('/api/admin/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCityName,
          slug: newCitySlug,
          state_id: newCityStateId,
          description: newCityDescription || undefined,
          latitude: newCityLat ? parseFloat(newCityLat) : undefined,
          longitude: newCityLng ? parseFloat(newCityLng) : undefined,
          is_active: false
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create city');

      toast({ title: 'Success', description: `City ${newCityName} created successfully!` });
      setShowAddCityForm(false);
      // Reset fields
      setNewCityName('');
      setNewCitySlug('');
      setNewCityDescription('');
      setNewCityLat('');
      setNewCityLng('');
      
      // Reload cities list
      await loadCities();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to create city', description: error.message });
    } finally {
      setIsSubmittingCity(false);
    }
  };

  const handleAddAreaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCity) return;
    if (!newAreaName || !newAreaSlug) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please fill in Name and Slug.' });
      return;
    }

    setIsSubmittingArea(true);
    try {
      const res = await fetch(`/api/admin/cities/${selectedCity.slug}/areas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAreaName,
          slug: newAreaSlug,
          pincode: newAreaPincode || undefined,
          latitude: newAreaLat ? parseFloat(newAreaLat) : undefined,
          longitude: newAreaLng ? parseFloat(newAreaLng) : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create area');

      toast({ title: 'Success', description: `Area ${newAreaName} created successfully!` });
      setShowAddAreaForm(false);
      // Reset fields
      setNewAreaName('');
      setNewAreaSlug('');
      setNewAreaPincode('');
      setNewAreaLat('');
      setNewAreaLng('');

      // Reload areas list
      await loadAreas(selectedCity.slug);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to create area', description: error.message });
    } finally {
      setIsSubmittingArea(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="text-primary" size={24} />
            <h2 className="text-xl font-bold">City Management</h2>
          </div>
          {!showAddCityForm && (
            <Button size="sm" onClick={() => setShowAddCityForm(true)} className="gap-1">
              <Plus size={16} /> Add City
            </Button>
          )}
        </div>

        {/* Add City Form */}
        {showAddCityForm && (
          <form onSubmit={handleAddCitySubmit} className="mb-6 p-4 border rounded-lg bg-secondary/20 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm">Add New City</h3>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAddCityForm(false)}>
                <X size={16} />
              </Button>
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div>
                <label className="text-xs font-bold text-muted-foreground">City Name*</label>
                <Input
                  required
                  placeholder="e.g. Jaipur"
                  value={newCityName}
                  onChange={(e) => {
                    setNewCityName(e.target.value);
                    setNewCitySlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground">Slug*</label>
                <Input
                  required
                  placeholder="e.g. jaipur"
                  value={newCitySlug}
                  onChange={(e) => setNewCitySlug(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div>
                <label className="text-xs font-bold text-muted-foreground">State*</label>
                <select
                  required
                  value={newCityStateId}
                  onChange={(e) => setNewCityStateId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                >
                  {states.map((state) => (
                    <option key={state.id} value={state.id}>
                      {state.name} ({state.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground">Description</label>
                <Input
                  placeholder="Optional details"
                  value={newCityDescription}
                  onChange={(e) => setNewCityDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div>
                <label className="text-xs font-bold text-muted-foreground">Latitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="e.g. 26.9124"
                  value={newCityLat}
                  onChange={(e) => setNewCityLat(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground">Longitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="e.g. 75.7873"
                  value={newCityLng}
                  onChange={(e) => setNewCityLng(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddCityForm(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmittingCity}>
                {isSubmittingCity && <Loader2 size={14} className="animate-spin mr-1" />}
                Create City
              </Button>
            </div>
          </form>
        )}

        {/* Cities List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Available Service Cities</h3>
          <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
            {cities.map((city) => (
              <button
                key={city.id}
                onClick={() => {
                  setSelectedCity(city);
                  loadAreas(city.slug);
                  setShowAddAreaForm(false);
                }}
                className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                  selectedCity?.id === city.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div>
                  <p className="font-bold">{city.name}</p>
                  <p className="text-xs text-muted-foreground">{city.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  {activeCity === city.slug ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded">
                      <Check size={14} /> Active City
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Inactive</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Set Active City Button */}
        {selectedCity && activeCity !== selectedCity.slug && (
          <Button
            className="w-full mt-4"
            onClick={() => setActiveCityHandler(selectedCity.slug)}
            disabled={savingCity}
          >
            {savingCity && <Loader2 size={16} className="animate-spin mr-2" />}
            Set {selectedCity.name} as Active City
          </Button>
        )}
      </Card>

      {/* Areas for Selected City */}
      {selectedCity && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">{selectedCity.name} - Areas</h3>
              <p className="text-xs text-muted-foreground">
                {areas.length} locations registered
              </p>
            </div>
            {!showAddAreaForm && (
              <Button size="sm" variant="outline" onClick={() => setShowAddAreaForm(true)} className="gap-1">
                <Plus size={16} /> Add Area
              </Button>
            )}
          </div>

          {/* Add Area Form */}
          {showAddAreaForm && (
            <form onSubmit={handleAddAreaSubmit} className="mb-6 p-4 border rounded-lg bg-secondary/20 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="font-bold text-sm">Add New Locality to {selectedCity.name}</h4>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAddAreaForm(false)}>
                  <X size={16} />
                </Button>
              </div>

              <div className="grid gap-3 grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-muted-foreground">Area Name*</label>
                  <Input
                    required
                    placeholder="e.g. Vaishali Nagar"
                    value={newAreaName}
                    onChange={(e) => {
                      setNewAreaName(e.target.value);
                      setNewAreaSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground">Slug*</label>
                  <Input
                    required
                    placeholder="e.g. vaishali-nagar"
                    value={newAreaSlug}
                    onChange={(e) => setNewAreaSlug(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid gap-3 grid-cols-3">
                <div className="col-span-1">
                  <label className="text-xs font-bold text-muted-foreground">Pincode</label>
                  <Input
                    placeholder="e.g. 302021"
                    value={newAreaPincode}
                    onChange={(e) => setNewAreaPincode(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-bold text-muted-foreground">Lat</label>
                  <Input
                    type="number"
                    step="0.0001"
                    placeholder="26.91"
                    value={newAreaLat}
                    onChange={(e) => setNewAreaLat(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-bold text-muted-foreground">Lng</label>
                  <Input
                    type="number"
                    step="0.0001"
                    placeholder="75.78"
                    value={newAreaLng}
                    onChange={(e) => setNewAreaLng(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddAreaForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmittingArea}>
                  {isSubmittingArea && <Loader2 size={14} className="animate-spin mr-1" />}
                  Create Area
                </Button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
              {areas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No areas registered yet in {selectedCity.name}.
                </p>
              ) : (
                areas.map((area) => (
                  <div
                    key={area.id}
                    className="flex justify-between items-center p-3 rounded-lg border border-border/50 hover:bg-secondary/30"
                  >
                    <div>
                      <p className="font-bold text-sm">{area.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {area.slug} {area.pincode && `• ${area.pincode}`}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
