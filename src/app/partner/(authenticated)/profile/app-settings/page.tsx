"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Settings,
  Globe,
  Bell,
  Moon,
  Sun,
  CheckCircle2,
  Loader2,
  BellOff,
} from "lucide-react";

interface SettingsData {
  language: "hi" | "en";
  notifications_enabled: boolean;
  dark_mode: boolean;
}

export default function AppSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    language: "hi",
    notifications_enabled: true,
    dark_mode: false,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/worker/profile/settings");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load settings");
        setSettings({
          language: json.data.language || "hi",
          notifications_enabled: json.data.notifications_enabled ?? true,
          dark_mode: json.data.dark_mode ?? false,
        });
      } catch (err: any) {
        console.error("[AppSettings] Load error:", err);
        // Use defaults silently — not a blocking error
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const updateSetting = async <K extends keyof SettingsData>(
    key: K,
    value: SettingsData[K]
  ) => {
    const previous = settings[key];
    // Optimistic update
    setSettings((prev) => ({ ...prev, [key]: value }));

    try {
      const res = await fetch("/api/worker/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      toast.success("Setting saved!");
    } catch (err: any) {
      console.error("[AppSettings] Save error:", err);
      // Rollback on failure
      setSettings((prev) => ({ ...prev, [key]: previous }));
      toast.error(err.message || "Failed to save setting");
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/worker/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save settings");
      toast.success("All settings saved successfully!");
    } catch (err: any) {
      console.error("[AppSettings] Save all error:", err);
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
        <p className="text-sm text-gray-500 font-medium">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-black text-gray-900">App Settings</h1>
            <p className="text-xs text-gray-500">Preferences saved to your account</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveAll} className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Language Selection */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-indigo-500" />
            Language
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "hi" as const, label: "हिंदी", sublabel: "Hindi" },
              { value: "en" as const, label: "English", sublabel: "English" },
            ].map((lang) => {
              const isSelected = settings.language === lang.value;
              return (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => updateSetting("language", lang.value)}
                  className={`flex flex-col items-center gap-1 py-4 px-3 rounded-2xl border-2 font-bold transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100"
                      : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <span className="text-lg">{lang.label}</span>
                  <span className="text-xs font-semibold opacity-70">{lang.sublabel}</span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-500 mt-1" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications Toggle */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-4">
            <Bell className="w-4 h-4 text-indigo-500" />
            Notifications
          </h2>

          <div
            onClick={() => updateSetting("notifications_enabled", !settings.notifications_enabled)}
            className="flex items-center justify-between cursor-pointer p-3 rounded-2xl hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  settings.notifications_enabled ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-400"
                }`}
              >
                {settings.notifications_enabled ? <Bell size={18} /> : <BellOff size={18} />}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">Push Notifications</p>
                <p className="text-xs text-gray-500">
                  {settings.notifications_enabled ? "Enabled — you'll receive job alerts" : "Disabled — no job alerts"}
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <div
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                settings.notifications_enabled ? "bg-indigo-500" : "bg-gray-200"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${
                  settings.notifications_enabled ? "left-6" : "left-0.5"
                }`}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400 font-medium px-3 pb-1">
            Receive alerts for new job requests, booking updates, and payment notifications.
          </p>
        </div>

        {/* Dark Mode Toggle */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-4">
            {settings.dark_mode ? (
              <Moon className="w-4 h-4 text-indigo-500" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            Display
          </h2>

          <div
            onClick={() => updateSetting("dark_mode", !settings.dark_mode)}
            className="flex items-center justify-between cursor-pointer p-3 rounded-2xl hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  settings.dark_mode ? "bg-indigo-900 text-indigo-300" : "bg-amber-50 text-amber-500"
                }`}
              >
                {settings.dark_mode ? <Moon size={18} /> : <Sun size={18} />}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">Dark Mode</p>
                <p className="text-xs text-gray-500">
                  {settings.dark_mode ? "Dark theme enabled" : "Light theme active"}
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <div
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                settings.dark_mode ? "bg-indigo-500" : "bg-gray-200"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${
                  settings.dark_mode ? "left-6" : "left-0.5"
                }`}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400 font-medium px-3 pb-1">
            Your display preference is saved to your account and persists across devices.
          </p>
        </div>

        {/* Save All Button */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black text-sm py-4 rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {saving ? "Saving..." : "Save All Settings"}
        </button>

        <p className="text-center text-xs text-gray-400 font-medium">
          Settings are synced to your account — they persist after logout and login.
        </p>
      </form>
    </div>
  );
}
