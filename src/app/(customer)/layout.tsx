import { CustomerBottomNav } from "@/components/navigation/CustomerBottomNav";
import { createClient } from "@/lib/supabase/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role === 'worker') {
      redirect('/partner/dashboard');
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto bg-white shadow-xl min-h-screen">
        {children}
      </main>

      {/* Persistent Bottom Navigation */}
      <CustomerBottomNav />
    </div>
  );
}
