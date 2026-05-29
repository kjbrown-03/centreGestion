import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Activity, ArrowRight, Mail, Lock, Eye, EyeOff } from "lucide-react";

import { getSupabaseAsync } from "@/lib/supabase";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});

function ForgotPassword() {
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const navigate = useNavigate();

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setLoading(true);
    try {
      const supabase = await getSupabaseAsync();
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: false,
        },
      });
      if (error) throw error;

      toast.success("Code OTP envoyé par e-mail.");
      setOtp("");
      setNewPassword("");
      setOtpVerified(false);
      setStep("verify");
    } catch (err: any) {
      const msg = (err?.message as string | undefined) ?? "Impossible d'envoyer le code OTP.";
      if (msg.toLowerCase().includes("signup") || msg.toLowerCase().includes("create")) {
        toast.error("Cet e-mail n'existe pas dans la base. Veuillez vous inscrire d'abord.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtpCode(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const token = otp.trim();
    if (!cleanEmail || !token) return;

    setVerifyingOtp(true);
    try {
      const supabase = await getSupabaseAsync();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token,
        type: "email",
      });
      if (verifyError) throw verifyError;

      setOtpVerified(true);
      toast.success("OTP vérifié. Vous pouvez maintenant changer votre mot de passe.");
    } catch (err: any) {
      setOtpVerified(false);
      toast.error(err?.message ?? "OTP invalide ou expiré.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const token = otp.trim();
    if (!cleanEmail || !token || !newPassword.trim()) return;
    if (!otpVerified) {
      toast.error("Veuillez d'abord vérifier le code OTP.");
      return;
    }

    setLoading(true);
    try {
      const supabase = await getSupabaseAsync();

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      toast.success("Mot de passe modifié avec succès.");
      navigate({ to: "/login" });
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de modifier le mot de passe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative overflow-hidden gradient-hero text-white p-12 flex-col justify-between">
        <motion.div
          animate={{ y: [0, -16, 0] }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute top-32 right-16 size-64 rounded-full bg-[color:var(--mint)]/25 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 18, 0] }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute bottom-24 left-12 size-80 rounded-full bg-sky-400/20 blur-3xl"
        />

        <Link to="/" className="relative flex items-center gap-2 font-display font-bold text-xl">
          <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)]">
            <Activity className="size-5" strokeWidth={2.5} />
          </span>
          2KC
        </Link>

        <div className="relative">
          <h1 className="font-display text-5xl xl:text-6xl font-bold leading-tight">
            Récupération par <span className="text-gradient-mint">OTP</span>
          </h1>
          <p className="mt-5 text-white/70 max-w-md text-lg leading-relaxed">
            Un code est envoyé sur votre e-mail. Vous pouvez ensuite définir un nouveau mot de passe.
          </p>
        </div>

        <div className="relative text-sm text-white/60">Cameroun · E-mail OTP (SMTP configuré sur Supabase)</div>
      </div>

      <div className="flex flex-col justify-center p-6 sm:p-12 relative">
        <div className="w-full max-w-md mx-auto">
          <Link
            to="/"
            className="lg:hidden flex items-center gap-2 font-display font-bold text-xl text-[color:var(--navy)] mb-8"
          >
            <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)]">
              <Activity className="size-5" strokeWidth={2.5} />
            </span>
            2KC
          </Link>

          {step === "request" ? (
            <>
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-[color:var(--navy)]">Mot de passe oublié</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Entrez votre e-mail pour recevoir un code OTP.
                </p>
              </div>

              <form onSubmit={requestOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Adresse e-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@exemple.com"
                      className="w-full rounded-2xl border bg-card pl-11 pr-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                      required
                    />
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  disabled={loading}
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-4 shadow-mint hover:brightness-110 transition disabled:opacity-60"
                >
                  Envoyer OTP <ArrowRight className="size-4" />
                </motion.button>

                <div className="text-sm text-muted-foreground text-center">
                  <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
                    Retour à la connexion
                  </Link>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-[color:var(--navy)]">Vérifier l’OTP</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Saisissez le code reçu, puis choisissez un nouveau mot de passe.
                </p>
              </div>

              <form onSubmit={verifyOtpCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Code OTP</label>
                  <input
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value);
                      setOtpVerified(false);
                    }}
                    inputMode="numeric"
                    placeholder="123456"
                    className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                    required
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  disabled={verifyingOtp}
                  className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-2xl border bg-card text-foreground font-semibold py-4 hover:bg-muted transition disabled:opacity-60"
                >
                  Vérifier l’OTP <ArrowRight className="size-4" />
                </motion.button>
              </form>

              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Nouveau mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border bg-card pl-11 pr-11 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition disabled:opacity-60"
                      required
                      disabled={!otpVerified}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      disabled={!otpVerified}
                    >
                      {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <form onSubmit={changePassword}>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    disabled={loading || !otpVerified}
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-4 shadow-mint hover:brightness-110 transition disabled:opacity-60"
                  >
                    Changer le mot de passe <ArrowRight className="size-4" />
                  </motion.button>
                </form>

                <div className="text-sm text-muted-foreground text-center">
                  <button
                    type="button"
                    onClick={() => setStep("request")}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Renvoyer un OTP
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
