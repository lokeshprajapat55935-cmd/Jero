import { getSupabaseClient } from '@/lib/supabase/resolveClient';

export type Notification = {
  id: string;
  user_id: string;
  type: 'booking_update' | 'message' | 'system' | 'emergency_request' | 'emergency_request_cancelled' | 'booking_request' | 'booking_request_cancelled';
  title: string;
  content: string;
  link_url?: string;
  is_read: boolean;
  metadata: Record<string, any>;
  created_at: string;
};

export const notificationService = {
  async getNotifications() {
    try {
      const supabase = await getSupabaseClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.id) {
        return [];
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("Supabase error fetching notifications:", error);
        return [];
      }
      return (data || []) as Notification[];
    } catch (err) {
      console.error("Unexpected error in getNotifications:", err);
      return [];
    }
  },

  async markAsRead(notificationId: string) {
    if (!notificationId) return;
    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      
      if (error) {
        console.error("Supabase error markAsRead:", error);
      }
    } catch (err) {
      console.error("Unexpected error in markAsRead:", err);
    }
  },

  async markAllAsRead() {
    try {
      const supabase = await getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.id) return;

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      
      if (error) {
        console.error("Supabase error markAllAsRead:", error);
      }
    } catch (err) {
      console.error("Unexpected error in markAllAsRead:", err);
    }
  }
};
