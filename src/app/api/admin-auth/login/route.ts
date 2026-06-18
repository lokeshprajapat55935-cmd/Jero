import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAdminSession } from '@/lib/admin/auth';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch the admin profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, admin_role')
      .eq('email', username)
      .eq('role', 'admin')
      .single();

    if (profileError || !profile) {
      // Log failed attempt generically
      await logAdminAction(supabase, null, 'failed_login', { username, ip: ipAddress }, 'Invalid username or password', ipAddress);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (profile.admin_role !== 'super_admin') {
      await logAdminAction(supabase, profile.id, 'failed_login', { reason: 'Not a super_admin', ip: ipAddress }, 'Insufficient permissions', ipAddress);
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // 2. Fetch the password hash and lockout status from admin_secrets
    const { data: secret, error: secretError } = await supabase
      .from('admin_secrets')
      .select('password_hash, failed_attempts, locked_until')
      .eq('admin_id', profile.id)
      .single();

    if (secretError || !secret) {
      await logAdminAction(supabase, profile.id, 'failed_login', { reason: 'No admin_secrets record', ip: ipAddress }, 'Account configuration error', ipAddress);
      return NextResponse.json({ error: 'Invalid credentials or account setup' }, { status: 401 });
    }

    // Check if account is temporarily locked
    if (secret.locked_until && new Date(secret.locked_until) > new Date()) {
      await logAdminAction(supabase, profile.id, 'locked_login_attempt', { ip: ipAddress }, 'Attempted login while account is locked', ipAddress);
      return NextResponse.json({ 
        error: 'Account temporarily locked due to multiple failed attempts. Please try again later.' 
      }, { status: 429 });
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, secret.password_hash);

    if (!isPasswordValid) {
      // Increment failed attempts via RPC
      await supabase.rpc('increment_admin_failed_attempts', { p_admin_id: profile.id });
      await logAdminAction(supabase, profile.id, 'failed_login', { ip: ipAddress }, 'Invalid password', ipAddress);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Password valid -> Reset failed attempts
    await supabase.rpc('reset_admin_failed_attempts', { p_admin_id: profile.id });

    // 4. Create the isolated admin session token
    await createAdminSession(profile.id);

    // 5. Log successful login
    await logAdminAction(supabase, profile.id, 'admin_login', { ip: ipAddress }, 'Successful admin login', ipAddress);

    return NextResponse.json({ success: true, redirectUrl: '/admin/dashboard' });

  } catch (error: any) {
    console.error('Admin Login Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Utility to write to admin_logs safely
async function logAdminAction(supabase: any, admin_id: string | null, action_type: string, details: any, reason: string, ip_address?: string) {
  try {
    await supabase.from('admin_logs').insert({
      admin_id: admin_id || '00000000-0000-0000-0000-000000000000', // Need UUID, use zero-UUID if unknown
      action_type,
      new_value: details,
      reason,
      ip_address,
    });
  } catch (err) {
    console.error('Failed to write admin log:', err);
  }
}
