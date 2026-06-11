export interface CustomerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  role: string;
  kyc_status: string;
  referral_code: string;
  address?: string | null;
}

export interface CustomerWallet {
  balance: number;
  currency: string;
  status: string;
}

export interface CustomerSettings {
  push_notifications: boolean;
  email_notifications: boolean;
  whatsapp_updates: boolean;
  language: string;
}

export interface ActivitySummary {
  total_bookings: number;
  active_bookings: number;
  completed_bookings: number;
}

export const profileApi = {
  async getProfile(): Promise<{ data: CustomerProfile | null; error: string | null }> {
    try {
      const res = await fetch('/api/customer/profile');
      const json = await res.json();
      if (!res.ok || !json.success) return { data: null, error: json.error || 'Failed to load profile' };
      return { data: json.data?.profile || null, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  async updateProfile(updates: Partial<CustomerProfile>): Promise<{ data: CustomerProfile | null; error: string | null }> {
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) return { data: null, error: json.error || 'Failed to update profile' };
      return { data: json.data?.profile || null, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  async getWallet(): Promise<{ data: CustomerWallet | null; error: string | null }> {
    try {
      const res = await fetch('/api/customer/wallet');
      const json = await res.json();
      if (!res.ok || !json.success) return { data: null, error: json.error || 'Failed to load wallet' };
      return { data: json.data || null, error: null }; // Updated to match actual wallet API response
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  async getSettings(): Promise<{ data: CustomerSettings | null; error: string | null }> {
    try {
      const res = await fetch('/api/customer/settings');
      const json = await res.json();
      if (!res.ok || !json.success) return { data: null, error: json.error || 'Failed to load settings' };
      return { data: json.data?.settings || null, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  async updateSettings(updates: Partial<CustomerSettings>): Promise<{ data: CustomerSettings | null; error: string | null }> {
    try {
      const res = await fetch('/api/customer/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) return { data: null, error: json.error || 'Failed to update settings' };
      return { data: json.data?.settings || null, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  async getActivitySummary(): Promise<{ data: ActivitySummary | null; error: string | null }> {
    try {
      const res = await fetch('/api/customer/activity-summary');
      const json = await res.json();
      if (!res.ok || !json.success) return { data: null, error: json.error || 'Failed to load activity summary' };
      return { data: json.data?.summary || null, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  }
};
