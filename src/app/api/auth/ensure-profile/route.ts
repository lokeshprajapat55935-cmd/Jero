import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse } from '@/lib/api-utils';
import logger from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, phone, intent } = body;

    if (!userId || !phone) {
      return createErrorResponse('Missing required fields: userId, phone', 400);
    }

    const selectedIntent = intent || 'client';
    const admin = createAdminClient();

    logger.info('Executing Server-Side ensureProfile', { 
      table: 'profiles', 
      action: 'select/update', 
      firebase_uid: userId,
      intent: selectedIntent
    });

    // 1. Try finding the profile by firebase_uid
    let { data, error } = await admin
      .from('profiles')
      .select('*')
      .eq('firebase_uid', userId)
      .maybeSingle();

    if (error) {
      logger.error('Database error fetching profile in ensure-profile API:', error);
      return createErrorResponse(error.message || 'Error fetching profile', 500, error);
    }

    // 2. If profile doesn't exist, create it
    if (!data) {
      const dbRole = selectedIntent === 'partner' ? 'worker' : selectedIntent;
      logger.info('Profile not found, preparing INSERT query on profiles', {
        table: 'profiles',
        payload: { firebase_uid: userId, phone, role: dbRole }
      });

      const res = await admin
        .from('profiles')
        .insert({
          firebase_uid: userId,
          phone,
          phone_verified: true,
          role: dbRole,
          onboarded: false,
          last_login_at: new Date().toISOString(),
        })
        .select('*')
        .maybeSingle();

      if (res.error) {
        logger.error('Database error inserting profile in ensure-profile API:', res.error);
        return createErrorResponse(res.error.message || 'Error creating profile', 500, res.error);
      }

      data = res.data;
    } else {
      // Update last login and potentially update role if they are cross-logging
      const dbRole = selectedIntent === 'partner' ? 'worker' : selectedIntent;
      if (data.role !== dbRole) {
        const updateRes = await admin
          .from('profiles')
          .update({ role: dbRole, last_login_at: new Date().toISOString() })
          .eq('id', data.id);
        if (updateRes.error) {
          logger.error('Database error updating profile role in ensure-profile API:', updateRes.error);
          return createErrorResponse(updateRes.error.message || 'Error updating profile role', 500, updateRes.error);
        }
        data.role = dbRole;
      } else {
        const updateRes = await admin
          .from('profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', data.id);
        if (updateRes.error) {
          logger.error('Database error updating profile login time in ensure-profile API:', updateRes.error);
          return createErrorResponse(updateRes.error.message || 'Error updating login time', 500, updateRes.error);
        }
      }
    }

    // 3. Check onboarding status in specific tables (customers/partners)
    let requiresOnboarding = false;
    let specificData = null;

    if (data) {
      if (data.role === 'client') {
        const { data: customerData, error: customerErr } = await admin
          .from('customers')
          .select('*')
          .eq('profile_id', data.id)
          .maybeSingle();

        if (customerErr) {
          logger.error('Database error fetching customer profile:', customerErr);
          return createErrorResponse(customerErr.message || 'Error fetching customer profile', 500, customerErr);
        }

        if (!customerData) {
          // Create customer profile automatically
          const { data: newCustomer, error: insertCustomerErr } = await admin
            .from('customers')
            .insert({
              profile_id: data.id,
              full_name: 'Customer', // Default placeholder
              city: 'Unknown'
            })
            .select('*')
            .maybeSingle();

          if (insertCustomerErr) {
            logger.error('Database error creating customer profile:', insertCustomerErr);
            return createErrorResponse(insertCustomerErr.message || 'Error creating customer profile', 500, insertCustomerErr);
          }

          // Mark profile as onboarded
          const updateOnboardRes = await admin
            .from('profiles')
            .update({ onboarded: true })
            .eq('id', data.id);
          if (updateOnboardRes.error) {
            logger.error('Database error updating onboarded status:', updateOnboardRes.error);
            return createErrorResponse(updateOnboardRes.error.message || 'Error updating onboarded status', 500, updateOnboardRes.error);
          }

          data.onboarded = true;
          specificData = newCustomer;
          requiresOnboarding = false;
        } else {
          specificData = customerData;
          requiresOnboarding = false;
        }
      } else if (data.role === 'worker') {
        const { data: partnerData, error: partnerErr } = await admin
          .from('partners')
          .select('*')
          .eq('profile_id', data.id)
          .maybeSingle();

        if (partnerErr) {
          logger.error('Database error fetching partner profile:', partnerErr);
          return createErrorResponse(partnerErr.message || 'Error fetching partner profile', 500, partnerErr);
        }

        // requiresOnboarding logic:
        // - profiles.onboarded = true  → onboarding was completed at some point → requiresOnboarding = false (authoritative)
        // - profiles.onboarded = false → check partners.current_step to decide
        // We never override a completed onboarding flag with a stale/inconsistent current_step value.
        const stepIncomplete = !partnerData || !partnerData.current_step || partnerData.current_step < 6;
        requiresOnboarding = !data.onboarded && stepIncomplete;

        logger.info('[ensure-profile] Worker onboarding check:', {
          profile_id: data.id,
          profiles_onboarded: data.onboarded,
          partners_current_step: partnerData?.current_step ?? null,
          partners_status: partnerData?.status ?? null,
          stepIncomplete,
          requiresOnboarding,
        });

        specificData = partnerData;
      }
    }

    logger.info('Successfully executed ensureProfile server-side:', { 
      userId, 
      role: data?.role,
      onboarded: data?.onboarded,
      requiresOnboarding
    });

    return createResponse({
      profile: data,
      specificData,
      requiresOnboarding
    });
  } catch (error: any) {
    logger.error('Unexpected error in ensure-profile API:', error);
    return createErrorResponse(error.message || 'Internal server error', 500);
  }
}
