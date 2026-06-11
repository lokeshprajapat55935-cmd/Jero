import { createClient } from "@/lib/supabase/client";

export type EmergencyCategory = "Electrician" | "Plumber";

export type EmergencyRequest = {
  id: string;
  client_id: string;
  category: EmergencyCategory | string;
  location_address: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  area_id: string | null;
  status: "dispatching" | "accepted" | "expired" | "cancelled";
  accepted_worker_id: string | null;
  accepted_at: string | null;
  expires_at: string;
  notified_worker_count: number;
  created_at: string;
  worker?: {
    id: string;
    profile?: {
      full_name: string | null;
      phone: string | null;
      avatar_url: string | null;
    };
  } | null;
};

export const emergencyService = {
  async createRequest(payload: {
    category: EmergencyCategory | string;
    location_address?: string;
    latitude?: number | null;
    longitude?: number | null;
    area_id?: string | null;
  }) {
    const response = await fetch("/api/emergency/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Could not start emergency dispatch.");
    }

    return result.data as EmergencyRequest;
  },

  async getRequest(id: string) {
    const response = await fetch(`/api/emergency/request?id=${encodeURIComponent(id)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Could not load emergency request.");
    }

    return result.data as EmergencyRequest;
  },

  async acceptRequest(id: string) {
    const response = await fetch("/api/emergency/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emergency_request_id: id }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "This request is no longer available.");
    }

    return result.data;
  },

  subscribeToRequest(id: string, onChange: (request: EmergencyRequest) => void) {
    const supabase = createClient();
    const channel = supabase
      .channel(`emergency-request-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "emergency_requests", filter: `id=eq.${id}` },
        (payload: any) => onChange(payload.new as EmergencyRequest)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
