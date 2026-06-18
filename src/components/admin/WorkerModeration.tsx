'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { adminFetch } from '@/lib/admin/api';
import logger from '@/lib/logger';
import { cn } from '@/lib/utils';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Search, 
  Loader2, 
  ShieldCheck, 
  ShieldAlert, 
  FileText,
  UserCheck,
  UserX,
  Wallet,
  Clock,
  Eye,
  Camera,
  Ban,
  Users
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function WorkerModeration() {
  const { toast } = useToast();
  const [workers, setWorkers] = useState<any[]>([]);
  const [filteredWorkers, setFilteredWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [verifyFilter, setVerifyFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('all');

  // Moderation state
  const [selectedWorker, setSelectedWorker] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState<'pending' | 'under_review' | 'approved' | 'rejected' | 'suspended' | ''>('');
  const [newVerified, setNewVerified] = useState<boolean | null>(null);
  const [moderationNote, setModerationNote] = useState('');
  const [submittingMod, setSubmittingMod] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    loadWorkers();
    
    // Subscribe to realtime changes to automatically show new applications
    const supabase = createClient();
    const channel = supabase.channel('admin_workers_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, () => {
        loadWorkers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadWorkers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    applyFiltersAndSearch();
  }, [workers, search, statusFilter, verifyFilter, availabilityFilter]);

  const loadWorkers = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/workers');
      const data = await res.json();
      if (data.workers) {
        setWorkers(data.workers);
      }
    } catch (error) {
      logger.error('Failed to load workers', error);
      toast({ variant: 'destructive', title: 'Failed to load workers' });
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSearch = () => {
    let list = [...workers];

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((w) => w.status === statusFilter);
    }

    // Verification filter
    if (verifyFilter !== 'all') {
      const targetVerify = verifyFilter === 'verified';
      list = list.filter((w) => w.verified === targetVerify);
    }

    // Availability filter
    if (availabilityFilter !== 'all') {
      list = list.filter((w) => {
        const liveStatus = w.availability_db?.status || w.availability?.status || 'offline';
        return liveStatus === availabilityFilter;
      });
    }

    // Search query
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      list = list.filter(
        (w) =>
          w.profile?.full_name?.toLowerCase().includes(q) ||
          w.profile?.email?.toLowerCase().includes(q) ||
          w.profile?.phone?.includes(q) ||
          w.category?.toLowerCase().includes(q)
      );
    }

    setFilteredWorkers(list);
  };

  const [newAvailability, setNewAvailability] = useState<string>('');

  const startModeration = (worker: any, targetStatus: typeof newStatus, targetVerify: boolean | null) => {
    setSelectedWorker(worker);
    setNewStatus(targetStatus);
    setNewVerified(targetVerify);
    setModerationNote(worker.moderation_note || '');
    setNewAvailability(worker.availability_db?.status || worker.availability?.status || 'offline');
  };

  const cancelModeration = () => {
    setSelectedWorker(null);
    setNewStatus('');
    setNewVerified(null);
    setModerationNote('');
    setNewAvailability('');
    setPreviewImageUrl(null);
  };

  const submitModeration = async () => {
    if (!selectedWorker) return;

    setSubmittingMod(true);
    try {
      const targetStatusVal = newStatus !== '' ? newStatus : selectedWorker.status;
      const targetVerifyVal = targetStatusVal === 'approved' ? true : (newVerified !== null ? newVerified : selectedWorker.verified);

      const payload = {
        worker_id: selectedWorker.id,
        status: targetStatusVal,
        verified: targetVerifyVal,
        moderation_note: moderationNote.trim() !== '' ? moderationNote : undefined,
        availability_status: newAvailability !== (selectedWorker.availability_db?.status || selectedWorker.availability?.status || 'offline') ? newAvailability : undefined,
      };

      const res = await adminFetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Moderation failed');

      toast({
        title: 'Moderation complete',
        description: `Successfully updated partner: ${selectedWorker.profile?.full_name ?? selectedWorker.id}`,
      });

      // Update local state
      setWorkers((prev) =>
        prev.map((w) => (w.id === selectedWorker.id ? { ...w, ...result.data } : w))
      );
      cancelModeration();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to moderate',
        description: error.message,
      });
    } finally {
      setSubmittingMod(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.1)]">Approved</Badge>;
      case 'under_review':
        return <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[inset_0_1px_0_0_rgba(245,158,11,0.1)] animate-pulse">Under Review</Badge>;
      case 'pending':
        return <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[inset_0_1px_0_0_rgba(59,130,246,0.1)]">Pending</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 shadow-[inset_0_1px_0_0_rgba(239,68,68,0.1)]">Rejected</Badge>;
      case 'suspended':
        return <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[inset_0_1px_0_0_rgba(244,63,94,0.1)]">Suspended</Badge>;
      case 'blocked':
        return <Badge className="bg-red-600/10 text-red-500 border border-red-600/20 shadow-[inset_0_1px_0_0_rgba(220,38,38,0.1)]">Blocked</Badge>;
      default:
        return <Badge variant="secondary" className="border-white/10">{status}</Badge>;
    }
  };

  const getAvailabilityBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 gap-1.5 px-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.5)]" />Online</Badge>;
      case 'busy':
        return <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 gap-1.5 px-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Busy</Badge>;
      case 'unavailable':
        return <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 gap-1.5 px-2"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />Unavailable</Badge>;
      case 'offline':
      default:
        return <Badge className="bg-white/5 text-white/40 border border-white/10 gap-1.5 px-2"><span className="h-1.5 w-1.5 rounded-full bg-white/20" />Offline</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs / Status Filter */}
      <div className="flex border-b border-white/10 overflow-x-auto no-scrollbar gap-1 pb-1">
        {['all', 'pending', 'under_review', 'approved', 'rejected', 'suspended', 'blocked'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={cn(
              'px-4 py-2 text-sm font-bold rounded-t-lg whitespace-nowrap transition-all duration-300',
              statusFilter === status 
                ? 'bg-white/5 text-white border-b-2 border-red-500' 
                : 'text-white/40 hover:text-white/80 hover:bg-white/5 border-b-2 border-transparent'
            )}
          >
            {status === 'all' ? 'All Partners' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            <Badge variant="secondary" className="ml-2 bg-white/10 text-white/60 border-none text-[10px] px-1.5 py-0">
              {status === 'all' ? workers.length : workers.filter(w => w.status === status).length}
            </Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <Input
            placeholder="Search partners by name, phone or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-red-500/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">Verification:</span>
            <select
              value={verifyFilter}
              onChange={(e) => setVerifyFilter(e.target.value)}
              className="flex h-9 w-36 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-semibold"
            >
              <option value="all">All Verification</option>
              <option value="verified">Verified Only</option>
              <option value="unverified">Unverified Only</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">Availability:</span>
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              className="flex h-9 w-36 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-semibold"
            >
              <option value="all">All Availability</option>
              <option value="online">Online</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main List */}
      <Card className="overflow-hidden border-white/10 rounded-2xl shadow-xl bg-[#0a0a0f]/95 backdrop-blur-md">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-red-500" size={32} />
            <p className="text-sm font-bold text-white/40">Loading service partners registry...</p>
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="text-center py-16 text-white/40 font-bold">
            No service partners found matching the filters.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-white/[0.02]">
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/60 font-black tracking-wider uppercase text-[10px]">Partner</TableHead>
                <TableHead className="text-white/60 font-black tracking-wider uppercase text-[10px]">Contact</TableHead>
                <TableHead className="text-white/60 font-black tracking-wider uppercase text-[10px]">Categories</TableHead>
                <TableHead className="text-white/60 font-black tracking-wider uppercase text-[10px]">Wallet Balance</TableHead>
                <TableHead className="text-white/60 font-black tracking-wider uppercase text-[10px]">Availability</TableHead>
                <TableHead className="text-white/60 font-black tracking-wider uppercase text-[10px]">Status</TableHead>
                <TableHead className="text-right text-white/60 font-black tracking-wider uppercase text-[10px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWorkers.map((worker) => {
                const categoriesList = worker.categories?.map((c: any) => c.category) || [worker.category];
                const walletBal = Number(worker.wallet?.balance || 0);

                return (
                  <TableRow key={worker.id} className="border-white/5 hover:bg-white/[0.02] transition-colors duration-200">
                    <TableCell>
                      <div className="font-bold text-sm text-white">{worker.profile?.full_name || 'N/A'}</div>
                      {worker.dob && (
                        <div className="text-[10px] text-white/40 mt-0.5">
                          DOB: {new Date(worker.dob).toLocaleDateString()} · {worker.gender}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-semibold text-white/90">{worker.profile?.phone || 'N/A'}</div>
                      <div className="text-xs text-white/40">{worker.profile?.email || 'N/A'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {categoriesList.map((cat: string) => (
                          <Badge key={cat} variant="secondary" className="bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 capitalize text-[10px] font-bold px-1.5 py-0">
                            {cat?.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm font-black text-white/90">
                        <Wallet size={12} className="text-emerald-400" />
                        ₹{walletBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getAvailabilityBadge(worker.availability_db?.status || worker.availability?.status || 'offline')}
                    </TableCell>
                    <TableCell>{getStatusBadge(worker.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 text-xs font-bold gap-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 transition-all rounded-lg"
                          onClick={() => startModeration(worker, '', null)}
                        >
                          <Eye size={12} /> View & Moderate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Onboarding Details & Moderation Modal */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg p-6 space-y-5 animate-in fade-in-50 zoom-in-95 rounded-3xl border border-white/10 bg-[#0a0a0f] shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-black text-white tracking-wide">Service Partner Verification</h3>
                <p className="text-xs text-white/50 font-semibold mt-1">
                  ID: {selectedWorker.id.substring(0, 8)}... · Status: <span className="capitalize font-black text-red-400">{selectedWorker.status.replace('_', ' ')}</span>
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={cancelModeration} className="h-8 w-8 rounded-full p-0 text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                ×
              </Button>
            </div>

            {/* Partner details panel */}
            <div className="grid grid-cols-2 gap-4 text-xs font-bold bg-white/[0.02] p-5 rounded-2xl border border-white/[0.05]">
              <div>
                <span className="text-white/40 block text-[10px] uppercase tracking-wider mb-1">Full Name</span>
                <span className="text-sm font-black text-white">{selectedWorker.profile?.full_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-white/40 block text-[10px] uppercase tracking-wider mb-1">Contact Phone</span>
                <span className="text-sm font-black text-white">{selectedWorker.profile?.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-white/40 block text-[10px] uppercase tracking-wider mb-1">Gender / DOB</span>
                <span className="text-white/80">{selectedWorker.gender || 'N/A'} · {selectedWorker.dob ? new Date(selectedWorker.dob).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div>
                <span className="text-white/40 block text-[10px] uppercase tracking-wider mb-1">Wallet Balance</span>
                <span className="text-sm font-black text-emerald-400">₹{Number(selectedWorker.wallet?.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Documents section */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-white/50">Uploaded Documents Verification</h4>
              {selectedWorker.documents && selectedWorker.documents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedWorker.documents.map((doc: any) => (
                    <div key={doc.id} className="border border-white/10 p-3 rounded-xl bg-white/[0.02] flex flex-col justify-between gap-3 shadow-sm hover:bg-white/[0.05] transition-colors">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black uppercase text-red-400 tracking-tight">
                          📄 {doc.document_type.replace('_', ' ')}
                        </span>
                        {doc.verified ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold rounded-lg uppercase px-1.5 py-0 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.2)]">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-white/10 text-white/60 border border-white/20 text-[9px] font-bold rounded-lg uppercase px-1.5 py-0">
                            Pending review
                          </Badge>
                        )}
                      </div>
                      
                      {/* Inline Image Preview */}
                      {doc.document_url && (
                        <div 
                          className="relative h-28 w-full rounded-lg overflow-hidden bg-black/50 border border-white/10 cursor-zoom-in group"
                          onClick={() => setPreviewImageUrl(doc.document_url)}
                        >
                          <img 
                            src={doc.document_url} 
                            alt={doc.document_type} 
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80 group-hover:opacity-100"
                            onError={(e) => {
                              const target = e.target as HTMLElement;
                              if (target) {
                                target.style.display = 'none';
                              }
                            }}
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                            <Eye className="h-6 w-6 text-white" />
                          </div>
                        </div>
                      )}

                      <a 
                        href={doc.document_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[10px] text-red-400 font-bold hover:text-red-300 hover:underline truncate flex items-center gap-1.5 mt-1"
                      >
                        <Eye size={12} /> Open in new tab
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 border border-dashed border-white/20 rounded-2xl text-xs text-white/40 font-bold bg-white/[0.01]">
                  No documents uploaded.
                </div>
              )}
            </div>

            {/* Availability override section */}
            <div className="space-y-2 border-t border-white/10 pt-5">
              <label className="text-xs font-black tracking-wide text-white/50 flex items-center gap-1.5 uppercase">
                <Clock size={14} /> Override Availability Status
              </label>
              <select
                value={newAvailability}
                onChange={(e) => setNewAvailability(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 font-semibold"
              >
                <option value="online" className="bg-[#0a0a0f]">Online</option>
                <option value="offline" className="bg-[#0a0a0f]">Offline</option>
                <option value="busy" className="bg-[#0a0a0f]">Busy</option>
                <option value="unavailable" className="bg-[#0a0a0f]">Unavailable</option>
              </select>
            </div>

            {/* Moderation note box */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-black tracking-wide text-white/50 flex items-center gap-1.5 uppercase">
                <FileText size={14} /> Moderation Decision Notes
              </label>
              <textarea
                value={moderationNote}
                onChange={(e) => setModerationNote(e.target.value)}
                placeholder="Reason for approval, rejection, or suspension. (This note is visible in logs and to worker alerts)"
                className="flex min-h-[90px] w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 font-medium resize-y"
              />
            </div>

            {/* Action buttons footer */}
            <div className="flex flex-wrap gap-3 justify-end border-t border-white/10 pt-5">
              <Button variant="outline" size="sm" onClick={cancelModeration} disabled={submittingMod} className="rounded-xl h-11 px-5 bg-transparent border-white/10 text-white/70 hover:bg-white/5 hover:text-white transition-all font-bold">
                Close
              </Button>
              
              {selectedWorker.status !== 'rejected' && (
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => {
                    setNewStatus('rejected');
                    setTimeout(() => submitModeration(), 100);
                  }}
                  disabled={submittingMod}
                  className="rounded-xl h-11 px-5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 gap-1.5 font-bold transition-all shadow-[inset_0_1px_0_0_rgba(239,68,68,0.2)]"
                >
                  <UserX size={16} /> Reject Application
                </Button>
              )}

              {selectedWorker.status !== 'suspended' && selectedWorker.status === 'approved' && (
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => {
                    setNewStatus('suspended');
                    setTimeout(() => submitModeration(), 100);
                  }}
                  disabled={submittingMod}
                  className="rounded-xl h-11 px-5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 gap-1.5 font-bold transition-all shadow-[inset_0_1px_0_0_rgba(244,63,94,0.2)]"
                >
                  <Ban size={16} /> Suspend Partner
                </Button>
              )}

              {selectedWorker.status !== 'approved' && (
                <Button 
                  size="sm" 
                  onClick={() => {
                    setNewStatus('approved');
                    setTimeout(() => submitModeration(), 100);
                  }}
                  disabled={submittingMod}
                  className="rounded-xl h-11 px-6 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 gap-1.5 font-bold transition-all shadow-[inset_0_1px_0_0_rgba(52,211,153,0.2)]"
                >
                  <UserCheck size={16} /> Approve & Activate
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Full Document Image Preview Modal */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
          <div className="relative max-w-3xl w-full max-h-[90vh] overflow-hidden rounded-2xl bg-card border border-border shadow-2xl flex flex-col">
            <div className="flex justify-between items-center px-4 py-3 border-b">
              <span className="text-xs font-bold text-muted-foreground">Document Proof Viewer</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setPreviewImageUrl(null)} 
                className="h-8 w-8 rounded-full p-0 font-bold"
              >
                ×
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/10">
              <img 
                src={previewImageUrl} 
                alt="Document Preview" 
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
