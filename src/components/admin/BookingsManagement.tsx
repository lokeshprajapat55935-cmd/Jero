'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import logger from '@/lib/logger';
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
  Ban
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
      const res = await fetch(`/api/admin/bookings/otp-logs?booking_id=${bookingId}`);
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
      const res = await fetch('/api/admin/bookings');
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
      const res = await fetch('/api/admin/bookings', {
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
      const res = await fetch('/api/admin/workers');
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
      const res = await fetch('/api/admin/bookings', {
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
      const res = await fetch('/api/admin/bookings', {
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
        return <Badge className="bg-blue-50 text-blue-700 border-blue-100">Pending</Badge>;
      case 'broadcasting':
        return <Badge className="bg-purple-50 text-purple-700 border-purple-100 animate-pulse">Broadcasting</Badge>;
      case 'accepted':
        return <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100">Accepted</Badge>;
      case 'worker_arriving':
      case 'en_route':
        return <Badge className="bg-sky-50 text-sky-700 border-sky-100">En Route</Badge>;
      case 'work_started':
      case 'started':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-100">In Progress</Badge>;
      case 'work_completed':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100">Work Finished (Legacy)</Badge>;
      case 'work_completed_pending_otp':
        return <Badge className="bg-orange-50 text-orange-700 border-orange-100 animate-pulse">Awaiting OTP</Badge>;
      case 'item_approved':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Item Approved</Badge>;
      case 'otp_generated':
        return <Badge className="bg-orange-50 text-orange-700 border-orange-100">OTP Sent</Badge>;
      case 'otp_verified':
        return <Badge className="bg-teal-50 text-teal-700 border-teal-100">OTP Verified</Badge>;
      case 'awaiting_payment':
        return <Badge className="bg-teal-50 text-teal-700 border-teal-100">Awaiting Payment</Badge>;
      case 'payment_processing':
        return <Badge className="bg-purple-50 text-purple-700 border-purple-100">Processing Payment</Badge>;
      case 'payment_verified':
      case 'completed':
        return <Badge className="bg-green-50 text-green-700 border-green-100">Completed</Badge>;
      case 'paid_completed':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Paid Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-50 text-red-700 border-red-100">Cancelled</Badge>;
      case 'disputed':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Disputed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Header and filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="Search by client, worker, skill or booking ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">Filter Group:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-10 w-44 rounded-xl border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All Bookings</option>
            <option value="pending">Pending</option>
            <option value="broadcasting">Broadcasting</option>
            <option value="active">Active (Ongoing)</option>
            <option value="completed">Completed / Paid</option>
            <option value="cancelled">Cancelled</option>
            <option value="disputed">Disputed</option>
          </select>
          <Button variant="outline" size="icon" onClick={loadBookings} className="rounded-xl">
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Main List */}
      <Card className="overflow-hidden border border-gray-100 shadow-sm rounded-3xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
            <p className="text-sm font-bold text-muted-foreground">Loading bookings log...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground font-medium">
            No bookings found matching filters.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-gray-50/70">
              <TableRow>
                <TableHead className="font-extrabold text-gray-700">Booking Details</TableHead>
                <TableHead className="font-extrabold text-gray-700">Client</TableHead>
                <TableHead className="font-extrabold text-gray-700">Professional</TableHead>
                <TableHead className="font-extrabold text-gray-700">Scheduled Time</TableHead>
                <TableHead className="font-extrabold text-gray-700">Price</TableHead>
                <TableHead className="font-extrabold text-gray-700">Status</TableHead>
                <TableHead className="font-extrabold text-gray-700 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow key={booking.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setDetailBooking(booking)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setDetailBooking(booking)} 
                      className="font-bold text-left text-xs text-indigo-600 hover:underline select-all font-mono truncate max-w-[120px]"
                    >
                      #{booking.id.substring(0, 8)}...
                    </button>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Created: {new Date(booking.created_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-gray-900 text-sm">{booking.client?.profile?.full_name || 'N/A'}</div>
                    <div className="text-xs text-gray-400">{booking.client?.profile?.phone}</div>
                  </TableCell>
                  <TableCell>
                    {booking.worker?.profile?.full_name ? (
                      <>
                        <div className="font-bold text-gray-900 text-sm">{booking.worker?.profile?.full_name}</div>
                        <div className="text-xs text-indigo-600 font-semibold">{booking.worker?.category}</div>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 font-medium">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm font-semibold text-gray-700">
                      <Calendar size={13} className="text-gray-400" />
                      {booking.scheduled_for
                        ? new Date(booking.scheduled_for).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                        : 'ASAP'}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                      <Clock size={13} />
                      {booking.scheduled_for
                        ? new Date(booking.scheduled_for).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : 'Immediate'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center text-sm font-black text-gray-900">
                      ₹{booking.total_price || booking.service_charge || 0}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(booking.status)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      {/* Reassign action */}
                      {!['completed', 'paid_completed', 'cancelled'].includes(booking.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Reassign Worker"
                          className="h-8 w-8 p-0 rounded-lg text-indigo-600 hover:text-indigo-700"
                          onClick={() => openReassignModal(booking)}
                        >
                          <UserPlus size={14} />
                        </Button>
                      )}

                      {/* Cancel Action */}
                      {!['completed', 'paid_completed', 'cancelled'].includes(booking.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Force Cancel"
                          className="h-8 w-8 p-0 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => openCancelModal(booking)}
                        >
                          <Ban size={14} />
                        </Button>
                      )}

                      {/* Detail View */}
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 rounded-lg text-gray-700"
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
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs flex justify-end">
          <div className="absolute inset-0" onClick={() => setDetailBooking(null)} />
          <div className="relative bg-white w-full max-w-lg h-full shadow-2xl overflow-y-auto flex flex-col p-6 space-y-6 animate-in slide-in-from-right duration-250">
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                  {detailBooking.category}
                </span>
                <h2 className="text-xl font-black text-gray-900 mt-1 select-all">Booking Details</h2>
                <p className="text-[10px] font-mono text-gray-400 mt-0.5">ID: {detailBooking.id}</p>
              </div>
              <button 
                onClick={() => setDetailBooking(null)} 
                className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Main Stats info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Price Details</span>
                <span className="text-lg font-black text-gray-900 flex items-center mt-1">
                  ₹{detailBooking.total_price || detailBooking.service_charge || 0}
                </span>
                <span className="text-[10px] text-gray-500 font-semibold block capitalize mt-0.5">
                  Method: {detailBooking.payment_method}
                </span>
              </div>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Current Status</span>
                <div className="mt-1.5">{getStatusBadge(detailBooking.status)}</div>
                <span className="text-[10px] text-gray-500 font-semibold block mt-1">
                  OTP Code: {detailBooking.otp_code || 'None'}
                </span>
              </div>
            </div>

            {/* Client & Worker cards */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Stakeholders</h3>
              
              {/* Client Info */}
              <div className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                  <User size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Client (Customer)</p>
                  <p className="text-sm font-black text-gray-900 truncate">{detailBooking.client?.profile?.full_name || 'N/A'}</p>
                  <p className="text-xs text-gray-500">{detailBooking.client?.profile?.phone}</p>
                </div>
              </div>

              {/* Worker Info */}
              <div className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                  <User size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Professional Assigned</p>
                  {detailBooking.worker?.profile?.full_name ? (
                    <>
                      <p className="text-sm font-black text-gray-900 truncate">{detailBooking.worker?.profile?.full_name}</p>
                      <p className="text-xs text-gray-500">{detailBooking.worker?.profile?.phone}</p>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-gray-400">Unassigned</p>
                  )}
                </div>
              </div>
            </div>

            {/* Job Notes and details */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Service Request details</h3>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">Customer Request Notes</span>
                  <p className="text-xs text-gray-700 font-medium mt-1 leading-relaxed">{detailBooking.description}</p>
                </div>
                <div className="flex items-start gap-1.5">
                  <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">Service Location Address</span>
                    <p className="text-xs text-gray-700 font-medium mt-0.5 leading-relaxed">{detailBooking.location_address}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Photos */}
            {detailBooking.image_urls && detailBooking.image_urls.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Image size={13} /> Job Photos ({detailBooking.image_urls.length})
                </h3>
                <div className="flex gap-2 overflow-x-auto py-1">
                  {detailBooking.image_urls.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 hover:opacity-90 transition-opacity">
                      <img src={url} alt={`Job Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Dispute resolution actions */}
            {detailBooking.status === 'disputed' && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-rose-800">
                  <AlertTriangle size={18} />
                  <h4 className="font-extrabold text-sm">Dispute Resolution Centre</h4>
                </div>
                <p className="text-xs text-rose-700 font-medium leading-relaxed">
                  This booking has been flagged as disputed. As an administrator, you must align payment status and resolve it.
                </p>
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                    onClick={() => startStatusChange(detailBooking, 'completed')}
                  >
                    Resolve & Mark Completed
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="flex-1 border-rose-200 text-rose-700 hover:bg-rose-100/50 rounded-xl text-xs font-bold"
                    onClick={() => startStatusChange(detailBooking, 'cancelled')}
                  >
                    Resolve & Cancel Request
                  </Button>
                </div>
              </div>
            )}

            {/* OTP Verification History Logs */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">OTP Verification History Logs</h3>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-2 max-h-[160px] overflow-y-auto">
                {loadingOtpLogs ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="animate-spin text-indigo-600 w-5 h-5" />
                  </div>
                ) : otpLogs.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-2">No completion OTP attempts recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {otpLogs.map((log: any, idx: number) => (
                      <div key={log.id} className="text-xs border-b border-gray-200/60 pb-2 last:border-0 last:pb-0">
                        <div className="flex justify-between font-bold text-gray-800">
                          <span>Attempt #{otpLogs.length - idx}</span>
                          <span className={log.verified_at ? 'text-green-600' : new Date(log.expires_at) < new Date() ? 'text-red-500' : 'text-orange-500'}>
                            {log.verified_at ? 'Verified' : new Date(log.expires_at) < new Date() ? 'Expired' : 'Awaiting entry'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500 mt-1">
                          <div>Generated: {new Date(log.created_at).toLocaleString()}</div>
                          <div>Attempts: {log.attempts} / 5</div>
                          {log.verified_at && <div className="col-span-2 text-green-600">Verified At: {new Date(log.verified_at).toLocaleString()}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3 flex-1">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Lifecycle History Timeline</h3>
              <div className="relative border-l-2 border-gray-100 pl-4 ml-2 space-y-5">
                {detailBooking.timeline && (detailBooking.timeline as any[]).length > 0 ? (
                  (detailBooking.timeline as any[])
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map((item) => (
                      <div key={item.id} className="relative">
                        {/* Dot indicator */}
                        <div className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white ring-4 ring-indigo-50/20" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-gray-900 capitalize bg-gray-100 px-1.5 py-0.5 rounded">
                              {item.status.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[9px] text-gray-400 font-medium">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                          {item.reason && (
                            <p className="text-xs text-gray-500 mt-1 pl-1 border-l border-gray-100 italic leading-relaxed">
                              {item.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-gray-400 italic">No timeline events logged.</p>
                )}
              </div>
            </div>

            {/* Quick Admin Actions inside drawer footer */}
            <div className="border-t pt-4 flex gap-2">
              {!['completed', 'paid_completed', 'cancelled'].includes(detailBooking.status) && (
                <>
                  <Button 
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-xs"
                    onClick={() => startStatusChange(detailBooking, 'completed')}
                  >
                    Force Complete
                  </Button>
                  <Button 
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs"
                    onClick={() => openReassignModal(detailBooking)}
                  >
                    Reassign Worker
                  </Button>
                  <Button 
                    variant="destructive"
                    className="flex-1 rounded-xl font-bold text-xs"
                    onClick={() => openCancelModal(detailBooking)}
                  >
                    Force Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog modal overlay */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md p-6 space-y-4 animate-in fade-in-50 zoom-in-95 rounded-3xl">
            <div>
              <h3 className="text-lg font-black text-gray-900">Update Booking Status</h3>
              <p className="text-sm text-gray-500">
                Change status of this booking to <span className="font-bold text-indigo-600 capitalize">{targetStatus}</span>
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 font-semibold">Booking ID:</span>
                <span className="font-mono text-gray-700">{selectedBooking.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-semibold">Client:</span>
                <span className="font-bold text-gray-800">{selectedBooking.client?.profile?.full_name}</span>
              </div>
              {selectedBooking.worker?.profile?.full_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400 font-semibold">Worker:</span>
                  <span className="font-bold text-gray-800">{selectedBooking.worker?.profile?.full_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400 font-semibold">Current Status:</span>
                <span className="font-bold capitalize text-gray-800">{selectedBooking.status}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <FileText size={12} /> Reason for Status Change
              </label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Reason/Notes (Appears in booking timeline logs)..."
                className="flex min-h-[90px] w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={cancelStatusChange} disabled={submittingStatus} className="rounded-xl font-bold">
                Cancel
              </Button>
              <Button size="sm" onClick={submitStatusChange} disabled={submittingStatus} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold">
                {submittingStatus && <Loader2 size={14} className="animate-spin mr-1" />}
                Confirm Update
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Reassign Worker Modal */}
      {reassignBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md p-6 space-y-4 animate-in fade-in-50 zoom-in-95 rounded-3xl">
            <div>
              <h3 className="text-lg font-black text-gray-900">Reassign Professional</h3>
              <p className="text-sm text-gray-500">
                Choose a new approved <span className="font-bold text-indigo-600">{reassignBooking.category}</span> worker for this booking.
              </p>
            </div>

            {loadingWorkers ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 size={24} className="animate-spin text-indigo-600" />
                <span className="text-xs text-gray-400">Finding eligible professionals...</span>
              </div>
            ) : availableWorkers.length === 0 ? (
              <div className="text-center py-6 text-sm text-amber-600 bg-amber-50 rounded-2xl border border-amber-100 p-4 font-semibold">
                ⚠️ No approved {reassignBooking.category} workers are currently available in this city.
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Select Worker</label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="flex h-11 w-full bg-gray-50 rounded-xl border border-gray-100 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">-- Choose Worker --</option>
                  {availableWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.profile?.full_name} ({w.profile?.phone || 'No phone'}) - Rating: {w.rating_avg}★
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reason for Reassignment</label>
              <textarea
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Reason (e.g. Assigned worker unresponsive, customer request)..."
                className="flex min-h-[90px] w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setReassignBooking(null)} disabled={submittingReassign} className="rounded-xl font-bold">
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={submitReassign} 
                disabled={submittingReassign || !selectedWorkerId || !reassignReason} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
              >
                {submittingReassign && <Loader2 size={14} className="animate-spin mr-1" />}
                Assign Professional
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Force Cancel Modal */}
      {cancelBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md p-6 space-y-4 animate-in fade-in-50 zoom-in-95 rounded-3xl">
            <div>
              <h3 className="text-lg font-black text-gray-900 text-red-600 flex items-center gap-1.5">
                <AlertTriangle size={20} /> Force Cancel Booking
              </h3>
              <p className="text-sm text-gray-500">
                Are you sure you want to cancel booking <span className="font-mono font-bold">#{cancelBooking.id.substring(0, 8)}</span>? This action will notify both parties.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reason for Cancellation</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (e.g. Suspected fraud, client request, scheduling conflict)..."
                className="flex min-h-[90px] w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setCancelBooking(null)} disabled={submittingCancel} className="rounded-xl font-bold">
                Cancel
              </Button>
              <Button 
                size="sm" 
                variant="destructive"
                onClick={submitCancel} 
                disabled={submittingCancel || !cancelReason} 
                className="rounded-xl font-bold"
              >
                {submittingCancel && <Loader2 size={14} className="animate-spin mr-1" />}
                Yes, Cancel Booking
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
