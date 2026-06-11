import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const addItemSchema = z.object({
  booking_id: z.string().uuid(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  notes: z.string().optional(),
});

const approveItemsSchema = z.object({
  booking_id: z.string().uuid(),
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');
    if (!bookingId) return createErrorResponse('booking_id required', 400);

    // Verify user is assigned client or worker of the booking
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('client_id, worker_id')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!booking) return createErrorResponse('Booking not found', 404);

    if (booking.client_id !== userId && booking.worker_id !== userId) {
      return createErrorResponse('Forbidden', 403);
    }

    const { data: items, error: itemsErr } = await supabase
      .from('booking_items')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (itemsErr) throw itemsErr;

    return createResponse({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const body = await request.json();
    const validated = addItemSchema.parse(body);
    const admin = createAdminClient();

    // Verify booking
    const { data: booking, error: fetchErr } = await admin
      .from('bookings')
      .select('worker_id, status')
      .eq('id', validated.booking_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!booking) return createErrorResponse('Booking not found', 404);

    // Only assigned worker can add items
    if (booking.worker_id !== userId) {
      return createErrorResponse('Forbidden: Only the assigned worker can add materials', 403);
    }

    // Must be in work_completed or awaiting_item_approval
    if (booking.status !== 'work_completed' && booking.status !== 'awaiting_item_approval') {
      return createErrorResponse(`Cannot add items in current booking status: ${booking.status}`, 400);
    }

    const itemTotal = validated.quantity * validated.unit_price;

    // Insert item
    const { data: newItem, error: insertErr } = await admin
      .from('booking_items')
      .insert({
        booking_id: validated.booking_id,
        name: validated.name,
        quantity: validated.quantity,
        unit_price: validated.unit_price,
        total_price: itemTotal,
        notes: validated.notes || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Sum all items for this booking
    const { data: items, error: sumErr } = await admin
      .from('booking_items')
      .select('total_price')
      .eq('booking_id', validated.booking_id);

    if (sumErr) throw sumErr;

    const totalMaterials = (items || []).reduce((sum, item) => sum + Number(item.total_price), 0);

    // Update material charge on booking.
    // Transition status to awaiting_item_approval automatically if it was work_completed.
    const newStatus = booking.status === 'work_completed' ? 'awaiting_item_approval' : booking.status;
    const { data: updatedBooking, error: updateErr } = await admin
      .from('bookings')
      .update({
        material_charge: totalMaterials,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.booking_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Log timeline
    await admin.from('booking_timeline').insert({
      booking_id: validated.booking_id,
      status: newStatus,
      reason: `Added material: ${validated.name} (Qty: ${validated.quantity}, Total: ₹${itemTotal}). Updated total materials to ₹${totalMaterials}.`,
      created_by: userId,
    });

    return createResponse({ item: newItem, booking: updatedBooking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const body = await request.json();
    const validated = approveItemsSchema.parse(body);
    const admin = createAdminClient();

    // Verify booking
    const { data: booking, error: fetchErr } = await admin
      .from('bookings')
      .select('client_id, worker_id, status, material_charge, service_charge, visit_charge, discount_amount, total_price')
      .eq('id', validated.booking_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!booking) return createErrorResponse('Booking not found', 404);

    // Only client can approve
    if (booking.client_id !== userId) {
      return createErrorResponse('Forbidden: Only the client can approve material charges', 403);
    }

    if (booking.status !== 'awaiting_item_approval') {
      return createErrorResponse(`Cannot approve items in current booking status: ${booking.status}`, 400);
    }

    // Insert approval log
    const { error: approvalErr } = await admin
      .from('booking_item_approvals')
      .insert({
        booking_id: validated.booking_id,
        client_id: userId,
        approved: true,
        notes: validated.notes || 'Items approved by client',
      });

    if (approvalErr) throw approvalErr;

    // Update booking status to item_approved
    const { data: updatedBooking, error: updateErr } = await admin
      .from('bookings')
      .update({
        status: 'item_approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.booking_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Timeline entry
    await admin.from('booking_timeline').insert({
      booking_id: validated.booking_id,
      status: 'item_approved',
      reason: `Material charges of ₹${booking.material_charge} approved by client. Bill locked at ₹${booking.total_price}.`,
      created_by: userId,
    });

    // Notify worker
    if (booking.worker_id) {
      await admin.from('notifications').insert({
        user_id: booking.worker_id,
        type: 'booking_update',
        title: 'Material Charges Approved ✓',
        content: `Client approved ₹${booking.material_charge} material charges. You can generate completion OTP now.`,
        link_url: '/worker/dashboard',
        metadata: {
          booking_id: validated.booking_id,
          status: 'item_approved',
        },
      });
    }

    return createResponse({ booking: updatedBooking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('id');
    if (!itemId) return createErrorResponse('id required', 400);

    const admin = createAdminClient();

    // Fetch the item to verify booking assignment
    const { data: item, error: itemErr } = await admin
      .from('booking_items')
      .select('*, booking:bookings(worker_id, status)')
      .eq('id', itemId)
      .maybeSingle();

    if (itemErr) throw itemErr;
    if (!item) return createErrorResponse('Item not found', 404);

    const booking = (item as any).booking;
    if (!booking) return createErrorResponse('Associated booking not found', 404);

    // Only assigned worker can delete
    if (booking.worker_id !== userId) {
      return createErrorResponse('Forbidden: Only the assigned worker can manage materials', 403);
    }

    // Must be in work_completed or awaiting_item_approval
    if (booking.status !== 'work_completed' && booking.status !== 'awaiting_item_approval') {
      return createErrorResponse(`Cannot remove items in current booking status: ${booking.status}`, 400);
    }

    // Delete item
    const { error: deleteErr } = await admin
      .from('booking_items')
      .delete()
      .eq('id', itemId);

    if (deleteErr) throw deleteErr;

    // Recalculate material charge
    const { data: items, error: sumErr } = await admin
      .from('booking_items')
      .select('total_price')
      .eq('booking_id', item.booking_id);

    if (sumErr) throw sumErr;

    const totalMaterials = (items || []).reduce((sum, it) => sum + Number(it.total_price), 0);

    // Update material charge on booking
    const { data: updatedBooking, error: updateErr } = await admin
      .from('bookings')
      .update({
        material_charge: totalMaterials,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.booking_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Log timeline
    await admin.from('booking_timeline').insert({
      booking_id: item.booking_id,
      status: booking.status,
      reason: `Removed material: ${item.name}. Updated total materials to ₹${totalMaterials}.`,
      created_by: userId,
    });

    return createResponse({ success: true, booking: updatedBooking });
  } catch (error) {
    return handleApiError(error);
  }
}
