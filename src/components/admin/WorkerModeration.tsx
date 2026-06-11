'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import logger from '@/lib/logger';
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
  Ban
} from 'lucide-react';

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
  }, []);

  useEffect(() => {
    applyFiltersAndSearch();
  }, [workers, search, statusFilter, verifyFilter, availabilityFilter]);

  const loadWorkers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/workers');
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

      const res = await fetch('/api/admin/workers', {
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
        return <Badge className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
      case 'under_review':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 animate-pulse">Under Review</Badge>;
      case 'pending':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Pending</Badge>;
      case 'rejected':
        return <Badge className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      case 'suspended':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Suspended</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getAvailabilityBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Online</Badge>;
      case 'busy':
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Busy</Badge>;
      case 'unavailable':
        return <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Unavailable</Badge>;
      case 'offline':
      default:
        return <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/10">Offline</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="Search partners by name, phone or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-9 w-36 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-semibold"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

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
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-primary" size={32} />
            <p className="text-sm font-bold text-muted-foreground">Loading service partners registry...</p>
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground font-medium">
            No service partners found matching the filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Wallet Balance</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWorkers.map((worker) => {
                const categoriesList = worker.categories?.map((c: any) => c.category) || [worker.category];
                const walletBal = Number(worker.wallet?.balance || 0);

                return (
                  <TableRow key={worker.id} className="hover:bg-secondary/10">
                    <TableCell>
                      <div className="font-bold text-sm">{worker.profile?.full_name || 'N/A'}</div>
                      {worker.dob && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          DOB: {new Date(worker.dob).toLocaleDateString()} · {worker.gender}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-semibold">{worker.profile?.phone || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">{worker.profile?.email || 'N/A'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {categoriesList.map((cat: string) => (
                          <Badge key={cat} variant="secondary" className="capitalize text-[10px] font-bold px-1.5 py-0">
                            {cat.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm font-black">
                        <Wallet size={12} className="text-muted-foreground" />
                        ₹{walletBal.toFixed(2)}
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
                          variant="outline"
                          className="h-8 text-xs font-bold gap-1"
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
          <Card className="w-full max-w-lg p-6 space-y-5 animate-in fade-in-50 zoom-in-95 rounded-3xl border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-foreground">Service Partner Verification</h3>
                <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                  ID: {selectedWorker.id.substring(0, 8)}... · Status: <span className="capitalize font-bold text-primary">{selectedWorker.status.replace('_', ' ')}</span>
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={cancelModeration} className="h-8 w-8 rounded-full p-0">
                ×
              </Button>
            </div>

            {/* Partner details panel */}
            <div className="grid grid-cols-2 gap-4 text-xs font-bold bg-secondary/20 p-4 rounded-2xl border">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider mb-0.5">Full Name</span>
                <span className="text-sm font-extrabold text-foreground">{selectedWorker.profile?.full_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider mb-0.5">Contact Phone</span>
                <span className="text-sm font-extrabold text-foreground">{selectedWorker.profile?.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider mb-0.5">Gender / DOB</span>
                <span>{selectedWorker.gender || 'N/A'} · {selectedWorker.dob ? new Date(selectedWorker.dob).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider mb-0.5">Wallet Balance</span>
                <span className="text-sm font-black text-emerald-600">₹{Number(selectedWorker.wallet?.balance || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Documents section */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Uploaded Documents Verification</h4>
              {selectedWorker.documents && selectedWorker.documents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedWorker.documents.map((doc: any) => (
                    <div key={doc.id} className="border p-3 rounded-xl bg-card/65 flex flex-col justify-between gap-3 shadow-sm">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black uppercase text-primary tracking-tight">
                          📄 {doc.document_type.replace('_', ' ')}
                        </span>
                        {doc.verified ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 text-[9px] font-bold rounded-lg border-none uppercase px-1.5 py-0">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px] font-bold rounded-lg border-none uppercase px-1.5 py-0 text-muted-foreground">
                            Pending review
                          </Badge>
                        )}
                      </div>
                      
                      {/* Inline Image Preview */}
                      {doc.document_url && (
                        <div 
                          className="relative h-28 w-full rounded-lg overflow-hidden bg-secondary border border-border/40 cursor-zoom-in group"
                          onClick={() => setPreviewImageUrl(doc.document_url)}
                        >
                          <img 
                            src={doc.document_url} 
                            alt={doc.document_type} 
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              // If loading fails (e.g. PDF or bad URL), hide the image preview and show a fallback
                              const target = e.target as HTMLElement;
                              if (target) {
                                target.style.display = 'none';
                              }
                            }}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      )}

                      <a 
                        href={doc.document_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[10px] text-primary font-bold hover:underline truncate flex items-center gap-1"
                      >
                        <Eye size={10} /> Open in new tab
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-4 border border-dashed rounded-2xl text-xs text-muted-foreground">
                  No documents uploaded.
                </div>
              )}
            </div>

            {/* Availability override section */}
            <div className="space-y-1.5 border-t pt-4">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Clock size={12} /> Override Availability Status
              </label>
              <select
                value={newAvailability}
                onChange={(e) => setNewAvailability(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-semibold"
              >
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="busy">Busy</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </div>

            {/* Moderation note box */}
            <div className="space-y-1 pt-3">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <FileText size={12} /> Moderation Decision Notes
              </label>
              <textarea
                value={moderationNote}
                onChange={(e) => setModerationNote(e.target.value)}
                placeholder="Reason for approval, rejection, or suspension. (This notes are visible to logs and worker alerts)"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium"
              />
            </div>

            {/* Action buttons footer */}
            <div className="flex flex-wrap gap-2 justify-end border-t pt-4">
              <Button variant="outline" size="sm" onClick={cancelModeration} disabled={submittingMod} className="rounded-xl h-11 px-4">
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
                  className="rounded-xl h-11 px-4 bg-red-600 hover:bg-red-700 text-white gap-1"
                >
                  <UserX size={14} /> Reject Application
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
                  className="rounded-xl h-11 px-4 bg-rose-700 hover:bg-rose-800 text-white gap-1"
                >
                  <Ban size={14} /> Suspend Partner
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
                  className="rounded-xl h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                >
                  <UserCheck size={14} /> Approve & Activate
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
