import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const clientReviewSchema = z.object({
  booking_id: z.string().uuid(),
  rating: z.number().min(1).max(5),
  review_text: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
});

const workerReviewSchema = z.object({
  booking_id: z.string().uuid(),
  rating_behavior: z.number().int().min(1).max(5),
  rating_cooperation: z.number().int().min(1).max(5),
  rating_payment: z.number().int().min(1).max(5),
  review_text: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const body = await request.json();
    const admin = createAdminClient();

    // 1. Fetch booking to verify participants
    const bookingId = body.booking_id;
    if (!bookingId || typeof bookingId !== 'string') {
      return createErrorResponse('booking_id is required', 400);
    }

    const { data: booking, error: bookingErr } = await admin
      .from('bookings')
      .select('id, client_id, worker_id, status, category')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingErr || !booking) {
      return createErrorResponse('Booking not found.', 404);
    }

    if (booking.status !== 'completed') {
      return createErrorResponse('Reviews can only be submitted for completed bookings.', 400);
    }

    // Determine role of reviewer
    let reviewerRole: 'client' | 'worker';
    let validatedData: any;

    if (userId === booking.client_id) {
      reviewerRole = 'client';
      validatedData = clientReviewSchema.parse(body);
    } else if (userId === booking.worker_id) {
      reviewerRole = 'worker';
      validatedData = workerReviewSchema.parse(body);
    } else {
      return createErrorResponse('Only booking participants can review this booking.', 403);
    }

    // 2. Check for duplicate review by this role
    const { data: existingReview } = await admin
      .from('reviews')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('reviewer_role', reviewerRole)
      .maybeSingle();

    if (existingReview) {
      return createErrorResponse('You have already submitted a review for this booking.', 409);
    }

    // 3. Perform Insert
    let reviewInsertPayload: any = {
      booking_id: booking.id,
      worker_id: booking.worker_id,
      customer_id: booking.client_id,
      reviewer_role: reviewerRole,
      review_text: validatedData.review_text || null,
    };

    if (reviewerRole === 'client') {
      reviewInsertPayload.rating = validatedData.rating;
      reviewInsertPayload.tags = validatedData.tags || [];
    } else {
      reviewInsertPayload.rating_behavior = validatedData.rating_behavior;
      reviewInsertPayload.rating_cooperation = validatedData.rating_cooperation;
      reviewInsertPayload.rating_payment = validatedData.rating_payment;
      // Trigger will calculate overall rating, but we can pre-populate average here too
      reviewInsertPayload.rating = parseFloat(
        ((validatedData.rating_behavior + validatedData.rating_cooperation + validatedData.rating_payment) / 3).toFixed(2)
      );
    }

    const { data: review, error: insertErr } = await admin
      .from('reviews')
      .insert(reviewInsertPayload)
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    // 4. Populate review_tags junction table (for Client reviews)
    if (reviewerRole === 'client' && validatedData.tags && validatedData.tags.length > 0) {
      const tagRows = validatedData.tags.map((tag: string) => ({
        review_id: review.id,
        tag,
      }));
      await admin.from('review_tags').insert(tagRows);
    }

    // 5. Send In-App Notifications
    if (reviewerRole === 'client') {
      await admin.from('notifications').insert({
        user_id: booking.worker_id,
        type: 'review_received',
        title: 'New Review Received ⭐',
        content: `You received a ${validatedData.rating}-star review for your ${booking.category} service.`,
        link_url: '/worker/profile',
        metadata: { booking_id: booking.id, rating: validatedData.rating },
      });
    } else {
      await admin.from('notifications').insert({
        user_id: booking.client_id,
        type: 'review_received',
        title: 'Partner Rated You ⭐',
        content: `Your partner rated their experience with you for the ${booking.category} service.`,
        link_url: '/profile',
        metadata: { booking_id: booking.id },
      });
    }

    return createResponse({ review }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');
    const workerId = searchParams.get('worker_id');
    const customerId = searchParams.get('customer_id');

    if (!bookingId && !workerId && !customerId) {
      return createErrorResponse('booking_id, worker_id, or customer_id required', 400);
    }

    const admin = createAdminClient();
    
    let query = admin.from('reviews').select(`
      *,
      client:profiles!customer_id(id, full_name, avatar_url),
      worker:workers!worker_id(
        id,
        profile:profiles!id(id, full_name, avatar_url)
      )
    `);

    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    } else if (workerId) {
      query = query
        .eq('worker_id', workerId)
        .eq('reviewer_role', 'client')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });
    } else if (customerId) {
      query = query
        .eq('customer_id', customerId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });
    }

    const { data: reviews, error } = await query;
    if (error) throw error;

    // Transform reviews to format nicely for consumption
    const enriched = (reviews || []).map((r: any) => {
      // Resolve reviewer details depending on reviewer_role
      const reviewer = r.reviewer_role === 'client' 
        ? r.client 
        : (r.worker?.profile || { full_name: 'Partner', avatar_url: null });

      return {
        ...r,
        reviewer,
      };
    });

    return createResponse({ reviews: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}
