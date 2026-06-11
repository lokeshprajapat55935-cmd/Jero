import { getSupabaseClient } from '@/lib/supabase/resolveClient';
import { Worker, Service } from '@/types';

export const workerService = {
  /**
   * Get worker by ID with profile and services
   */
  async getWorkerById(id: string) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workers')
      .select(`
        *,
        profile:profiles(*),
        services(*),
        wallet:worker_wallets(*),
        documents:worker_documents(*),
        location:worker_locations(*),
        categories:worker_service_categories(category)
      `)
      .eq('id', id)
      .single();
    
    return { data: data as any, error };
  },

  /**
   * Update worker profile data
   */
  async updateWorker(id: string, updates: Partial<Worker>) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    return { data, error };
  },

  /**
   * Add a new service to worker
   */
  async addService(service: Omit<Service, 'id' | 'created_at' | 'updated_at'>) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('services')
      .insert(service)
      .select()
      .single();
    
    return { data, error };
  },

  /**
   * Update an existing service
   */
  async updateService(id: string, updates: Partial<Service>) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    return { data, error };
  },

  /**
   * Delete a service
   */
  async deleteService(id: string) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id);
    
    return { error };
  },

  /**
   * Update availability
   */
  async updateAvailability(id: string, availability: any) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workers')
      .update({ availability })
      .eq('id', id)
      .select()
      .single();
    
    return { data, error };
  },

  /**
   * Get all workers with filtering and pagination
   */
  async getWorkers(filters?: { category?: string; query?: string }, page = 1, limit = 20) {
    const supabase = await getSupabaseClient();
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let query = supabase
      .from('workers')
      .select(`
        *,
        profile:profiles(*)
      `, { count: 'exact' })
      .eq('status', 'approved')
      .range(start, end);

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    if (filters?.query) {
      query = query.textSearch('search_vector', filters.query, {
        type: 'websearch',
        config: 'english'
      });
    }

    const { data, error, count } = await query.order('rating_avg', { ascending: false });
    
    return { data: data as Worker[] | null, error, count };
  }
};
