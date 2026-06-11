'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { reviewService } from '@/services/review';
import type { Review } from '@/types';
import {
  Star,
  Search,
  Loader2,
  Eye,
  EyeOff,
  Flag,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  User,
  Wrench,
  ThumbsUp
} from 'lucide-react';

export function ReviewsModeration() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [hideFilter, setHideFilter] = useState<string>('all');
  
  // Refresh counter to trigger fetches
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    async function loadReviews() {
      setLoading(true);
      try {
        const filters: any = {};
        if (flagFilter === 'flagged') filters.is_flagged = true;
        if (flagFilter === 'unflagged') filters.is_flagged = false;
        
        if (hideFilter === 'hidden') filters.is_hidden = true;
        if (hideFilter === 'visible') filters.is_hidden = false;

        if (search.trim() !== '') filters.search = search;

        const res = await reviewService.getAllReviewsAdmin(filters);
        if (res.error) throw new Error(res.error);
        setReviews(res.data || []);
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Error loading reviews',
          description: err.message || 'Failed to sync with API',
        });
      } finally {
        setLoading(false);
      }
    }
    loadReviews();
  }, [search, flagFilter, hideFilter, refreshCount, toast]);

  const handleModerate = async (reviewId: string, action: 'hide' | 'unhide' | 'flag' | 'unflag') => {
    try {
      const res = await reviewService.moderateReviewAdmin(reviewId, action);
      if (res.error) throw new Error(res.error);
      
      toast({
        title: 'Action Successful',
        description: `Review has been successfully ${action}d.`,
      });
      // Trigger a re-fetch
      setRefreshCount(prev => prev + 1);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Moderation failed',
        description: err.message || 'Failed to update review status',
      });
    }
  };

  return (
    <div className="space-y-6 text-white">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Review Moderation</h1>
          <p className="text-xs text-white/40">Audit user feedback, flag suspicious content, and toggle visibility settings.</p>
        </div>
        <Button
          onClick={() => setRefreshCount(prev => prev + 1)}
          disabled={loading}
          variant="outline"
          className="border-white/10 bg-white/5 hover:bg-white/8 text-white hover:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Force Reload
        </Button>
      </div>

      {/* Filter Card */}
      <Card className="bg-[#0f0f13] border-white/8 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by review, client, or worker..."
              className="pl-9 bg-[#141419] border-white/8 focus:border-violet-500 focus:ring-0 text-white placeholder-white/30"
            />
          </div>

          {/* Flag filter */}
          <div>
            <select
              value={flagFilter}
              onChange={(e) => setFlagFilter(e.target.value)}
              className="w-full bg-[#141419] border border-white/8 rounded-md px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Flag Statuses</option>
              <option value="flagged">Flagged Suspicious</option>
              <option value="unflagged">Unflagged Reviews</option>
            </select>
          </div>

          {/* Hide filter */}
          <div>
            <select
              value={hideFilter}
              onChange={(e) => setHideFilter(e.target.value)}
              className="w-full bg-[#141419] border border-white/8 rounded-md px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Visibilities</option>
              <option value="hidden">Hidden Reviews</option>
              <option value="visible">Visible Reviews</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table Card */}
      <Card className="bg-[#0f0f13] border-white/8 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-white/40 font-semibold">Syncing review log databases...</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ThumbsUp className="w-12 h-12 text-white/10" />
            <p className="text-sm text-white/30 font-bold">No reviews match the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-white/8 hover:bg-transparent">
                <TableRow className="border-b border-white/8 hover:bg-transparent">
                  <TableHead className="text-white/40 font-bold text-xs uppercase tracking-wider">Reviewer</TableHead>
                  <TableHead className="text-white/40 font-bold text-xs uppercase tracking-wider">Worker Being Rated</TableHead>
                  <TableHead className="text-white/40 font-bold text-xs uppercase tracking-wider">Rating</TableHead>
                  <TableHead className="text-white/40 font-bold text-xs uppercase tracking-wider w-[35%]">Feedback Details</TableHead>
                  <TableHead className="text-white/40 font-bold text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-white/40 font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-white/5">
                {reviews.map((r) => {
                  const clientName = r.client?.full_name || r.client?.profile?.full_name || 'Client';
                  const workerName = r.worker?.profile?.full_name || r.worker?.name || 'Worker';
                  const workerCategory = r.worker?.category || '';

                  return (
                    <TableRow key={r.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      {/* Reviewer info */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-violet-500/10 rounded-full flex items-center justify-center text-violet-400 text-xs font-bold uppercase">
                            {r.reviewer_role === 'client' ? 'C' : 'W'}
                          </div>
                          <div>
                            <p className="font-bold text-white text-xs">
                              {r.reviewer_role === 'client' ? clientName : workerName}
                            </p>
                            <p className="text-[10px] text-white/40 capitalize">
                              Role: {r.reviewer_role === 'client' ? 'Customer' : 'Partner'}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Rated entity info */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-white/5 rounded-full flex items-center justify-center text-white/60">
                            <Wrench className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-semibold text-white text-xs">
                              {r.reviewer_role === 'client' ? workerName : clientName}
                            </p>
                            <p className="text-[10px] text-white/30 capitalize">
                              {r.reviewer_role === 'client' ? workerCategory : 'Customer'}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Ratings stars */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-black text-white">{Number(r.rating).toFixed(1)}</span>
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          </div>
                          {r.reviewer_role === 'worker' && (
                            <span className="text-[9px] text-white/30 block leading-tight">
                              Beh: {r.rating_behavior} | Coop: {r.rating_cooperation} | Pay: {r.rating_payment}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Text & Tags */}
                      <TableCell>
                        <div className="space-y-1.5 py-1">
                          {r.review_text ? (
                            <p className="text-xs text-white/80 italic leading-relaxed bg-[#141419] p-2 rounded-lg border border-white/5">
                              &quot;{r.review_text}&quot;
                            </p>
                          ) : (
                            <span className="text-[10px] text-white/20 italic">No comments provided</span>
                          )}
                          {r.tags && r.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {r.tags.map((tag) => (
                                <Badge key={tag} className="bg-white/5 border border-white/10 hover:bg-white/5 text-white/50 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Status Badges */}
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {r.is_hidden && (
                            <Badge variant="destructive" className="w-fit text-[9px] px-2 py-0.5 rounded-full font-bold bg-red-500/15 text-red-400 border border-red-500/20">
                              Hidden
                            </Badge>
                          )}
                          {r.is_flagged && (
                            <Badge className="w-fit text-[9px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                              Flagged
                            </Badge>
                          )}
                          {!r.is_hidden && !r.is_flagged && (
                            <Badge className="w-fit text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                              Approved
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Hide toggle */}
                          {r.is_hidden ? (
                            <Button
                              onClick={() => handleModerate(r.id, 'unhide')}
                              size="sm"
                              variant="outline"
                              className="h-8 text-[10px] font-bold border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-300"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Unhide
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleModerate(r.id, 'hide')}
                              size="sm"
                              variant="outline"
                              className="h-8 text-[10px] font-bold border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300"
                            >
                              <EyeOff className="w-3.5 h-3.5 mr-1" />
                              Hide
                            </Button>
                          )}

                          {/* Flag toggle */}
                          {r.is_flagged ? (
                            <Button
                              onClick={() => handleModerate(r.id, 'unflag')}
                              size="sm"
                              variant="outline"
                              className="h-8 text-[10px] font-bold border-white/10 bg-white/5 hover:bg-white/8 text-white hover:text-white"
                            >
                              Unflag
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleModerate(r.id, 'flag')}
                              size="sm"
                              variant="outline"
                              className="h-8 text-[10px] font-bold border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300"
                            >
                              <Flag className="w-3.5 h-3.5 mr-1" />
                              Flag
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
