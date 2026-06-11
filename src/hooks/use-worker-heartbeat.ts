"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseWorkerHeartbeatOptions {
  isOnline: boolean;
  userId: string | undefined;
  intervalMs?: number;
}

/**
 * Enterprise-grade worker heartbeat & GPS tracking hook.
 * Sends location updates to /api/worker/availability on a configurable interval.
 * Uses watchPosition for battery-efficient continuous tracking.
 * Automatically clears watchers on cleanup to prevent memory leaks.
 */
export function useWorkerHeartbeat({
  isOnline,
  userId,
  intervalMs = 30_000,
}: UseWorkerHeartbeatOptions) {
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  const reportLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!userId) return;
      try {
        await fetch("/api/worker/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: lat, longitude: lng }),
        });
        lastPositionRef.current = { lat, lng };
      } catch {
        // Silently fail — heartbeat is best-effort
      }
    },
    [userId]
  );

  const clearTrackers = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!userId || !isOnline) {
      clearTrackers();
      return;
    }

    if (!navigator.geolocation) return;

    // Get initial position immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => reportLocation(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 10_000 }
    );

    // Watch position for continuous updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Only report if position changed by >50m to save battery
        const last = lastPositionRef.current;
        const hasMovedSignificantly =
          !last ||
          Math.abs(last.lat - lat) > 0.0004 ||
          Math.abs(last.lng - lng) > 0.0004;

        if (hasMovedSignificantly) {
          reportLocation(lat, lng);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );

    // Heartbeat interval — resend last known position to keep worker "seen"
    intervalRef.current = setInterval(() => {
      const pos = lastPositionRef.current;
      if (pos) {
        reportLocation(pos.lat, pos.lng);
      }
    }, intervalMs);

    return clearTrackers;
  }, [userId, isOnline, reportLocation, clearTrackers, intervalMs]);
}
