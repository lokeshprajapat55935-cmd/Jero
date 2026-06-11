import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);
    
    if (!userId) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from('worker_wallets')
      .select('balance, currency')
      .eq('worker_id', userId)
      .maybeSingle();

    if (error) {
      console.error("Supabase error fetching wallet:", error);
      return Response.json(
        { success: false, data: null, error: "Wallet fetch failed" },
        { status: 200 } // IMPORTANT: prevent UI crash
      );
    }

    const fallbackWallet = {
      balance: 0.00,
      currency: 'INR',
      status: 'active'
    };

    const wallet = data ? { ...data, status: 'active' } : fallbackWallet;

    return Response.json({ success: true, data: wallet }, { status: 200 });
  } catch (err) {
    console.error("Wallet API crash:", err);
    return Response.json(
      { success: false, data: null, error: "Internal Server Error" },
      { status: 200 }
    );
  }
}
