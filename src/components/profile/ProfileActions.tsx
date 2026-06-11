import React from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Wallet, CreditCard, MapPin, HelpCircle, Share2, Settings } from 'lucide-react';

export function ProfileActions() {
  const router = useRouter();

  const actions = [
    { icon: FileText, label: 'My Bookings', color: 'text-blue-600', bg: 'bg-blue-50', route: '/activity' },
    { icon: Wallet, label: 'Wallet', color: 'text-green-600', bg: 'bg-green-50', route: '/wallet' },
    { icon: CreditCard, label: 'Payments', color: 'text-purple-600', bg: 'bg-purple-50', route: '/payments' },
    { icon: MapPin, label: 'Addresses', color: 'text-orange-600', bg: 'bg-orange-50', route: '/addresses' },
    { icon: HelpCircle, label: 'Support', color: 'text-red-600', bg: 'bg-red-50', route: '/support' },
    { icon: Share2, label: 'Invite', color: 'text-indigo-600', bg: 'bg-indigo-50', route: '/invite' },
  ];

  return (
    <div className="bg-white mx-4 mt-6 p-4 rounded-3xl border border-gray-100 shadow-sm">
      <div className="grid grid-cols-3 gap-y-6 gap-x-2">
        {actions.map((action, i) => (
          <div 
            key={i} 
            onClick={() => router.push(action.route)}
            className="flex flex-col items-center justify-center gap-2 cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl ${action.bg} flex items-center justify-center ${action.color} group-hover:shadow-sm transition-all`}>
              <action.icon size={22} />
            </div>
            <span className="text-xs font-bold text-gray-700 text-center">{action.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
