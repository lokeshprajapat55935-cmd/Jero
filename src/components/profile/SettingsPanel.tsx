import React from 'react';
import { CustomerSettings } from '@/services/profile.api';
import { LogOut, Bell, Mail, MessageSquare, Globe, ChevronRight } from 'lucide-react';
import { authService } from '@/services/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

interface SettingsPanelProps {
  settings: CustomerSettings | null;
  onUpdate: (updates: Partial<CustomerSettings>) => Promise<boolean>;
}

export function SettingsPanel({ settings, onUpdate }: SettingsPanelProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await authService.signOut();
      document.cookie = "zolvo_auth_uid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "zolvo_role=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      router.push("/");
    } catch (e: any) {
      toast.error(e.message || "Logout failed");
    }
  };

  if (!settings) return null;

  return (
    <div className="mx-4 mt-6 flex flex-col gap-6">
      
      {/* Settings Section */}
      <div>
        <h3 className="px-4 text-xs font-black text-gray-500 uppercase tracking-wider mb-3">App Settings</h3>
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          
          {/* Push Notifications Toggle */}
          <div className="flex items-center justify-between p-4 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Bell size={16} />
              </div>
              <span className="font-bold text-gray-700 text-sm">Push Notifications</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.push_notifications}
                onChange={(e) => onUpdate({ push_notifications: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Email Notifications Toggle */}
          <div className="flex items-center justify-between p-4 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Mail size={16} />
              </div>
              <span className="font-bold text-gray-700 text-sm">Email Updates</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.email_notifications}
                onChange={(e) => onUpdate({ email_notifications: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* WhatsApp Updates Toggle */}
          <div className="flex items-center justify-between p-4 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                <MessageSquare size={16} />
              </div>
              <span className="font-bold text-gray-700 text-sm">WhatsApp Alerts</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.whatsapp_updates}
                onChange={(e) => onUpdate({ whatsapp_updates: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>

          {/* Language Selection */}
          <div 
            onClick={() => toast('Language options coming soon')}
            className="flex items-center justify-between p-4 active:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-600">
                <Globe size={16} />
              </div>
              <span className="font-bold text-gray-700 text-sm">Language</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">{settings.language}</span>
              <ChevronRight size={16} className="text-gray-300" />
            </div>
          </div>

        </div>
      </div>

      {/* Logout Button */}
      <button 
        onClick={handleLogout}
        className="w-full bg-white rounded-3xl p-4 border border-red-100 shadow-sm flex items-center justify-between text-red-600 active:bg-red-50 transition-colors mb-6"
      >
        <div className="flex items-center gap-3 font-bold text-sm">
          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
            <LogOut size={16} />
          </div>
          Secure Log Out
        </div>
        <ChevronRight size={16} className="text-red-200" />
      </button>

    </div>
  );
}
