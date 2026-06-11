'use client';

import React, { useState } from 'react';
import { PhoneCall, MessageCircle, HeadphonesIcon, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useI18n } from '@/providers/I18nProvider';

export function ContactSupport() {
  const supportNumber = "7014868682";
  const waLink = `https://wa.me/91${supportNumber}`;
  const telLink = `tel:${supportNumber}`;
  const { t } = useI18n();

  const [showReportDialog, setShowReportDialog] = useState(false);
  const [problemType, setProblemType] = useState('booking');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 10) {
      toast.error(t('support.toastDescriptionLength'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/user/report-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemType,
          description,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || t('support.errProblemReportSubmit'));
      }

      toast.success(t('support.toastProblemReportLogged'));
      setShowReportDialog(false);
      setDescription('');
      setProblemType('booking');
    } catch (err: any) {
      toast.error(err.message || t('support.errReportSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
      {/* Header and Details */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-50 pb-5">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 text-amber-700 p-2.5 rounded-xl">
            <HeadphonesIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">{t('support.title')}</h2>
            <p className="text-sm text-gray-500">{t('support.subtitle')}</p>
          </div>
        </div>

        {/* Support Contact Number explicitly displayed */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4 flex flex-col items-center justify-center min-w-[180px] shadow-sm shrink-0 w-full md:w-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">{t('support.callSupport')}</span>
          <span className="text-lg font-black text-gray-950 mt-1">7014868682</span>
        </div>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed">
        {t('support.desc')}
      </p>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="w-full">
          <Button variant="outline" className="w-full h-12 justify-center border-green-200 hover:border-green-300 hover:bg-green-50 text-green-700 font-bold shadow-sm rounded-xl">
            <MessageCircle className="w-4 h-4 mr-2 text-green-600 animate-pulse" /> {t('support.whatsappSupport')}
          </Button>
        </a>
        
        <a href={telLink} className="w-full">
          <Button variant="outline" className="w-full h-12 justify-center border-blue-200 hover:border-blue-300 hover:bg-blue-50 text-blue-700 font-bold shadow-sm rounded-xl">
            <PhoneCall className="w-4 h-4 mr-2 text-blue-600" /> {t('support.callSupport')}
          </Button>
        </a>

        <Button 
          onClick={() => setShowReportDialog(true)} 
          className="w-full h-12 justify-center bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-sm rounded-xl"
        >
          <AlertCircle className="w-4 h-4 mr-2" /> {t('support.reportProblem')}
        </Button>
      </div>

      {/* Report Problem Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" /> {t('support.reportProblemTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Submit a support ticket regarding booking, payment, app performance, or account settings issues.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitProblem} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">{t('support.problemType')}</label>
              <select
                value={problemType}
                onChange={(e) => setProblemType(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                <option value="booking">{t('support.problemBooking')}</option>
                <option value="payment">{t('support.problemPayment')}</option>
                <option value="app_bug">{t('support.problemAppBug')}</option>
                <option value="profile">{t('support.problemProfile')}</option>
                <option value="other">{t('support.problemOther')}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">{t('support.issueDescription')}</label>
              <textarea
                placeholder={t('support.problemPlaceholder')}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setShowReportDialog(false)} disabled={isSubmitting}>
                {t('security.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-amber-500 hover:bg-amber-600 text-white font-bold">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> {t('security.submitting')}
                  </>
                ) : (
                  t('support.submitTicket')
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
