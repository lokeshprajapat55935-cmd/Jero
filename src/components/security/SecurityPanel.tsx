'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, ShieldAlert, Key, LogOut, 
  Download, Trash2, Smartphone, AlertTriangle, Loader2,
  FileText, Scale, Eye, Flag, HeadphonesIcon, ChevronRight, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/providers/UserProvider';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useI18n } from '@/providers/I18nProvider';

export function SecurityPanel() {
  const { user, profile, logout } = useUser();
  const router = useRouter();
  const { t } = useI18n();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDataDeletionDialog, setShowDataDeletionDialog] = useState(false);
  const [showAbuseDialog, setShowAbuseDialog] = useState(false);
  const [showDataUsageDialog, setShowDataUsageDialog] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [isSubmittingAbuse, setIsSubmittingAbuse] = useState(false);

  const [abuseType, setAbuseType] = useState('behavior');
  const [abuseTarget, setAbuseTarget] = useState('');
  const [abuseDescription, setAbuseDescription] = useState('');

  const handleDataDownload = () => {
    toast.success(t('security.toastDataExport'));
  };

  const handleAccountDeleteSubmit = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
      });
      const json = await response.json();
      
      if (!response.ok || !json.success) {
        throw new Error(json.error || t('security.errDeleteAccount'));
      }

      toast.success(t('security.toastDeleteAccountSuccess'));
      setShowDeleteDialog(false);
      
      // Perform client logout redirect to root
      await logout();
      router.replace('/');
    } catch (e: any) {
      toast.error(e.message || t('security.errDeleteAccount'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDataDeletionSubmit = async () => {
    setIsRequestingDeletion(true);
    try {
      const response = await fetch('/api/user/data-deletion', {
        method: 'POST',
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || t('security.errDataDeletion'));
      }

      toast.success(json.data?.message || t('security.toastDataDeletionSuccess'));
      setShowDataDeletionDialog(false);
    } catch (e: any) {
      toast.error(e.message || t('security.errDataDeletionRegister'));
    } finally {
      setIsRequestingDeletion(false);
    }
  };

  const handleAbuseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abuseDescription.trim() || abuseDescription.trim().length < 10) {
      toast.error(t('security.toastAbuseDescriptionLength'));
      return;
    }
    
    setIsSubmittingAbuse(true);
    try {
      const response = await fetch('/api/user/report-abuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abuseType,
          targetDetails: abuseTarget,
          description: abuseDescription,
        }),
      });
      const json = await response.json();
      
      if (!response.ok || !json.success) {
        throw new Error(json.error || t('security.errAbuseSubmit'));
      }
      
      toast.success(t('security.toastAbuseSubmitted'));
      setShowAbuseDialog(false);
      setAbuseTarget('');
      setAbuseDescription('');
      setAbuseType('behavior');
    } catch (err: any) {
      toast.error(err.message || t('security.errAbuseSubmit'));
    } finally {
      setIsSubmittingAbuse(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    toast.success(t('security.toastLogoutOthers'));
  };

  const handleLogout = async () => {
    toast.loading(t('security.toastSecureLoggingOut'), { id: 'logout' });
    try {
      await logout();
      toast.success(t('security.toastLogoutSuccess'), { id: 'logout' });
      router.replace('/');
    } catch (e) {
      toast.error(t('security.toastLogoutFailed'), { id: 'logout' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Account Security */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" /> {t('security.accountSecurity')}
          </h2>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gray-100 p-2 rounded-lg text-gray-700">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('security.phoneVerification')}</p>
                <p className="text-sm text-gray-500">{user?.phone || 'Not provided'}</p>
              </div>
            </div>
            {profile?.phone_verified ? (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">{t('security.verified')}</span>
            ) : (
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">{t('security.pending')}</span>
            )}
          </div>

          <hr className="border-gray-100" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gray-100 p-2 rounded-lg text-gray-700">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('security.sessionManagement')}</p>
                <p className="text-sm text-gray-500">{t('security.activeOnDevice')}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogoutAllDevices}>
              {t('security.logoutOthers')}
            </Button>
          </div>
        </div>
      </section>

      {/* Trust & Safety */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" /> {t('security.trustSafety')}
          </h2>
        </div>
        
        <div className="p-0">
          <button 
            onClick={() => setShowAbuseDialog(true)} 
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="bg-red-50 text-red-600 p-2 rounded-lg">
                <Flag className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('security.reportAbuse')}</p>
                <p className="text-sm text-gray-500">{t('security.reportAbuseDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>
          
          <button 
            onClick={() => router.push('/profile/help-support')} 
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 text-blue-600 p-2 rounded-lg">
                <HeadphonesIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('settings.contactSupport')}</p>
                <p className="text-sm text-gray-500">{t('security.contactSupportDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>
        </div>
      </section>

      {/* Data & Legal */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Info className="w-5 h-5 text-indigo-500" /> {t('security.dataLegal')}
          </h2>
        </div>
        
        <div className="p-0">
          <button 
            onClick={() => setShowDataUsageDialog(true)} 
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('security.dataUsage')}</p>
                <p className="text-sm text-gray-500">{t('security.dataUsageDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>

          <button 
            onClick={() => router.push('/profile/privacy-policy')} 
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('security.privacyPolicy')}</p>
                <p className="text-sm text-gray-500">{t('security.privacyPolicyDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>

          <button 
            onClick={() => router.push('/profile/terms')} 
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="bg-amber-50 text-amber-600 p-2 rounded-lg">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('security.termsConditions')}</p>
                <p className="text-sm text-gray-500">{t('security.termsConditionsDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>

          <button 
            onClick={handleDataDownload} 
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="bg-gray-50 text-gray-600 p-2 rounded-lg">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('security.downloadData')}</p>
                <p className="text-sm text-gray-500">{t('security.downloadDataDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>
          
          <button 
            onClick={() => setShowDataDeletionDialog(true)} 
            className="w-full flex items-center justify-between p-5 hover:bg-amber-50/20 transition-colors border-b border-gray-100 text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="bg-amber-50/50 text-amber-600 p-2 rounded-lg">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('security.requestDataDeletion')}</p>
                <p className="text-sm text-gray-500">{t('security.requestDataDeletionDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>

          <button 
            onClick={() => setShowDeleteDialog(true)} 
            className="w-full flex items-center justify-between p-5 hover:bg-red-50 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="bg-red-50 text-red-600 p-2 rounded-lg group-hover:bg-red-100">
                <Trash2 className="w-5 h-5 text-red-500 group-hover:text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-red-600">{t('security.deleteAccountBtn')}</p>
                <p className="text-sm text-red-400">{t('security.deleteAccountDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>
        </div>
      </section>

      {/* Logout */}
      <Button 
        variant="outline" 
        className="w-full h-14 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300 font-bold text-base shadow-sm rounded-xl"
        onClick={handleLogout}
      >
        <LogOut className="w-5 h-5 mr-2" /> {t('common.logout')}
      </Button>

      {/* Report Abuse Dialog */}
      <Dialog open={showAbuseDialog} onOpenChange={setShowAbuseDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Flag className="w-5 h-5 text-red-500" /> {t('security.reportAbuseTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Report abuse, fraud, harassment, fake profiles, or other policy violations.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAbuseSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">{t('security.abuseCategory')}</label>
              <select
                value={abuseType}
                onChange={(e) => setAbuseType(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
              >
                <option value="behavior">{t('security.abuseInappropriate')}</option>
                <option value="fraud">{t('security.abuseFraud')}</option>
                <option value="harassment">{t('security.abuseHarassment')}</option>
                <option value="unauthorized">{t('security.abuseUnauthorized')}</option>
                <option value="fake">{t('security.abuseFake')}</option>
                <option value="other">{t('security.abuseOther')}</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">{t('security.targetDetailsLabel')}</label>
              <input
                type="text"
                placeholder="e.g. Worker Name or Booking ID"
                value={abuseTarget}
                onChange={(e) => setAbuseTarget(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">{t('security.descriptionLabel')}</label>
              <textarea
                placeholder="Provide details about the incident (minimum 10 characters)..."
                rows={4}
                value={abuseDescription}
                onChange={(e) => setAbuseDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
                required
              />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAbuseDialog(false)} disabled={isSubmittingAbuse}>
                {t('security.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmittingAbuse} className="bg-red-600 hover:bg-red-700 text-white font-bold">
                {isSubmittingAbuse ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> {t('security.submitting')}
                  </>
                ) : (
                  t('security.submitReport')
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Data Usage Disclosures Dialog */}
      <Dialog open={showDataUsageDialog} onOpenChange={setShowDataUsageDialog}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Eye className="w-5 h-5 text-indigo-500" /> {t('security.dataUsageTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Detailed disclosures regarding profile data, device logs, and location tracking usage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-gray-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
            <p>
              {t('security.dataUsageIntro')}
            </p>
            
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="bg-indigo-50 text-indigo-600 p-1.5 rounded h-fit shrink-0 mt-0.5">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-xs">{t('security.profileContactInfoTitle')}</p>
                  <p className="text-xs text-gray-500">{t('security.profileContactInfoDesc')}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded h-fit shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-xs">{t('security.locationGeofencingTitle')}</p>
                  <p className="text-xs text-gray-500">{t('security.locationGeofencingDesc')}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="bg-amber-50 text-amber-600 p-1.5 rounded h-fit shrink-0 mt-0.5">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-xs">{t('security.deviceAuditLogsTitle')}</p>
                  <p className="text-xs text-gray-500">{t('security.deviceAuditLogsDesc')}</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs p-3 rounded-lg leading-normal">
              {t('security.androidNotice')}
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button onClick={() => setShowDataUsageDialog(false)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {t('security.understand')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Deletion Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-center text-xl font-black text-gray-950">{t('security.deleteAccountTitle')}</DialogTitle>
            <DialogDescription className="sr-only">
              Warning about irreversible account deletion and loss of personal profile and wallet data.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-gray-500 space-y-2 py-2 text-center sm:text-left leading-relaxed">
            <p className="font-semibold text-gray-800">{t('security.deleteAccountWarning')}</p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>{t('security.deleteAccountItem1')}</li>
              <li>{t('security.deleteAccountItem2')}</li>
              <li>{t('security.deleteAccountItem3')}</li>
              <li>{t('security.deleteAccountItem4')}</li>
            </ul>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              {t('security.cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleAccountDeleteSubmit} 
              disabled={isDeleting}
              className="gap-2 font-bold"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('security.deleting')}
                </>
              ) : (
                t('security.deleteAccountBtn')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Data Deletion Request Dialog */}
      <Dialog open={showDataDeletionDialog} onOpenChange={setShowDataDeletionDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mb-2">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center text-xl font-black text-gray-950">{t('security.dataDeletionTitle')}</DialogTitle>
            <DialogDescription className="sr-only">
              Information about submitting a request to remove all personal data and audit logs.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-gray-500 space-y-2 py-2 text-center sm:text-left leading-relaxed">
            <p>
              {t('security.dataDeletionText')}
            </p>
            <p className="text-xs text-amber-600 font-bold bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              {t('security.dataDeletionNotice')}
            </p>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setShowDataDeletionDialog(false)} disabled={isRequestingDeletion}>
              {t('security.cancel')}
            </Button>
            <Button 
              onClick={handleDataDeletionSubmit} 
              disabled={isRequestingDeletion}
              className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isRequestingDeletion ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('security.submittingRequest')}
                </>
              ) : (
                t('security.submitRequestBtn')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
