import { createClient } from "@/lib/supabase/supabase-server";
import { redirect } from "next/navigation";

export default async function PartnerAppLayout({
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

    if (profile?.role === 'client') {
      redirect('/dashboard');
    }
  }

  return (
    <>
      {children}
    </>
  );
}