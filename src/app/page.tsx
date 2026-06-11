"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { ROUTES } from "@/lib/constants";
import { ShieldCheck, Zap, Wrench, Shield, ArrowRight, UserCircle, Briefcase, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language/LanguageToggle";
import { useUser } from "@/providers/UserProvider";
import { useI18n } from "@/providers/I18nProvider";

export default function LandingPage() {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<'client' | 'partner'>('client');
  const router = useRouter();
  const { refreshProfile } = useUser();
  
  const [authModules, setAuthModules] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      import("../firebase").then((mod) => {
        setAuthModules({
          auth: mod.auth,
          signInWithPhoneNumber: mod.signInWithPhoneNumber,
          getRecaptchaVerifier: mod.getRecaptchaVerifier,
          clearRecaptchaVerifier: mod.clearRecaptchaVerifier,
        });
      }).catch((err) => {
        console.error("Firebase dynamic client-side loading failed:", err);
      });
    }

    return () => {
      if (typeof window !== "undefined") {
        import("../firebase").then((mod) => {
          mod.clearRecaptchaVerifier();
        }).catch(() => {});
      }
    };
  }, []);

  const toE164IndianMobile = (num: string) => {
    const clean = num.replace(/\D/g, "");
    if (clean.length === 10) return `+91${clean}`;
    if (clean.length === 12 && clean.startsWith("91")) return `+${clean}`;
    return null;
  };

  const getFriendlyErrorMessage = (error: any) => {
    const code = error.code || "";
    switch (code) {
      case "auth/invalid-verification-code": return "The OTP entered is incorrect. Please check and try again.";
      case "auth/code-expired": return "The OTP has expired. Please request a new one.";
      case "auth/too-many-requests": return "Too many attempts. Please try again later.";
      case "auth/network-request-failed": return "Network error. Please check your connection.";
      case "auth/invalid-phone-number": return "Invalid phone number format.";
      case "auth/billing-not-enabled": return "Phone authentication is unavailable because Firebase billing is not enabled.";
      case "auth/internal-error": return "An internal server error occurred. Please try again.";
      default: return error.message || "An unexpected error occurred.";
    }
  };

  const initRecaptcha = (auth: any) => {
    return authModules.getRecaptchaVerifier(auth, "recaptcha-container");
  };

  const handlePhoneSubmit = async (e: React.FormEvent, selectedIntent: 'client' | 'partner') => {
    e.preventDefault();
    if (!phone) return toast.error("Please enter a phone number");
    
    const e164Phone = toE164IndianMobile(phone);
    if (!e164Phone) return toast.error("Please enter a valid 10-digit number");
    
    if (!authModules) {
      return toast.error("Authentication system initializing... Please wait.");
    }
    
    setIntent(selectedIntent);
    setLoading(true);

    try {
      const { auth, signInWithPhoneNumber } = authModules;
      if (authModules.clearRecaptchaVerifier) authModules.clearRecaptchaVerifier();

      const appVerifier = initRecaptcha(auth);
      if (!appVerifier) throw new Error("reCAPTCHA failed to initialize.");

      const confirmationResult = await signInWithPhoneNumber(auth, e164Phone, appVerifier);
      (window as any).confirmationResult = confirmationResult;
      
      setIsOtpSent(true);
      toast.success("OTP sent successfully!");
    } catch (error: any) {
      console.error("OTP send failure:", error);
      toast.error(getFriendlyErrorMessage(error));
      if (authModules?.clearRecaptchaVerifier) authModules.clearRecaptchaVerifier();
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return toast.error("Please enter OTP");
    const confirmationResult = (window as any).confirmationResult;
    
    if (!confirmationResult) {
      return toast.error("Session expired or missing. Please request a new OTP.");
    }

    setLoading(true);
    try {
      const result = await confirmationResult.confirm(otp);
      // Set secure cookies for middleware protection
      document.cookie = `zolvo_auth_uid=${result.user.uid}; path=/; max-age=2592000;`;
      
      const e164Phone = toE164IndianMobile(phone) || phone;
      const profileResult = await authService.ensureProfile(result.user.uid, e164Phone, intent);
      
      // Force sync profile context state to prevent stale user role issues
      await refreshProfile(result.user.uid);
      
      // Update secure cookie with the actual verified role
      const verifiedRole = profileResult.data?.role || intent;
      const mappedRole = verifiedRole === 'worker' ? 'partner' : verifiedRole;
      document.cookie = `zolvo_role=${mappedRole}; path=/; max-age=2592000;`;

      toast.success("Authentication successful!");

      // Redirection based on role and onboarding status
      const approvalStatus = profileResult.specificData?.status || 'pending';
      const partnerCurrentStep = profileResult.specificData?.current_step || 0;
      const payoutComplete = !!profileResult.specificData?.bank_holder_name;

      console.log('Login redirect validation:', { 
        role: verifiedRole, 
        onboarded: profileResult.data?.onboarded, 
        requiresOnboarding: profileResult.requiresOnboarding, 
        partnerStatus: approvalStatus,
        partnerCurrentStep,
        payoutComplete,
      });

      if (verifiedRole === 'admin') {
        console.log('Redirect reason: Admin → /admin');
        router.push('/admin');
      } else if (verifiedRole === 'worker') {
        // For approved workers: always route based on approvalStatus.
        // Approved workers with missing payout are handled by /partner/onboarding itself (step 6 renders).
        // Do NOT block an approved worker with onboardingIncomplete — status===approved overrides all.
        if (approvalStatus === 'approved') {
          if (payoutComplete) {
            console.log('Redirect reason: Worker approved + payout complete → /partner/dashboard');
            router.push('/partner/dashboard');
          } else {
            console.log('Redirect reason: Worker approved + payout missing → /partner/onboarding (step 6)');
            router.push('/partner/onboarding');
          }
        } else if (approvalStatus === 'under_review') {
          console.log('Redirect reason: Worker under_review → /partner/application-under-review');
          router.push('/partner/application-under-review');
        } else if (approvalStatus === 'rejected') {
          console.log('Redirect reason: Worker rejected → /partner/rejected');
          router.push('/partner/rejected');
        } else {
          // pending or unknown — check if onboarding is incomplete
          const onboardingIncomplete = profileResult.requiresOnboarding || !profileResult.data?.onboarded;
          if (onboardingIncomplete) {
            console.log('Redirect reason: Worker onboarding incomplete (step', partnerCurrentStep, ', onboarded:', profileResult.data?.onboarded, ') → /partner/onboarding');
            router.push('/partner/onboarding');
          } else {
            // Onboarding done but status still pending → under-review
            console.log('Redirect reason: Worker onboarding done, status=pending → /partner/application-under-review');
            router.push('/partner/application-under-review');
          }
        }
      } else {
        // Default client/customer routing (never send customers to worker pages)
        console.log('Redirecting Customer to /dashboard');
        router.push('/dashboard');
      }
      
    } catch (error: any) {
      console.error("Verification failure:", error);
      toast.error(getFriendlyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <div id="recaptcha-container"></div>

      {isOtpSent ? (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-gray-100">
            <button 
              onClick={() => { setIsOtpSent(false); setOtp(""); }}
              className="flex items-center text-sm font-semibold text-gray-500 hover:text-gray-900 mb-6 transition-colors"
            >
              <ChevronLeft size={16} className="mr-1" /> {t('landing.changeNumber')}
            </button>
            
            <h2 className="text-2xl font-black text-gray-900">{t('landing.otpHeader')}</h2>
            <p className="mt-2 text-sm text-gray-500">
              {t('landing.otpSentTo', { phone: `+91 ${phone}` })}
            </p>

            <form onSubmit={handleOtpSubmit} className="mt-8 space-y-6">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full text-center text-3xl font-black tracking-[0.5em] rounded-xl border-gray-300 py-4 shadow-sm focus:border-black focus:ring-black outline-none border"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all text-white"
              >
                {loading ? t('landing.verifying') : t('landing.verifyAndContinue')}
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
          {/* Premium Hero Section */}
          <section className="relative overflow-hidden bg-black text-white pt-24 pb-32 px-4 sm:px-6 lg:px-8 flex-shrink-0">
            <div className="absolute top-4 right-4 z-50">
              <LanguageToggle />
            </div>
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
              <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[120px]" />
              <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-emerald-500/20 blur-[100px]" />
            </div>
            
            <div className="relative z-10 max-w-5xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md px-4 py-1.5 mb-8">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  {t('landing.platformBadge')}
                </span>
              </div>
              
              <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-[1.1] mb-6">
                {t('landing.heroTitlePre')} <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                  {t('landing.heroTitlePost')}
                </span>
              </h1>
              
              <p className="max-w-2xl mx-auto text-lg sm:text-xl font-medium text-gray-400 mb-10">
                {t('landing.heroSubtitle')}
              </p>
            </div>
          </section>

          {/* Dual Login Forms Section - Overlapping the hero */}
          <section className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 pb-24 w-full">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Primary CTA (Large) - Client Login */}
              <div className="md:col-span-7 bg-white rounded-3xl p-6 sm:p-10 shadow-2xl shadow-blue-900/5 border border-gray-100 flex flex-col justify-between">
                <div>
                  <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                    <UserCircle size={24} />
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">{t('landing.bookProTitle')}</h2>
                  <p className="mt-3 text-sm font-medium text-gray-500 leading-relaxed mb-8">
                    {t('landing.bookProDesc')}
                  </p>
                </div>
                
                <form onSubmit={(e) => handlePhoneSubmit(e, 'client')} className="mt-auto">
                  <div className="relative flex items-center mb-4">
                    <div className="absolute left-4 font-bold text-gray-500 border-r border-gray-200 pr-3">+91</div>
                    <input
                      type="text"
                      maxLength={10}
                      value={intent === 'client' ? phone : ''}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, ''));
                        setIntent('client');
                      }}
                      placeholder={t('landing.enterPhonePlaceholder')}
                      className="w-full h-16 pl-20 pr-4 bg-gray-50 border-transparent focus:bg-white rounded-2xl text-lg font-bold shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all border outline-none"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full h-14 rounded-xl text-base font-bold bg-black hover:bg-gray-800 text-white transition-all shadow-md active:scale-[0.99]">
                    {t('landing.continueCustomer')} <ArrowRight size={18} className="ml-2" />
                  </Button>
                </form>
              </div>

              {/* Secondary CTA (Smaller) - Partner Login */}
              <div className="md:col-span-5 bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-blue-900/20 text-white flex flex-col justify-between border border-blue-500/30">
                <div>
                  <div className="h-12 w-12 bg-white/10 text-white rounded-2xl flex items-center justify-center mb-6">
                    <Briefcase size={24} />
                  </div>
                  <h2 className="text-2xl font-black tracking-tight">{t('landing.joinPartnerTitle')}</h2>
                  <p className="mt-3 text-sm font-medium text-blue-100 leading-relaxed mb-8">
                    {t('landing.joinPartnerDesc')}
                  </p>
                </div>
                
                <form onSubmit={(e) => handlePhoneSubmit(e, 'partner')} className="mt-auto">
                  <div className="relative flex items-center mb-4">
                    <div className="absolute left-4 font-bold text-blue-200 border-r border-blue-400/30 pr-3">+91</div>
                    <input
                      type="text"
                      maxLength={10}
                      value={intent === 'partner' ? phone : ''}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, ''));
                        setIntent('partner');
                      }}
                      placeholder={t('landing.partnerPhonePlaceholder')}
                      className="w-full h-14 pl-16 pr-4 bg-white/10 border-transparent placeholder:text-blue-200/60 focus:bg-white focus:text-black rounded-xl text-base font-bold focus:border-white focus:ring-4 focus:ring-white/20 transition-all text-white border outline-none"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full h-14 rounded-xl text-base font-bold bg-white text-blue-700 hover:bg-blue-50 transition-all shadow-lg shadow-black/10 active:scale-[0.99]">
                    {t('landing.continuePartner')}
                  </Button>
                </form>
              </div>

            </div>
          </section>

          {/* Trust Badges */}
          <section className="bg-white py-12 border-y border-gray-200">
            <div className="max-w-5xl mx-auto px-4 flex flex-wrap justify-center gap-10 opacity-70 grayscale">
              <div className="flex items-center gap-2"><Shield size={24} /><span className="font-bold text-sm tracking-widest">{t('common.verified').toUpperCase()}</span></div>
              <div className="flex items-center gap-2"><Zap size={24} /><span className="font-bold text-sm tracking-widest">{t('home.emergencyTitle').toUpperCase()}</span></div>
              <div className="flex items-center gap-2"><Wrench size={24} /><span className="font-bold text-sm tracking-widest">{t('common.professional').toUpperCase()}</span></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}