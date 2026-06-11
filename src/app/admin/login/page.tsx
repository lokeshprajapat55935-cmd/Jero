"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, Mail, ArrowRight, ShieldCheck, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services/auth";
import { useToast } from "@/hooks/use-toast";
import { ROUTES } from "@/lib/constants";
import { adminLoginSchema, formatZodError } from "@/lib/auth/validation";
import { useUser } from "@/providers/UserProvider";
import { AuthLoading } from "@/components/auth/AuthLoading";
import Link from "next/link";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { user, profile, loading: authLoading } = useUser();

  useEffect(() => {
    if (authLoading || !user) return;
    if (profile?.role === "admin") {
      router.replace("/admin");
    } else if (profile?.role) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "You do not have administrative privileges.",
      });
      router.replace(ROUTES.HOME);
    }
  }, [authLoading, user, profile, router, toast]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = adminLoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast({
        variant: "destructive",
        title: "Invalid credentials",
        description: formatZodError(parsed.error),
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await authService.signIn(parsed.data.email, parsed.data.password);
      if (error) throw error;

      toast({
        title: "Signed in",
        description: "Admin session verified.",
      });
      
      // Usually userProvider updates automatically and the useEffect will trigger,
      // but we can explicitly redirect here just in case.
      router.replace("/admin");
      router.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Admin login failed",
        description: error.message || "Invalid email or password.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || (user && profile?.role === "admin")) {
    return <AuthLoading label="Verifying admin credentials..." className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-rose-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] h-[400px] w-[400px] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

      <main className="mx-auto flex w-full max-w-md flex-col px-6 py-10 relative z-10 flex-1 justify-center">
        
        <Link href={ROUTES.AUTH.LOGIN} className="absolute top-8 left-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center flex flex-col items-center mt-8"
        >
          <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-white/10 shadow-xl shadow-rose-500/10">
            <Lock className="h-7 w-7 text-rose-500" />
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-2">
            Admin Portal
          </h1>
          <p className="text-sm font-medium text-slate-400 max-w-[280px]">
            Restricted area. Please sign in with your administrative credentials.
          </p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          onSubmit={handleAdminLogin}
          className="bg-white/5 backdrop-blur-xl rounded-[24px] p-6 shadow-2xl border border-white/10"
        >
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Admin Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                <Input
                  type="email"
                  placeholder="admin@zolvo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-14 rounded-xl border border-white/10 bg-black/20 pl-12 pr-4 font-semibold text-white outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 transition-all placeholder:text-slate-600"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Password</label>
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-14 rounded-xl border border-white/10 bg-black/20 pl-12 pr-4 font-semibold text-white outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 transition-all placeholder:text-slate-600"
                  required
                />
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={isLoading}
            isLoading={isLoading} 
            className="h-14 w-full rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-600/20 active:scale-[0.98] transition-all"
          >
            Authenticate <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </motion.form>
      </main>
    </div>
  );
}
