'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import logger from '@/lib/logger';
import { adminFetch } from '@/lib/admin/api';
import type { Booking } from '@/types';
import { 
  Calendar,
  IndianRupee,
  Search, 
  Loader2, 
  Clock,
  FileText,
  User,
  MapPin,
  Image,
  RefreshCw,
  X,
  UserPlus,
  UserMinus,
  CheckCircle,
  AlertTriangle,
  Ban,
  Eye
} from 'lucide-react';

type TabType = 'all' | 'pending' | 'broadcasting' | 'active' | 'completed' | 'cancelled' | 'disputed';

export function BookingsManagement() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Status Change State
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [statusReason, setStatusReason] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Reassign Modal State
  const [reassignBooking, setReassignBooking] = useState<Booking | null>(null);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [reassignReason, setReassignReason] = useState<string>('');
  const [loadingWorkers, setLoadingWorkers] = useState<boolean>(false);
  const [submittingReassign, setSubmittingReassign] = useState<boolean>(false);

  // Cancellation Modal State
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [submittingCancel, setSubmittingCancel] = useState<boolean>(false);

  // Detail Drawer State
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [otpLogs, setOtpLogs] = useState<any[]>([]);
  const [loadingOtpLogs, setLoadingOtpLogs] = useState(false);

  useEffect(() => {
    if (detailBooking) {
      loadOtpLogs(detailBooking.id);
    } else {
      setOtpLogs([]);
    }
  }, [detailBooking]);

  const loadOtpLogs = async (bookingId: string) => {
    setLoadingOtpLogs(true);
    try {
      const res = await adminFetch(`/api/admin/bookings/otp-logs?booking_id=${bookingId}`);
      const data = await res.json();
      if (data.logs) {
        setOtpLogs(data.logs);
      }
    } catch (error) {
      logger.error('Failed to load OTP logs', error);
    } finally {
      setLoadingOtpLogs(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    applyFiltersAndSearch();
  }, [bookings, search, statusFilter]);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/bookings');
      const data = await res.json();
      if (data.bookings) {
        setBookings(data.bookings);
        // Update detail booking if it is currently open in drawer
        if (detailBooking) {
          const freshDetail = data.bookings.find((b: Booking) => b.id === detailBooking.id);
          if (freshDetail) setDetailBooking(freshDetail);
        }
      }
    } catch (error) {
      logger.error('Failed to load bookings', error);
      toast({ variant: 'destructive', title: 'Failed to load bookings' });
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSearch = () => {
    let list = [...bookings];

    // Status group filters
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        const activeGroup = ['accepted', 'worker_arriving', 'en_route', 'work_started', 'started', 'work_completed', 'work_completed_pending_otp', 'awaiting_item_approval', 'item_approved', 'otp_generated', 'otp_verified', 'awaiting_payment', 'payment_processing', 'payment_verified'];
        list = list.filter((b) => activeGroup.includes(b.status));
      } else if (statusFilter === 'completed') {
        list = list.filter((b) => b.status === 'completed' || b.status === 'paid_completed');
      } else {
        list = list.filter((b) => b.status === statusFilter);
      }
    }

    // Search query
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.client?.profile?.full_name?.toLowerCase().includes(q) ||
          b.worker?.profile?.full_name?.toLowerCase().includes(q) ||
          b.worker?.category?.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q)
      );
    }

    setFilteredBookings(list);
  };

  const startStatusChange = (booking: Booking, status: string) => {
    setSelectedBooking(booking);
    setTargetStatus(status);
    setStatusReason('');
  };

  const cancelStatusChange = () => {
    setSelectedBooking(null);
    setTargetStatus('');
    setStatusReason('');
  };

  const submitStatusChange = async () => {
    if (!selectedBooking || !targetStatus) return;

    setSubmittingStatus(true);
    try {
      const res = await adminFetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: selectedBooking.id,
          status: targetStatus,
          reason: statusReason.trim() !== '' ? statusReason : undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Status change failed');

      toast({
        title: 'Booking status updated',
        description: `Booking updated to ${targetStatus} successfully.`,
      });

      loadBookings();
      cancelStatusChange();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to update booking',
        description: error.message,
      });
    } finally {
      setSubmittingStatus(false);
    }
  };

  // Reassign Modal Trigger
  const openReassignModal = async (booking: Booking) => {
    setReassignBooking(booking);
    setSelectedWorkerId('');
    setReassignReason('');
    setLoadingWorkers(true);
    try {
      const res = await adminFetch('/api/admin/workers');
      const data = await res.json();
      if (data.workers) {
        // Filter: approved workers of same category
        const filtered = data.workers.filter(
          (w: any) => w.status === 'approved' && w.category === booking.category
        );
        setAvailableWorkers(filtered);
      }
    } catch (error) {
      logger.error('Failed to load workers', error);
      toast({ variant: 'destructive', title: 'Failed to load workers' });
    } finally {
      setLoadingWorkers(false);
    }
  };

  const submitReassign = async () => {
    if (!reassignBooking || !selectedWorkerId || !reassignReason) return;
    setSubmittingReassign(true);
    try {
      const res = await adminFetch('/api/admin/bookings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: reassignBooking.id,
          new_worker_id: selectedWorkerId,
          reason: reassignReason.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Reassignment failed');

      toast({ title: 'Worker reassigned successfully' });
      loadBookings();
      setReassignBooking(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Reassignment failed', description: error.message });
    } finally {
      setSubmittingReassign(false);
    }
  };

  // Cancel Modal Trigger
  const openCancelModal = (booking: Booking) => {
    setCancelBooking(booking);
    setCancelReason('');
  };

  const submitCancel = async () => {
    if (!cancelBooking || !cancelReason) return;
    setSubmittingCancel(true);
    try {
      const res = await adminFetch('/api/admin/bookings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: cancelBooking.id,
          reason: cancelReason.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Cancellation failed');

      toast({ title: 'Booking cancelled successfully' });
      loadBookings();
      setCancelBooking(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Cancellation failed', description: error.message });
    } finally {
      setSubmittingCancel(false);
    }
  };

  const getStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[inset_0_1px_0_0_rgba(59,130,246,0.1)]">Pending</Badge>;
      case 'broadcasting':
        return <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[inset_0_1px_0_0_rgba(168,85,247,0.1)] animate-pulse">Broadcasting</Badge>;
      case 'accepted':
        return <Badge className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[inset_0_1px_0_0_rgba(99,102,241,0.1)]">Accepted</Badge>;
      case 'worker_arriving':
      case 'en_route':
        return <Badge className="bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[inset_0_1px_0_0_rgba(14,165,233,0.1)]">En Route</Badge>;
      case 'work_started':
      case 'started':
        return <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[inset_0_1px_0_0_rgba(245,158,11,0.1)]">In Progress</Badge>;
      case 'work_completed':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.1)]">Work Finished (Legacy)</Badge>;
      case 'work_completed_pending_otp':
        return <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[inset_0_1px_0_0_rgba(249,115,22,0.1)] animate-pulse">Awaiting OTP</Badge>;
      case 'item_approved':
        return <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Item Approved</Badge>;
      case 'otp_generated':
        return <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20">OTP Sent</Badge>;
      case 'otp_verified':
        return <Badge className="bg-teal-500/10 text-teal-400 border border-teal-500/20">OTP Verified</Badge>;
      case 'awaiting_payment':
        return <Badge className="bg-teal-500/10 text-teal-400 border border-teal-500/20">Awaiting Payment</Badge>;
      case 'payment_processing':
        return <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/20">Processing Payment</Badge>;
      case 'payment_verified':
      case 'completed':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.1)]">Completed</Badge>;
      case 'paid_completed':
        return <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.2)]">Paid Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 shadow-[inset_0_1px_0_0_rgba(239,68,68,0.1)]">Cancelled</Badge>;
      case 'disputed':
        return <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[inset_0_1px_0_0_rgba(244,63,94,0.1)]">Disputed</Badge>;
      default:
        return <Badge variant="secondary" className="border-white/10">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Header and filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <Input
            placeholder="Search by client, worker, skill or booking ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-red-500/50"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-white/40 uppercase tracking-wider">Filter Group:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-10 w-44 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 font-semibold"
          >
            <option value="all" className="bg-[#0a0a0f]">All Bookings</option>
            <option value="pending" className="bg-[#0a0a0f]">Pending</option>
            <option value="broadcasting" className="bg-[#0a0a0f]">Broadcasting</option>
            <option value="active" className="bg-[#0a0a0f]">Active (Ongoing)</option>
            <option value="completed" className="bg-[#0a0a0f]">Completed / Paid</option>
            <option value="cancelled" className="bg-[#0a0a0f]">Cancelled</option>
            <option value="disputed" className="bg-[#0a0a0f]">Disputed</option>
          </select>
          <Button variant="outline" size="icon" onClick={loadBookings} className="rounded-xl bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white transition-all">
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Main List */}
      <Card className="overflow-hidden border-white/10 rounded-2xl shadow-xl bg-[#0a0a0f]/95 backdrop-blur-md">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-red-500" size={32} />
            <p className="text-sm font-bold text-white/40">Loading bookings log...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-16 text-white/40 font-bold">
            No bookings found matching filters.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-white/[0.02]">
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="font-black text-white/60 tracking-wider uppercase text-[10px]">Booking Details</TableHead>
                <TableHead className="font-black text-white/60 tracking-wider uppercase text-[10px]">Client</TableHead>
                <TableHead className="font-black text-white/60 tracking-wider uppercase text-[10px]">Professional</TableHead>
                <TableHead className="font-black text-white/60 tracking-wider uppercase text-[10px]">Scheduled Time</TableHead>
                <TableHead className="font-black text-white/60 tracking-wider uppercase text-[10px]">Price</TableHead>
                <TableHead className="font-black text-white/60 tracking-wider uppercase text-[10px]">Status</TableHead>
                <TableHead className="font-black text-white/60 tracking-wider uppercase text-[10px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow key={booking.id} className="border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors duration-200" onClick={() => setDetailBooking(booking)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setDetailBooking(booking)} 
                      className="font-bold text-left text-xs text-red-400 hover:text-red-300 transition-colors select-all font-mono truncate max-w-[120px]"
                    >
                      #{booking.id.substring(0, 8)}...
                    </button>
                    <div className="text-[10px] text-white/40 mt-0.5">
                      Created: {new Date(booking.created_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-white text-sm">{booking.client?.profile?.full_name || 'N/A'}</div>
                    <div className="text-xs text-white/40">{booking.client?.profile?.phone}</div>
                  </TableCell>
                  <TableCell>
                    {booking.worker?.profile?.full_name ? (
                      <>
                        <div className="font-bold text-white text-sm">{booking.worker?.profile?.full_name}</div>
                        <div className="text-xs text-red-400 font-semibold">{booking.worker?.category}</div>
                      </>
                    ) : (
                      <span className="text-xs text-white/30 font-medium">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-white/80">
                      <Calendar size={13} className="text-white/40" />
                      {booking.scheduled_for
                        ? new Date(booking.scheduled_for).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                        : 'ASAP'}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40 mt-0.5">
                      <Clock size={13} />
                      {booking.scheduled_for
                        ? new Date(booking.scheduled_for).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : 'Immediate'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center text-sm font-black text-white">
                      ₹{(booking.total_price || booking.service_charge || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(booking.status)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      {/* Reassign action */}
                      {!['completed', 'paid_completed', 'cancelled'].includes(booking.status) && (
                        <Button
                          size="sm"
                          title="Reassign Worker"
                          className="h-8 w-8 p-0 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all"
                          onClick={() => openReassignModal(booking)}
                        >
                          <UserPlus size={14} />
                        </Button>
                      )}

                      {/* Cancel Action */}
                      {!['completed', 'paid_completed', 'cancelled'].includes(booking.status) && (
                        <Button
                          size="sm"
                          title="Force Cancel"
                          className="h-8 w-8 p-0 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all"
                          onClick={() => openCancelModal(booking)}
                        >
                          <Ban size={14} />
                        </Button>
                      )}

                      {/* Detail View */}
                      <Button
                        size="sm"
                        className="h-8 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all font-bold"
                        onClick={() => setDetailBooking(booking)}
                      >
                        Details
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Booking Detail Slide-Over Drawer */}
      {detailBooking && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="absolute inset-0" onClick={() => setDetailBooking(null)} />
          <div className="relative bg-[#0a0a0f] border-l border-white/10 w-full max-w-lg h-full shadow-2xl overflow-y-auto flex flex-col p-6 space-y-6 animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-lg shadow-[inset_0_1px_0_0_rgba(239,68,68,0.2)]">
                  {detailBooking.category}
                </span>
                <h2 className="text-xl font-black text-white mt-2 select-all">Booking Details</h2>
                <p className="text-[10px] font-mono text-white/40 mt-1">ID: {detailBooking.id}</p>
              </div>
              <button 
                onClick={() => setDetailBooking(null)} 
                className="p-2 text-white/40 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Main Stats info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/[0.05]">
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block">Price Details</span>
                <span className="text-lg font-black text-white flex items-center mt-1">
                  ₹{(detailBooking.total_price || detailBooking.service_charge || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-white/60 font-semibold block capitalize mt-0.5">
                  Method: {detailBooking.payment_method}
                </span>
              </div>
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/[0.05]">
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block">Current Status</span>
                <div className="mt-1.5">{getStatusBadge(detailBooking.status)}</div>
                <span className="text-[10px] text-white/60 font-semibold block mt-1.5">
                  OTP Code: {detailBooking.otp_code || 'None'}
                </span>
              </div>
            </div>

            {/* Client & Worker cards */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">Stakeholders</h3>
              
              {/* Client Info */}
              <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_0_rgba(59,130,246,0.2)]">
                  <User size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-0.5">Client (Customer)</p>
                  <p className="text-sm font-black text-white truncate">{detailBooking.client?.profile?.full_name || 'N/A'}</p>
                  <p className="text-xs text-white/60">{detailBooking.client?.profile?.phone}</p>
                </div>
              </div>

              {/* Worker Info */}
              <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_0_rgba(239,68,68,0.2)]">
                  <User size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-0.5">Professional Assigned</p>
                  {detailBooking.worker?.profile?.full_name ? (
                    <>
                      <p className="text-sm font-black text-white truncate">{detailBooking.worker?.profile?.full_name}</p>
                      <p className="text-xs text-white/60">{detailBooking.worker?.profile?.phone}</p>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-white/40">Unassigned</p>
                  )}
                </div>
              </div>
            </div>

            {/* Job Notes and details */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">Service Request details</h3>
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 space-y-4">
                <div>
                  <span className="text-[10px] text-white/40 font-bold uppercase block mb-1">Customer Request Notes</span>
                  <p className="text-xs text-white/80 font-medium leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">{detailBooking.description}</p>
                </div>
                <div className="flex items-start gap-2 bg-white/5 p-3 rounded-xl border border-white/5">
                  <MapPin size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-white/40 font-bold uppercase block mb-0.5">Service Location Address</span>
                    <p className="text-xs text-white/80 font-medium leading-relaxed">{detailBooking.location_address}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Photos */}
            {detailBooking.image_urls && detailBooking.image_urls.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                  <Image size={14} /> Job Photos ({detailBooking.image_urls.length})
                </h3>
                <div className="flex gap-3 overflow-x-auto py-1 no-scrollbar">
                  {detailBooking.image_urls.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 relative w-24 h-24 rounded-2xl overflow-hidden border border-white/10 hover:border-white/30 transition-all shadow-lg group">
                      <img src={url} alt={`Job Photo ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye size={20} className="text-white" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Dispute resolution actions */}
            {detailBooking.status === 'disputed' && (
              <div className="p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-3 shadow-[inset_0_1px_0_0_rgba(244,63,94,0.2)]">
                <div className="flex items-center gap-2 text-rose-400">
                  <AlertTriangle size={18} />
                  <h4 className="font-extrabold text-sm tracking-wide">Dispute Resolution Centre</h4>
                </div>
                <p className="text-xs text-rose-300 font-medium leading-relaxed">
                  This booking has been flagged as disputed. As an administrator, you must align payment status and resolve it.
                </p>
                <div className="flex gap-2 pt-2">
                  <Button 
                    size="sm"
                    className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all shadow-[inset_0_1px_0_0_rgba(52,211,153,0.2)]"
                    onClick={() => startStatusChange(detailBooking, 'completed')}
                  >
                    Resolve & Mark Completed
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="flex-1 bg-transparent border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-xl text-xs font-bold transition-all"
                    onClick={() => startStatusChange(detailBooking, 'cancelled')}
                  >
                    Resolve & Cancel Request
                  </Button>
                </div>
              </div>
            )}

            {/* OTP Verification History Logs */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">OTP Verification History Logs</h3>
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-2 max-h-[160px] overflow-y-auto no-scrollbar">
                {loadingOtpLogs ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="animate-spin text-red-500 w-6 h-6" />
                  </div>
                ) : otpLogs.length === 0 ? (
                  <p className="text-xs text-white/30 italic text-center py-4 font-semibold">No completion OTP attempts recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {otpLogs.map((log: any, idx: number) => (
                      <div key={log.id} className="text-xs border-b border-white/5 pb-3 last:border-0 last:pb-0">
                        <div className="flex justify-between font-black text-white/80">
                          <span>Attempt #{otpLogs.length - idx}</span>
                          <span className={log.verified_at ? 'text-emerald-400' : new Date(log.expires_at) < new Date() ? 'text-red-400' : 'text-orange-400'}>
                            {log.verified_at ? 'Verified' : new Date(log.expires_at) < new Date() ? 'Expired' : 'Awaiting entry'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px] text-white/40 mt-1.5 font-medium">
                          <div>Generated: {new Date(log.created_at).toLocaleString()}</div>
                          <div>Attempts: {log.attempts} / 5</div>
                          {log.verified_at && <div className="col-span-2 text-emerald-400/80">Verified At: {new Date(log.verified_at).toLocaleString()}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3 flex-1">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">Lifecycle History Timeline</h3>
              <div className="relative border-l-2 border-white/10 pl-4 ml-2 space-y-5">
                {detailBooking.timeline && (detailBooking.timeline as any[]).length > 0 ? (
                  (detailBooking.timeline as any[])
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map((item) => (
                      <div key={item.id} className="relative">
                        {/* Dot indicator */}
                        <div className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-red-400 border-2 border-[#0a0a0f] ring-4 ring-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs text-white capitalize bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
                              {item.status.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[9px] text-white/40 font-bold">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                          {item.reason && (
                            <p className="text-xs text-white/60 mt-1.5 pl-2 border-l border-white/10 italic leading-relaxed">
                              {item.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-white/40 italic font-medium">No timeline events logged.</p>
                )}
              </div>
            </div>

            {/* Quick Admin Actions inside drawer footer */}
            <div className="border-t border-white/10 pt-5 flex flex-col gap-2">
              {!['completed', 'paid_completed', 'cancelled'].includes(detailBooking.status) && (
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl font-bold text-xs shadow-[inset_0_1px_0_0_rgba(52,211,153,0.2)]"
                    onClick={() => startStatusChange(detailBooking, 'completed')}
                  >
                    Force Complete
                  </Button>
                  <Button 
                    className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-bold text-xs transition-colors"
                    onClick={() => openReassignModal(detailBooking)}
                  >
                    Reassign Worker
                  </Button>
                  <Button 
                    variant="destructive"
                    className="w-full col-span-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl font-bold text-xs transition-colors shadow-[inset_0_1px_0_0_rgba(239,68,68,0.2)]"
                    onClick={() => openCancelModal(detailBooking)}
                  >
                    Force Cancel Booking
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog modal overlay */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-6 space-y-5 animate-in fade-in-50 zoom-in-95 rounded-3xl border border-white/10 bg-[#0a0a0f] shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-white tracking-wide">Update Booking Status</h3>
              <p className="text-sm text-white/50 font-medium mt-1">
                Change status of this booking to <span className="font-bold text-red-400 capitalize">{targetStatus}</span>
              </p>
            </div>

            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/[0.05] text-xs font-bold space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-white/40">Booking ID:</span>
                <span className="font-mono text-white/80">{selectedBooking.id.substring(0, 8)}...</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/40">Client:</span>
                <span className="text-white">{selectedBooking.client?.profile?.full_name}</span>
              </div>
              {selectedBooking.worker?.profile?.full_name && (
                <div className="flex justify-between items-center">
                  <span className="text-white/40">Worker:</span>
                  <span className="text-white">{selectedBooking.worker?.profile?.full_name}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-white/40">Current Status:</span>
                <span className="capitalize text-red-400">{selectedBooking.status.replace('_', ' ')}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={14} /> Reason for Status Change
              </label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Reason/Notes (Appears in booking timeline logs)..."
                className="flex min-h-[90px] w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-medium resize-none transition-all"
              />
            </div>

            <div className="flex gap-3 justify-end pt-5 border-t border-white/10">
              <Button variant="outline" size="sm" onClick={cancelStatusChange} disabled={submittingStatus} className="rounded-xl h-11 px-5 bg-transparent border-white/10 text-white/70 hover:bg-white/5 hover:text-white transition-all font-bold">
                Cancel
              </Button>
              <Button size="sm" onClick={submitStatusChange} disabled={submittingStatus} className="rounded-xl h-11 px-5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 font-bold transition-all shadow-[inset_0_1px_0_0_rgba(52,211,153,0.2)]">
                {submittingStatus && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Confirm Update
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Reassign Worker Modal */}
      {reassignBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-6 space-y-5 animate-in fade-in-50 zoom-in-95 rounded-3xl border border-white/10 bg-[#0a0a0f] shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-white tracking-wide">Reassign Professional</h3>
              <p className="text-sm text-white/50 font-medium mt-1">
                Choose a new approved <span className="font-bold text-red-400">{reassignBooking.category}</span> worker for this booking.
              </p>
            </div>

            {loadingWorkers ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 size={24} className="animate-spin text-red-500" />
                <span className="text-xs font-bold text-white/40">Finding eligible professionals...</span>
              </div>
            ) : availableWorkers.length === 0 ? (
              <div className="text-center py-6 text-sm text-amber-400 bg-amber-500/10 rounded-2xl border border-amber-500/20 p-4 font-bold shadow-[inset_0_1px_0_0_rgba(245,158,11,0.2)]">
                ⚠️ No approved {reassignBooking.category} workers are currently available in this city.
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-xs font-black text-white/50 uppercase tracking-wider">Select Worker</label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="flex h-11 w-full bg-white/5 rounded-xl border border-white/10 px-3 py-1 text-sm text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-500/50"
                >
                  <option value="" className="bg-[#0a0a0f]">-- Choose Worker --</option>
                  {availableWorkers.map((w) => (
                    <option key={w.id} value={w.id} className="bg-[#0a0a0f]">
                      {w.profile?.full_name} ({w.profile?.phone || 'No phone'}) - Rating: {w.rating_avg}★
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-black text-white/50 uppercase tracking-wider">Reason for Reassignment</label>
              <textarea
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Reason (e.g. Assigned worker unresponsive, customer request)..."
                className="flex min-h-[90px] w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-medium resize-none transition-all"
              />
            </div>

            <div className="flex gap-3 justify-end pt-5 border-t border-white/10">
              <Button variant="outline" size="sm" onClick={() => setReassignBooking(null)} disabled={submittingReassign} className="rounded-xl h-11 px-5 bg-transparent border-white/10 text-white/70 hover:bg-white/5 hover:text-white transition-all font-bold">
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={submitReassign} 
                disabled={submittingReassign || !selectedWorkerId || !reassignReason} 
                className="rounded-xl h-11 px-5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold transition-all shadow-[inset_0_1px_0_0_rgba(239,68,68,0.2)]"
              >
                {submittingReassign && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Assign Professional
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Force Cancel Modal */}
      {cancelBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-6 space-y-5 animate-in fade-in-50 zoom-in-95 rounded-3xl border border-white/10 bg-[#0a0a0f] shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-rose-400 flex items-center gap-2 tracking-wide">
                <AlertTriangle size={20} /> Force Cancel Booking
              </h3>
              <p className="text-sm text-white/50 font-medium mt-1">
                Are you sure you want to cancel booking <span className="font-mono font-bold text-white">#{cancelBooking.id.substring(0, 8)}</span>? This action will notify both parties.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-white/50 uppercase tracking-wider">Reason for Cancellation</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (e.g. Suspected fraud, client request, scheduling conflict)..."
                className="flex min-h-[90px] w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-rose-500/50 font-medium resize-none transition-all"
              />
            </div>

            <div className="flex gap-3 justify-end pt-5 border-t border-white/10">
              <Button variant="outline" size="sm" onClick={() => setCancelBooking(null)} disabled={submittingCancel} className="rounded-xl h-11 px-5 bg-transparent border-white/10 text-white/70 hover:bg-white/5 hover:text-white transition-all font-bold">
                Cancel
              </Button>
              <Button 
                size="sm" 
                variant="destructive"
                onClick={submitCancel} 
                disabled={submittingCancel || !cancelReason} 
                className="rounded-xl h-11 px-5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-bold transition-all shadow-[inset_0_1px_0_0_rgba(244,63,94,0.2)]"
              >
                {submittingCancel && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Yes, Cancel Booking
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
