'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, Filter, AlertCircle, Clock, XCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

type StatusType = 'all' | 'pending' | 'approved' | 'rejected';

interface Verification {
  id: string;
  profile_id: string;
  full_name: string;
  dob: string;
  gender: string;
  status: string;
  verification_notes: string;
  created_at: string;
  profiles: {
    phone: string;
    email: string;
  };
}

export default function CustomerVerificationsPage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusType>('pending');
  const [search, setSearch] = useState('');
  
  // Modal State
  const [selectedVerification, setSelectedVerification] = useState<Verification | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchVerifications();
  }, [statusFilter]);

  const fetchVerifications = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/customer-verifications?status=${statusFilter}`);
      const json = await res.json();
      if (json.success) {
        setVerifications(json.data);
      } else {
        toast.error("Failed to load verifications");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (status: 'approved' | 'rejected') => {
    if (!selectedVerification) return;
    if (status === 'rejected' && !rejectionNotes.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch('/api/admin/customer-verifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedVerification.id,
          status,
          notes: rejectionNotes
        })
      });

      const json = await res.json();
      if (json.success) {
        toast.success(`Verification ${status} successfully`);
        setSelectedVerification(null);
        setRejectionNotes('');
        fetchVerifications();
      } else {
        toast.error(json.error || "Failed to update");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredData = verifications.filter(v => 
    v.full_name.toLowerCase().includes(search.toLowerCase()) || 
    (v.profiles?.phone && v.profiles.phone.includes(search))
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Customer Verifications</h1>
          <p className="text-sm text-gray-500 mt-1">Review and manage customer identity verification requests.</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl overflow-x-auto">
          {(['pending', 'approved', 'rejected', 'all'] as StatusType[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize whitespace-nowrap transition-all ${
                statusFilter === s 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input 
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Details</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Submitted At</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading verifications...</td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No {statusFilter !== 'all' ? statusFilter : ''} verifications found.
                  </td>
                </tr>
              ) : (
                filteredData.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{v.full_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{v.profiles?.phone || 'No phone'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-gray-900 capitalize">Basic Info</p>
                      <p className="text-xs text-gray-500 mt-0.5">{v.gender} • {v.dob}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold capitalize
                        ${v.status === 'verified' || v.status === 'approved' ? 'bg-green-50 text-green-700' :
                          v.status === 'pending' ? 'bg-blue-50 text-blue-700' :
                          'bg-red-50 text-red-700'}
                      `}>
                        {v.status === 'verified' || v.status === 'approved' ? <CheckCircle2 size={12}/> : 
                         v.status === 'pending' ? <Clock size={12}/> : <XCircle size={12}/>}
                        {v.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedVerification(v)}
                        className="font-semibold"
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {selectedVerification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-black text-gray-900">Review Verification</h2>
              <button onClick={() => {
                setSelectedVerification(null);
                setRejectionNotes('');
              }} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Customer Details</p>
                <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Full Name</p>
                    <p className="font-bold text-gray-900">{selectedVerification.full_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="font-bold text-gray-900">{selectedVerification.profiles?.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Date of Birth</p>
                    <p className="font-bold text-gray-900">{selectedVerification.dob}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Gender</p>
                    <p className="font-bold text-gray-900 capitalize">{selectedVerification.gender}</p>
                  </div>
                </div>
              </div>

              {selectedVerification.status === 'pending' && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Action</p>
                  <div className="space-y-3">
                    <textarea
                      value={rejectionNotes}
                      onChange={e => setRejectionNotes(e.target.value)}
                      placeholder="Rejection reason (if rejecting)..."
                      className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => handleUpdateStatus('rejected')}
                        disabled={isUpdating}
                        variant="outline" 
                        className="flex-1 text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                      >
                        Reject
                      </Button>
                      <Button 
                        onClick={() => handleUpdateStatus('approved')}
                        disabled={isUpdating}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              {selectedVerification.status !== 'pending' && (
                <div className={`p-4 rounded-xl border ${
                  selectedVerification.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <p className={`text-sm font-bold uppercase tracking-wide mb-1 ${
                    selectedVerification.status === 'approved' ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {selectedVerification.status}
                  </p>
                  {selectedVerification.verification_notes && (
                    <p className={`text-sm ${
                      selectedVerification.status === 'approved' ? 'text-green-700' : 'text-red-700'
                    }`}>
                      Note: {selectedVerification.verification_notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
