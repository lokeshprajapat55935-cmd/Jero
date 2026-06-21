"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { auth } from "@/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { ROUTES } from "@/lib/constants";
import { ShieldCheck, Zap, Wrench, Shield, ArrowRight, UserCircle, Briefcase, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language/LanguageToggle";
import { useUser } from "@/providers/UserProvider";
import { useI18n } from "@/providers/I18nProvider";
import { config } from "@/config";

export default function LandingPage() {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<'client' | 'partner'>('client');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const isVerifying = useRef(false);
  const router = useRouter();
  const { refreshProfile } = useUser();

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Only initialize if not already initialized
      if (!window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            size: 'invisible',
            callback: () => {
              // reCAPTCHA solved
            },
            'expired-callback': () => {
              toast.error("reCAPTCHA expired. Please try again.");
            }
          });
        } catch (err) {
          console.error("Recaptcha Init Error:", err);
        }
      }
    }
    // In React 18 strict mode, clearing on unmount can cause race conditions 
    // where window.grecaptcha complains it's already rendered. We leave it attached.
  }, []);

  const toE164IndianMobile = (num: string) => {
    const clean = num.replace(/\D/g, "");
    if (clean.length === 10) return `+91${clean}`;
    if (clean.length === 12 && clean.startsWith("91")) return `+${clean}`;
    return null;
  };

  const handlePhoneSubmit = async (e: React.FormEvent, selectedIntent: 'client' | 'partner') => {
    e.preventDefault();
    if (!phone) return toast.error("Please enter a phone number");
    
    const e164Phone = toE164IndianMobile(phone);
    if (!e164Phone) return toast.error("Please enter a valid 10-digit number");
    
    setIntent(selectedIntent);
    setLoading(true);

    try {
      // Check rate limit via backend optional start
      await authService.sendOtp(e164Phone);
      
      const isMockPhone = config.env.isDev && (phone === "7014868682" || phone === "9928340308");
      
      if (isMockPhone) {
        // Skip Firebase entirely for mock phones to prevent billing/recaptcha issues
        setIsOtpSent(true);
        toast.success("OTP sent successfully! (Mock Mode)");
      } else {
        const appVerifier = window.recaptchaVerifier;
        if (!appVerifier) throw new Error("Recaptcha not initialized");
        
        const confirmation = await signInWithPhoneNumber(auth, e164Phone, appVerifier);
        setConfirmationResult(confirmation);
        
        setIsOtpSent(true);
        toast.success("OTP sent successfully!");
      }
    } catch (error: any) {
      console.error("OTP send failure:", error);
      toast.error(error.message || "Failed to send OTP. Please try again.");
      
      // Reset recaptcha if error occurs to allow retry, but don't re-instantiate
      if (window.recaptchaVerifier) {
        try {
          // Instead of clearing and re-creating (which throws duplicate render), 
          // just render to refresh it or ignore.
          // Note: If auth/billing-not-enabled occurs, we don't need to rebuild it anyway.
        } catch (e) {
          console.error("Failed to reset recaptcha", e);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying.current) return;
    if (!otp) return toast.error("Please enter OTP");
    
    const e164Phone = toE164IndianMobile(phone);
    if (!e164Phone) return toast.error("Invalid phone number session.");
    
    const isMockPhone = config.env.isDev && (phone === "7014868682" || phone === "9928340308");
    if (!isMockPhone && !confirmationResult) return toast.error("Please request OTP first.");

    isVerifying.current = true;
    setLoading(true);
    try {
      let firebaseToken: string;

      if (isMockPhone && otp === "123456") {
        firebaseToken = `123456_mock_${Date.now()}`; // Unique mock token to bypass replay protection correctly
      } else {
        if (!confirmationResult) throw new Error("Verification session expired.");
        // 1. Verify OTP with Firebase
        const result = await confirmationResult.confirm(otp);
        firebaseToken = await result.user.getIdToken(true); // Force refresh to get a new token string and avoid replay protection errors
      }

      // 2. Verify with backend and get Supabase credentials
      const verifyResult = await authService.verifyOtp(e164Phone, firebaseToken);
      const { email, password } = verifyResult.credentials;

      // 3. Sign into Supabase
      const { data, error: signInError } = await authService.signIn(email, password);
      if (signInError) throw signInError;
      if (!data.user) throw new Error("Authentication failed after verification.");

      // 4. Set secure cookies for middleware protection
      const uidCookieName = intent === 'partner' ? 'zolvo_worker_uid' : 'zolvo_customer_uid';
      const otherUidCookieName = intent === 'partner' ? 'zolvo_customer_uid' : 'zolvo_worker_uid';
      const otherRoleCookieName = intent === 'partner' ? 'zolvo_customer_role' : 'zolvo_worker_role';
      
      // Clear opposing role cookies to prevent conflicting session states
      document.cookie = `${otherUidCookieName}=; path=/; max-age=0;`;
      document.cookie = `${otherRoleCookieName}=; path=/; max-age=0;`;
      
      document.cookie = `${uidCookieName}=${data.user.id}; path=/; max-age=2592000;`;
      
      // 5. Ensure profile exists and get metadata
      const profileResult = await authService.ensureProfile(data.user.id, e164Phone, intent);
      
      // Force sync profile context state to prevent stale user role issues
      await refreshProfile(data.user.id);
      
      // Update secure cookie with the actual verified role
      const verifiedRole = profileResult.data?.role || intent;
      const mappedRole = verifiedRole === 'worker' ? 'partner' : verifiedRole;
      const roleCookieName = verifiedRole === 'worker' ? 'zolvo_worker_role' : 'zolvo_customer_role';
      document.cookie = `${roleCookieName}=${mappedRole}; path=/; max-age=2592000;`;

      toast.success("Authentication successful!");

      // Redirection logic...
      const approvalStatus = profileResult.specificData?.status || 'pending';
      const partnerCurrentStep = profileResult.specificData?.current_step || 0;
      const payoutComplete = !!profileResult.specificData?.bank_holder_name;

      if (verifiedRole === 'admin') {
        router.push('/admin');
      } else if (verifiedRole === 'worker') {
        if (approvalStatus === 'approved') {
          if (payoutComplete) {
            router.push('/partner/dashboard');
          } else {
            router.push('/partner/onboarding');
          }
        } else if (approvalStatus === 'under_review') {
          router.push('/partner/application-under-review');
        } else if (approvalStatus === 'rejected') {
          router.push('/partner/rejected');
        } else {
          const onboardingIncomplete = profileResult.requiresOnboarding || !profileResult.data?.onboarded;
          if (onboardingIncomplete) {
            router.push('/partner/onboarding');
          } else {
            router.push('/partner/application-under-review');
          }
        }
      } else {
        router.push('/dashboard');
      }
      
    } catch (error: any) {
      console.error("Verification failure:", error);
      toast.error(error.message || "Invalid OTP or authentication failed.");
    } finally {
      isVerifying.current = false;
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