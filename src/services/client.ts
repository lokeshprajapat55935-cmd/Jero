import { getSupabaseClient } from '@/lib/supabase/resolveClient';
import { ServiceRequest, SavedWorker } from '@/types';

export const clientService = {
  /**
   * Create a new service request
   */
  async createRequest(request: Omit<ServiceRequest, 'id' | 'client_id' | 'created_at' | 'status'>) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('service_requests')
      .insert(request)
      .select()
      .single();
    
    return { data, error };
  },

  /**
   * Get client's requests
   */
  async getRequests(clientId: string, limit?: number, offset?: number) {
    const supabase = await getSupabaseClient();
    let query = supabase
      .from('service_requests')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (limit !== undefined) {
      const start = offset || 0;
      const end = start + limit - 1;
      query = query.range(start, end);
    }
    
    const { data, error } = await query;
    return { data: data as ServiceRequest[] | null, error };
  },

  /**
   * Save a worker
   */
  async saveWorker(clientId: string, workerId: string) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('saved_workers')
      .insert({ client_id: clientId, worker_id: workerId })
      .select()
      .single();
    
    return { data, error };
  },

  /**
   * Get saved workers
   */
  async getSavedWorkers(clientId: string) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('saved_workers')
      .select(`
        *,
        worker:workers(*, profile:profiles(*))
      `)
      .eq('client_id', clientId);
    
    return { data: data as SavedWorker[] | null, error };
  },

  /**
   * Remove saved worker
   */
  async unsaveWorker(clientId: string, workerId: string) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('saved_workers')
      .delete()
      .eq('client_id', clientId)
      .eq('worker_id', workerId);
    
    return { error };
  }
};
