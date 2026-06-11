export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  content: string;
  link_url?: string;
  is_read: boolean;
  created_at: string;
};

export const notificationsApi = {
  async getNotifications(limit = 50, offset = 0): Promise<{ data: Notification[]; error: string | null }> {
    try {
      const res = await fetch(`/api/notifications?limit=${limit}&offset=${offset}`);
      const json = await res.json();
      if (!res.ok || !json.success) return { data: [], error: json.error || 'Failed to load notifications' };
      return { data: json.data?.notifications || [], error: null };
    } catch (err: any) {
      return { data: [], error: err.message || 'Network error' };
    }
  },

  async getUnreadCount(): Promise<{ data: number; error: string | null }> {
    try {
      const res = await fetch('/api/notifications/unread-count');
      const json = await res.json();
      if (!res.ok || !json.success) return { data: 0, error: json.error || 'Failed to load unread count' };
      return { data: json.data?.unreadCount || 0, error: null };
    } catch (err: any) {
      return { data: 0, error: err.message || 'Network error' };
    }
  },

  async markAsRead(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const res = await fetch(`/api/notifications/mark-read/${id}`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok || !json.success) return { success: false, error: json.error || 'Failed to mark as read' };
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  },

  async markAllAsRead(): Promise<{ success: boolean; error: string | null }> {
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok || !json.success) return { success: false, error: json.error || 'Failed to mark all as read' };
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }
};
