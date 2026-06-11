"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/providers/UserProvider";
import { ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, ChevronRight, Briefcase, UserCircle, Map, 
  CreditCard, Shield, Image, FileText, Loader2, Camera, UploadCloud 
} from "lucide-react";

export default function PartnerOnboardingWizard() {
  const { profile } = useUser();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [cities, setCities] = useState<any[]>([]);

  // Defensive Check: Customer attempting to access Worker onboarding page
  useEffect(() => {
    if (profile && profile.role !== 'worker') {
      console.log('Defensive Check: Redirecting customer away from worker onboarding page', { role: profile.role });
      router.replace('/dashboard');
    }
  }, [profile, router]);

  // Consolidated form state
  const [formData, setFormData] = useState({
    fullName: "",
    mobile: "",
    gender: "",
    dob: "",
    selfieUrl: "",
    bio: "",
    cityId: "",
    address: "",
    workingAreas: "",
    serviceCategory: "",
    experience: "",
    skills: "",
    languages: "",
    idProofType: "Aadhaar",
    idProofUrl: "",
    aadhaar: "",
    pan: "",
    bankHolder: "",
    bankAccount: "",
    ifsc: "",
    upi: "",
    workingDays: "Mon-Sat",
    workingHours: "9 AM - 6 PM",
    serviceRadius: "10 km"
  });

  const [selfieUploading, setSelfieUploading] = useState(false);
  const [idProofUploading, setIdProofUploading] = useState(false);

  // 1. Fetch cities and load saved onboarding progress on mount
  useEffect(() => {
    const initOnboarding = async () => {
      if (!profile?.id) return;
      const supabase = createClient();

      try {
        // Fetch active cities
        const { data: cityData } = await supabase
          .from("cities")
          .select("*")
          .eq("is_active", true);
        if (cityData) setCities(cityData);

        // Fetch existing partner progress
        const { data: partnerData, error: partnerErr } = await supabase
          .from("partners")
          .select("*")
          .eq("profile_id", profile.id)
          .maybeSingle();

        if (partnerErr) throw partnerErr;

        if (partnerData) {
          // Guard: redirect approved workers ONLY if payout is complete.
          // If bank_holder_name is NULL, the worker was approved before filling payout — they must complete step 6.
          if (partnerData.status === 'approved') {
            const payoutComplete = !!partnerData.bank_holder_name;
            console.log('[Onboarding] status=approved | bank_holder_name:', partnerData.bank_holder_name, '| payoutComplete:', payoutComplete);
            if (payoutComplete) {
              console.log('[Onboarding] Payout complete. Redirecting approved worker to dashboard.');
              router.replace('/partner/dashboard');
              return;
            }
            // Approved but payout missing — fall through to show step 6
            console.log('[Onboarding] Approved but payout missing. Allowing step 6 to render.');
          }

          // Only redirect to under-review if the application has been submitted (status = under_review)
          if (partnerData.status === 'under_review') {
            console.log('[Onboarding] status=under_review. Redirecting to application-under-review.');
            router.replace('/partner/application-under-review');
            return;
          }
          if (partnerData.status === 'rejected') {
            console.log('[Onboarding] status=rejected. Redirecting to rejected page.');
            router.replace('/partner/rejected');
            return;
          }

          // Resume from saved step
          const resumeStep = partnerData.current_step || 1;
          console.log('[Onboarding] Resuming from DB step:', resumeStep, '| partner status:', partnerData.status);
          setStep(resumeStep);
          setFormData(prev => ({
            ...prev,
            fullName: partnerData.full_name || profile.full_name || "",
            mobile: profile.phone || "",
            gender: partnerData.gender || "",
            dob: partnerData.dob || "",
            selfieUrl: partnerData.selfie_url || "",
            bio: partnerData.bio || "",
            cityId: partnerData.city_id || "",
            address: partnerData.address || "",
            workingAreas: partnerData.working_areas ? partnerData.working_areas.join(", ") : "",
            serviceCategory: partnerData.service_category || "",
            experience: partnerData.experience || "",
            skills: partnerData.skills ? partnerData.skills.join(", ") : "",
            languages: partnerData.languages ? partnerData.languages.join(", ") : "",
            idProofType: partnerData.id_proof_type || "Aadhaar",
            idProofUrl: partnerData.id_proof_url || "",
            aadhaar: partnerData.aadhaar_number || "",
            pan: partnerData.pan_number || "",
            bankHolder: partnerData.bank_holder_name || "",
            bankAccount: partnerData.bank_account_number || "",
            ifsc: partnerData.ifsc_code || "",
            upi: partnerData.upi_id || "",
            workingDays: partnerData.working_days ? partnerData.working_days.join(", ") : "Mon-Sat",
            workingHours: partnerData.working_hours || "9 AM - 6 PM",
            serviceRadius: partnerData.service_radius || "10 km"
          }));
        } else {
          // Set defaults from profile
          setFormData(prev => ({
            ...prev,
            fullName: profile.full_name || "",
            mobile: profile.phone || ""
          }));
        }
      } catch (err: any) {
        console.error("Failed to initialize onboarding data", err);
        toast.error("Failed to load saved progress");
      } finally {
        setInitLoading(false);
      }
    };

    initOnboarding();
  }, [profile]);

  const updateForm = (key: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  // 2. Client-side & Server-side file upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'selfie' | 'id_proof') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // A. Validation: Max Size 5MB
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size cannot exceed 5MB.");
      return;
    }

    // B. Validation: Mime types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid format. Please upload JPG, PNG, WEBP or PDF.");
      return;
    }

    const setUploading = type === 'selfie' ? setSelfieUploading : setIdProofUploading;
    setUploading(true);

    try {
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('type', type);

      const res = await fetch('/api/worker/upload', {
        method: 'POST',
        body: uploadData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Upload failed");

      if (type === 'selfie') {
        updateForm('selfieUrl', json.data.url);
        toast.success("Profile photo uploaded successfully!");
      } else {
        updateForm('idProofUrl', json.data.url);
        toast.success("ID proof document uploaded successfully!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  // 3. Save progress API caller
  const saveProgress = async (nextStepNum: number, finalSubmit = false) => {
    if (!profile?.id) return false;
    setLoading(true);
    console.log('[saveProgress] Calling API | current_step:', nextStepNum, '| finalSubmit:', finalSubmit);

    try {
      const res = await fetch('/api/worker/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_step: nextStepNum,
          full_name: formData.fullName,
          gender: formData.gender || undefined,
          dob: formData.dob || undefined,
          selfie_url: formData.selfieUrl || undefined,
          bio: formData.bio || undefined,
          city_id: formData.cityId || undefined,
          address: formData.address || undefined,
          working_areas: formData.workingAreas ? formData.workingAreas.split(",").map(s => s.trim()) : undefined,
          service_category: formData.serviceCategory || undefined,
          experience: formData.experience || undefined,
          skills: formData.skills ? formData.skills.split(",").map(s => s.trim()) : undefined,
          languages: formData.languages ? formData.languages.split(",").map(s => s.trim()) : undefined,
          id_proof_type: formData.idProofType || undefined,
          id_proof_url: formData.idProofUrl || undefined,
          aadhaar_number: formData.aadhaar || undefined,
          pan_number: formData.pan || undefined,
          bank_holder_name: formData.bankHolder || undefined,
          bank_account_number: formData.bankAccount || undefined,
          ifsc_code: formData.ifsc || undefined,
          upi_id: formData.upi || undefined,
          complete: finalSubmit
        }),
      });

      const json = await res.json();
      console.log('[saveProgress] API response | status:', res.status, '| ok:', res.ok, '| body:', json);
      if (!res.ok) throw new Error(json.error || json.message || "Failed to save progress");

      return true;
    } catch (err: any) {
      console.error('[saveProgress] API call failed:', err.message);
      toast.error(err.message || "Failed to save progress");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const nextStep = async (e: React.FormEvent) => {
    e.preventDefault();

    // Custom validations based on step
    if (step === 2 && !formData.bio?.trim()) {
      return toast.error("Bio is required.");
    }
    if (step === 5) {
      console.log('[KYC Submit] Validating step 5 | idProofUrl:', formData.idProofUrl, '| idProofType:', formData.idProofType);
      if (!formData.idProofUrl) return toast.error("ID proof upload is required.");
      if (formData.idProofType === 'Aadhaar' && !formData.aadhaar) return toast.error("Aadhaar Number is required.");
      if (formData.idProofType === 'PAN' && !formData.pan) return toast.error("PAN Card Number is required.");
      console.log('[KYC Submit] Validation passed. Calling saveProgress(6).');
    }

    const nextStepNum = Math.min(step + 1, 6);
    console.log('[nextStep] Current step:', step, '→ nextStepNum:', nextStepNum);
    const success = await saveProgress(nextStepNum);
    console.log('[nextStep] saveProgress result:', success, '| nextStepNum:', nextStepNum);
    if (success) {
      console.log('[nextStep] setStep →', nextStepNum, '| Payout form will render:', nextStepNum === 6);
      setStep(nextStepNum);
      toast.success("Progress saved.");
    } else {
      console.error('[nextStep] saveProgress returned false — step NOT advanced. Check API response above.');
    }
  };

  const submitOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.bankHolder || !formData.bankAccount || !formData.ifsc) {
      return toast.error("Please fill in bank payout details.");
    }

    const success = await saveProgress(6, true);
    if (success) {
      toast.success("Application submitted successfully!");
      router.push('/partner/application-under-review');
    }
  };

  if (initLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600 h-10 w-10" />
          <p className="text-gray-500 font-bold text-sm">Resuming onboarding details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 flex-col md:flex-row">
      {/* Sidebar Progress Tracker */}
      <div className="w-full md:w-80 bg-blue-900 text-white p-8 flex-shrink-0">
        <h2 className="text-2xl font-black mb-10 tracking-tight">Zolvo Partner</h2>
        
        <div className="space-y-8">
          {[
            { num: 1, title: "Personal Details", icon: UserCircle },
            { num: 2, title: "Photo & Bio", icon: Camera },
            { num: 3, title: "Location Details", icon: Map },
            { num: 4, title: "Profession", icon: Briefcase },
            { num: 5, title: "KYC Verification", icon: Shield },
            { num: 6, title: "Payout Details", icon: CreditCard }
          ].map((s) => {
            const isActive = step === s.num;
            const isCompleted = step > s.num;
            return (
              <div key={s.num} className={`flex items-center gap-4 ${isActive ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold transition-all ${isCompleted ? 'bg-emerald-500 text-white' : isActive ? 'bg-white text-blue-900 scale-110 shadow-lg' : 'bg-white/10 text-white'}`}>
                  {isCompleted ? <CheckCircle2 size={20} /> : <s.icon size={18} />}
                </div>
                <span className={`font-bold ${isActive ? 'text-white' : 'text-white/60'}`}>{s.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Content Area */}
      <div className="flex-1 p-6 md:p-12 overflow-y-auto flex justify-center items-center">
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl p-8 md:p-12 border border-gray-100">
          
          {step === 1 && (
            <form onSubmit={nextStep} className="space-y-6">
              <h1 className="text-3xl font-black text-gray-900 mb-8">Personal Details</h1>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Full Legal Name *</label>
                <input required type="text" value={formData.fullName} onChange={e => updateForm('fullName', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-3 bg-gray-50 focus:bg-white transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Registered Mobile *</label>
                <input readOnly disabled type="text" value={formData.mobile} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-100 text-gray-400 font-semibold cursor-not-allowed" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Gender *</label>
                  <select required value={formData.gender} onChange={e => updateForm('gender', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-3 bg-gray-50 focus:bg-white">
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Date of Birth *</label>
                  <input required type="date" value={formData.dob} onChange={e => updateForm('dob', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-3 bg-gray-50 focus:bg-white" />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl mt-8 shadow-lg transition-all flex items-center justify-center">
                {loading ? <Loader2 className="animate-spin mr-2" /> : "Save & Next Step"} <ChevronRight className="ml-2 h-5 w-5"/>
              </Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={nextStep} className="space-y-6">
              <h1 className="text-3xl font-black text-gray-900 mb-8">Photo & Bio</h1>
              
              {/* Profile Photo Upload */}
              <div className="flex flex-col items-center gap-4 bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-300">
                <p className="text-sm font-bold text-gray-700 text-center w-full">Profile Photo * (Max 5MB)</p>
                {formData.selfieUrl ? (
                  <div className="relative h-32 w-32 rounded-full overflow-hidden border-4 border-blue-500/25">
                    <img src={formData.selfieUrl} alt="Selfie Preview" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 border-4 border-gray-300">
                    <Camera size={40} />
                  </div>
                )}
                <label className="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg shadow-sm flex items-center gap-1.5 transition-all">
                  {selfieUploading ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <UploadCloud size={14} />}
                  {formData.selfieUrl ? "Change Photo" : "Upload Photo"}
                  <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'selfie')} className="hidden" />
                </label>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">About Me (Bio) *</label>
                <textarea required rows={4} placeholder="Tell customers about your professional values and skills..." value={formData.bio} onChange={e => updateForm('bio', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-3 bg-gray-50 focus:bg-white transition-colors resize-none" />
              </div>

              <div className="flex gap-4 mt-8">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="h-14 px-8 rounded-xl font-bold">Back</Button>
                <Button type="submit" disabled={loading} className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center">
                  {loading ? <Loader2 className="animate-spin mr-2" /> : "Save & Next Step"} <ChevronRight className="ml-2 h-5 w-5"/>
                </Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={nextStep} className="space-y-6">
              <h1 className="text-3xl font-black text-gray-900 mb-8">Location Details</h1>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">City *</label>
                <select required value={formData.cityId} onChange={e => updateForm('cityId', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-3 bg-gray-50 focus:bg-white">
                  <option value="">Select city...</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Work Address *</label>
                <textarea required rows={3} placeholder="Full address (house number, block, locality)" value={formData.address} onChange={e => updateForm('address', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-3 bg-gray-50 focus:bg-white transition-colors resize-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Working Areas (Comma separated Localities) *</label>
                <input required type="text" placeholder="Subhash Nagar, R.K. Colony, Pur Road" value={formData.workingAreas} onChange={e => updateForm('workingAreas', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50" />
              </div>
              
              <div className="flex gap-4 mt-8">
                <Button type="button" variant="outline" onClick={() => setStep(2)} className="h-14 px-8 rounded-xl font-bold">Back</Button>
                <Button type="submit" disabled={loading} className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center">
                  {loading ? <Loader2 className="animate-spin mr-2" /> : "Save & Next Step"} <ChevronRight className="ml-2 h-5 w-5"/>
                </Button>
              </div>
            </form>
          )}

          {step === 4 && (
            <form onSubmit={nextStep} className="space-y-6">
              <h1 className="text-3xl font-black text-gray-900 mb-8">Professional Expertise</h1>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Service Category *</label>
                <select required value={formData.serviceCategory} onChange={e => updateForm('serviceCategory', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50">
                  <option value="">Select core profession...</option>
                  <option value="Electrician">Electrician</option>
                  <option value="Plumber">Plumber</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Total Experience *</label>
                <input required type="text" placeholder="e.g. 5 Years" value={formData.experience} onChange={e => updateForm('experience', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Skills (Comma separated) *</label>
                <input required type="text" placeholder="Wiring, Fuse Box, Inverters" value={formData.skills} onChange={e => updateForm('skills', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Spoken Languages *</label>
                <input required type="text" placeholder="Hindi, English, Marwari" value={formData.languages} onChange={e => updateForm('languages', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50" />
              </div>
              
              <div className="flex gap-4 mt-8">
                <Button type="button" variant="outline" onClick={() => setStep(3)} className="h-14 px-8 rounded-xl font-bold">Back</Button>
                <Button type="submit" disabled={loading} className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center">
                  {loading ? <Loader2 className="animate-spin mr-2" /> : "Save & Next Step"} <ChevronRight className="ml-2 h-5 w-5"/>
                </Button>
              </div>
            </form>
          )}

          {step === 5 && (
            <form onSubmit={nextStep} className="space-y-6">
              <h1 className="text-3xl font-black text-gray-900 mb-8">Identity Verification</h1>
              <p className="text-xs text-gray-500 mb-6 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                To build safety and trust on Zolvo, please provide a valid government ID. Uploads are securely encrypted.
              </p>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ID Proof Type *</label>
                <select required value={formData.idProofType} onChange={e => updateForm('idProofType', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50 focus:bg-white">
                  <option value="Aadhaar">Aadhaar Card</option>
                  <option value="PAN">PAN Card</option>
                  <option value="Voter ID">Voter ID</option>
                  <option value="Driving License">Driving License</option>
                </select>
              </div>

              {formData.idProofType === 'Aadhaar' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Aadhaar Number *</label>
                  <input required type="text" placeholder="1234 5678 9012" value={formData.aadhaar} onChange={e => updateForm('aadhaar', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50" />
                </div>
              )}

              {formData.idProofType === 'PAN' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">PAN Card Number *</label>
                  <input required type="text" placeholder="ABCDE1234F" value={formData.pan} onChange={e => updateForm('pan', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50 uppercase" />
                </div>
              )}

              {/* ID Proof File Upload */}
              <div className="flex flex-col items-center gap-4 bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-300">
                <p className="text-sm font-bold text-gray-700 text-center w-full">ID Proof Document * (PDF or Image, Max 5MB)</p>
                {formData.idProofUrl ? (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 w-full text-center justify-center font-bold text-xs">
                    <FileText size={16} /> ID Document Registered
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 border-2 border-gray-300">
                    <UploadCloud size={24} />
                  </div>
                )}
                <label className="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg shadow-sm flex items-center gap-1.5 transition-all">
                  {idProofUploading ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <UploadCloud size={14} />}
                  {formData.idProofUrl ? "Change Document" : "Upload Document"}
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => handleFileUpload(e, 'id_proof')} className="hidden" />
                </label>
              </div>

              <div className="flex gap-4 mt-8">
                <Button type="button" variant="outline" onClick={() => setStep(4)} className="h-14 px-8 rounded-xl font-bold">Back</Button>
                <Button type="submit" disabled={loading} className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center">
                  {loading ? <Loader2 className="animate-spin mr-2" /> : "Save & Next Step"} <ChevronRight className="ml-2 h-5 w-5"/>
                </Button>
              </div>
            </form>
          )}

          {step === 6 && (
            <form onSubmit={submitOnboarding} className="space-y-6">
              <h1 className="text-3xl font-black text-gray-900 mb-8">Payout Details</h1>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Bank Account Holder Name *</label>
                <input required type="text" value={formData.bankHolder} onChange={e => updateForm('bankHolder', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50 focus:bg-white" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Bank Account Number *</label>
                <input required type="password" value={formData.bankAccount} onChange={e => updateForm('bankAccount', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50 focus:bg-white" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">IFSC Code *</label>
                <input required type="text" placeholder="HDFC0001234" value={formData.ifsc} onChange={e => updateForm('ifsc', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50 uppercase focus:bg-white" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">UPI ID (Optional)</label>
                <input type="text" placeholder="number@upi" value={formData.upi} onChange={e => updateForm('upi', e.target.value)} className="w-full rounded-xl border-gray-300 shadow-sm px-4 py-3 bg-gray-50 focus:bg-white" />
              </div>
              
              <div className="flex gap-4 mt-12">
                <Button type="button" variant="outline" onClick={() => setStep(5)} disabled={loading} className="h-14 px-8 rounded-xl font-bold">Back</Button>
                <Button type="submit" disabled={loading} className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center">
                  {loading ? <Loader2 className="animate-spin mr-2" /> : "Submit Application"} <CheckCircle2 className="ml-2 h-5 w-5"/>
                </Button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
