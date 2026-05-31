import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, ArrowLeft, ArrowRight, Check, Eye, EyeOff, Info, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseAsync } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";
import { useAuth, useAuditLog, type Role } from "@/lib/store";
import { downloadCredentialsTxt } from "@/lib/credentials-file";

export const Route = createFileRoute("/login")({
  component: Login,
});

const CREDENTIALS: Record<string, { role: Role; name: string }> = {
  "admin@2kc.fr": { role: "admin", name: "Administrateur" },
  "medecin@2kc.fr": { role: "medecin", name: "Dr. Karim Cissé" },
  "infirmier@2kc.fr": { role: "infirmier", name: "Nadia Benali" },
  "secretaire@2kc.fr": { role: "secretaire", name: "Accueil Secrétariat" },
  "comptable@2kc.fr": { role: "comptable", name: "Service Comptabilité" },
  "pharmacien@2kc.fr": { role: "pharmacien", name: "Pharmacie 2KC" },
  "directeur@2kc.fr": { role: "directeur", name: "Direction" },
  "patient@2kc.fr": { role: "patient", name: "Pierre Durand" },
};

const inputClass =
  "w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20";
const inputWithIconClass =
  "w-full rounded-2xl border bg-card py-3.5 pl-11 pr-4 text-sm outline-none transition focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20";
const labelClass = "text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]";

function splitList(value: string) {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginRole, setLoginRole] = useState<Role>("patient");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regSex, setRegSex] = useState("");
  const [regBirthDate, setRegBirthDate] = useState("");
  const [regBlood, setRegBlood] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regAllergies, setRegAllergies] = useState("");
  const [regChronic, setRegChronic] = useState("");
  const [regEmergencyName, setRegEmergencyName] = useState("");
  const [regEmergencyPhone, setRegEmergencyPhone] = useState("");
  const [showHelper, setShowHelper] = useState(false);

  const login = useAuth((s: { login: (u: any) => void }) => s.login);
  const recordLoginFailure = useAuth(
    (s: { recordLoginFailure: (email: string) => { attempts: number; lockedUntil: number | null } }) =>
      s.recordLoginFailure,
  );
  const clearLoginFailures = useAuth((s: { clearLoginFailures: (email: string) => void }) => s.clearLoginFailures);
  const isLocked = useAuth((s: { isLocked: (email: string) => { locked: boolean; until: number | null } }) => s.isLocked);
  const auditAdd = useAuditLog((s: { add: (e: any) => void }) => s.add);
  const navigate = useNavigate();

  function fillDemo(emailValue: string, roleValue: Role) {
    setEmail(emailValue);
    setPassword(`${emailValue.split("@")[0]}123`);
    setLoginRole(roleValue);
  }

  async function hydrateProfileAndRedirect(cleanEmail: string, expectedRole?: Role) {
    const supabase = await getSupabaseAsync();
    const authUser = (await supabase.auth.getUser()).data.user;

    if (!authUser?.id) {
      throw new Error("Session introuvable. Vérifiez votre e-mail si une confirmation est requise.");
    }

    const { data: profile, error } = await (supabase as any)
      .schema("app")
      .from("profiles")
      .select("role, full_name")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (error) throw error;
    if (!profile?.role) {
      throw new Error("Profil utilisateur introuvable. Veuillez contacter l'administrateur.");
    }

    const role = profile.role as Role;
    if (expectedRole && role !== expectedRole) {
      throw new Error("Ce compte n'appartient pas au rôle sélectionné.");
    }

    const name = (profile.full_name as string) ?? cleanEmail.split("@")[0];
    login({ name, email: cleanEmail, role });
    auditAdd({
      actorEmail: cleanEmail,
      actorRole: role,
      action: "auth.login",
      target: cleanEmail,
      meta: { mode: "supabase" },
    });

    const roleObj = ROLES.find((r) => r.id === role);
    navigate({ to: roleObj?.route ?? "/" });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Veuillez saisir votre e-mail et votre mot de passe.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const lock = isLocked(cleanEmail);
    if (lock.locked) {
      const mins = lock.until ? Math.max(1, Math.ceil((lock.until - Date.now()) / 60000)) : 5;
      auditAdd({ actorEmail: cleanEmail, actorRole: null, action: "auth.locked", target: cleanEmail, meta: { until: lock.until } });
      toast.error(`Compte temporairement bloqué. Réessayez dans ${mins} min.`);
      return;
    }

    setLoading(true);
    try {
      const supabase = await getSupabaseAsync();
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });

      if (!error) {
        clearLoginFailures(cleanEmail);
        await hydrateProfileAndRedirect(cleanEmail, loginRole);
        return;
      }

      if (CREDENTIALS[cleanEmail]) {
        const match = CREDENTIALS[cleanEmail];
        if (match.role !== loginRole) {
          toast.error("Ce compte de démonstration n'appartient pas au rôle sélectionné.");
          return;
        }

        const expectedPassword = `${cleanEmail.split("@")[0]}123`;
        if (password !== expectedPassword) {
          const { attempts, lockedUntil } = recordLoginFailure(cleanEmail);
          auditAdd({
            actorEmail: cleanEmail,
            actorRole: null,
            action: "auth.login_failed",
            target: cleanEmail,
            meta: { attempts, lockedUntil },
          });
          toast.error(lockedUntil ? "Trop de tentatives. Compte bloqué 5 minutes." : `Mot de passe incorrect. Tentatives: ${attempts}/3`);
          return;
        }

        const ensured = await supabase.functions.invoke("ensure-demo-account", { body: { email: cleanEmail, password } });
        if (!ensured.error) {
          const retry = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
          if (!retry.error) {
            clearLoginFailures(cleanEmail);
            await hydrateProfileAndRedirect(cleanEmail, loginRole);
            toast.success(`Ravi de vous revoir, ${match.name} !`);
            return;
          }
          throw retry.error;
        }
        throw ensured.error;
      }

      const raw = error.message ?? "";
      if (raw.toLowerCase().includes("invalid login credentials") || raw.toLowerCase().includes("invalid credentials")) {
        const { attempts, lockedUntil } = recordLoginFailure(cleanEmail);
        toast.error(
          lockedUntil
            ? "Trop de tentatives. Compte bloqué 5 minutes."
            : `Identifiants incorrects. Vérifiez votre e-mail et mot de passe. Si ce compte a été créé par l'administrateur, demandez-lui de réinitialiser votre mot de passe. (${attempts}/3)`,
        );
      } else if (raw.toLowerCase().includes("email not confirmed")) {
        toast.error("Votre e-mail n'est pas confirmé. Vérifiez votre boîte mail ou contactez l'administrateur.");
      } else {
        toast.error(raw || "Connexion impossible. Contactez l'administrateur.");
      }
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.toLowerCase().includes("invalid login credentials")) {
        toast.error("Identifiants incorrects. Contactez l'administrateur pour réinitialiser votre mot de passe.");
      } else {
        toast.error(msg || "Connexion impossible.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const regRole: Role = "patient";

    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      toast.error("Veuillez remplir tous les champs d'inscription.");
      return;
    }
    if (!regFirstName.trim() || !regLastName.trim()) {
      toast.error("Renseignez votre prénom et votre nom.");
      return;
    }
    if (!regSex || !regBirthDate || !regBlood) {
      toast.error("Renseignez votre sexe, votre date de naissance et votre groupe sanguin.");
      return;
    }

    const cleanEmail = regEmail.trim().toLowerCase();
    if (cleanEmail.endsWith("@2kc.fr")) {
      toast.error("Cette adresse e-mail est réservée aux praticiens.");
      return;
    }

    setLoading(true);
    try {
      const supabase = await getSupabaseAsync();
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: regPassword,
        options: {
          data: {
            full_name: regName.trim(),
            role: regRole,
            first_name: regFirstName.trim(),
            last_name: regLastName.trim(),
            sex: regSex,
            birth_date: regBirthDate,
            blood_type: regBlood,
            phone: regPhone.trim() || null,
            address: regAddress.trim() || null,
            allergies: splitList(regAllergies),
            chronic_conditions: splitList(regChronic),
            emergency_contact_name: regEmergencyName.trim() || null,
            emergency_contact_phone: regEmergencyPhone.trim() || null,
          },
        },
      });

      if (error) throw error;
      downloadCredentialsTxt({
        email: cleanEmail,
        password: regPassword,
        role: regRole,
        fullName: regName.trim(),
        source: "inscription_patient",
      });

      if (!data.session) {
        toast.success("Compte créé. Le fichier d'identifiants a été téléchargé.");
        return;
      }

      toast.success("Compte créé. Fichier d'identifiants téléchargé. Connexion en cours...");
      await hydrateProfileAndRedirect(cleanEmail, regRole);
    } catch (err: any) {
      toast.error(err?.message ?? "Inscription impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid bg-background lg:grid-cols-2">
      <div className="hidden lg:flex relative overflow-hidden gradient-hero text-white p-12 flex-col justify-between">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }}
        />
        <motion.div animate={{ y: [0, -16, 0] }} transition={{ duration: 8, repeat: Infinity }} className="absolute right-16 top-32 size-64 rounded-full bg-[color:var(--mint)]/25 blur-3xl" />
        <motion.div animate={{ y: [0, 18, 0] }} transition={{ duration: 10, repeat: Infinity }} className="absolute bottom-24 left-12 size-80 rounded-full bg-sky-400/20 blur-3xl" />

        <Link to="/" className="relative flex items-center gap-2 font-display text-xl font-bold">
          <span className="grid size-9 place-items-center rounded-xl gradient-mint text-[color:var(--navy)]">
            <Activity className="size-5" strokeWidth={2.5} />
          </span>
          2KC
        </Link>

        <div className="relative">
          <h1 className="font-display text-5xl font-bold leading-tight xl:text-6xl">
            Votre santé, <span className="text-gradient-mint">Notre priorité</span>.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">
            Accédez à vos ordonnances, prenez vos rendez-vous en ligne, ou pilotez le centre en quelques clics.
          </p>
        </div>

        <div className="relative flex items-center gap-3 text-sm text-white/60">
          <ShieldCheck className="size-4 text-[color:var(--mint)]" />
          Session sécurisée · Données chiffrées conformes HDS
        </div>
      </div>

      <div className="relative flex flex-col justify-center p-6 sm:p-12">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]/80 hover:text-[color:var(--navy)]">
            <ArrowLeft className="size-4" />
            Retour à l'accueil
          </Link>

          <Link to="/" className="mb-8 flex items-center gap-2 font-display text-xl font-bold text-[color:var(--navy)] lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl gradient-mint text-[color:var(--navy)]">
              <Activity className="size-5" strokeWidth={2.5} />
            </span>
            2KC
          </Link>

          <Tabs defaultValue="login" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-muted/60 p-1">
              <TabsTrigger value="login" className="rounded-xl font-semibold">Connexion</TabsTrigger>
              <TabsTrigger value="register" className="rounded-xl font-semibold">Inscription</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="outline-none">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-[color:var(--navy)]">Espace personnel</h2>
                <p className="mt-2 text-sm text-muted-foreground">Saisissez vos identifiants pour accéder à votre espace de soins.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Rôle</label>
                  <select value={loginRole} onChange={(e) => setLoginRole(e.target.value as Role)} className={inputClass}>
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Adresse e-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.com" className={inputWithIconClass} required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <label className={labelClass}>Mot de passe</label>
                    <Link to="/forgot-password" className="text-xs font-semibold text-[color:var(--navy)]/70 hover:text-[color:var(--navy)]">
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Votre mot de passe"
                      className="w-full rounded-2xl border bg-card py-3.5 pl-11 pr-11 text-sm outline-none transition focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20"
                      required
                    />
                    <button type="button" onClick={() => setShowLoginPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showLoginPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                      {showLoginPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={loading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-mint py-4 font-semibold text-[color:var(--navy)] shadow-mint transition hover:brightness-110 disabled:opacity-60">
                  {loading ? "Connexion..." : "Se connecter"} <ArrowRight className="size-4" />
                </motion.button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="outline-none">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-[color:var(--navy)]">Inscription patient</h2>
                <p className="mt-2 text-sm text-muted-foreground">Ces informations remplissent directement votre dossier médical et vos cartes patient.</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm font-semibold text-[color:var(--navy)]">
                  Type de compte : patient
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Prénom</label>
                    <input value={regFirstName} onChange={(e) => setRegFirstName(e.target.value)} placeholder="Pierre" className={inputClass} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Nom</label>
                    <input value={regLastName} onChange={(e) => setRegLastName(e.target.value)} placeholder="Durand" className={inputClass} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Sexe</label>
                    <select value={regSex} onChange={(e) => setRegSex(e.target.value)} className={inputClass} required>
                      <option value="">Sélectionner</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Date de naissance</label>
                    <input type="date" value={regBirthDate} onChange={(e) => setRegBirthDate(e.target.value)} className={inputClass} required />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className={labelClass}>Groupe sanguin</label>
                    <select value={regBlood} onChange={(e) => setRegBlood(e.target.value)} className={inputClass} required>
                      <option value="">Sélectionner</option>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((blood) => (
                        <option key={blood} value={blood}>{blood}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className={labelClass}>Téléphone</label>
                    <input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="693904197" className={inputClass} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className={labelClass}>Adresse</label>
                    <input value={regAddress} onChange={(e) => setRegAddress(e.target.value)} placeholder="Douala" className={inputClass} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className={labelClass}>Allergies connues</label>
                    <input value={regAllergies} onChange={(e) => setRegAllergies(e.target.value)} placeholder="Ex : pénicilline, arachide" className={inputClass} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className={labelClass}>Antécédents médicaux</label>
                    <input value={regChronic} onChange={(e) => setRegChronic(e.target.value)} placeholder="Ex : asthme, hypertension" className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Contact urgence</label>
                    <input value={regEmergencyName} onChange={(e) => setRegEmergencyName(e.target.value)} placeholder="Nom" className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Téléphone urgence</label>
                    <input value={regEmergencyPhone} onChange={(e) => setRegEmergencyPhone(e.target.value)} placeholder="Téléphone" className={inputClass} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Nom complet</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Pierre Durand" className={inputWithIconClass} required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Adresse e-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="nom@exemple.com" className={inputWithIconClass} required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showRegPassword ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Créer un mot de passe"
                      className="w-full rounded-2xl border bg-card py-3.5 pl-11 pr-11 text-sm outline-none transition focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20"
                      required
                    />
                    <button type="button" onClick={() => setShowRegPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showRegPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                      {showRegPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={loading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-mint py-4 font-semibold text-[color:var(--navy)] shadow-mint transition hover:brightness-110 disabled:opacity-60">
                  {loading ? "Inscription..." : "S'inscrire et se connecter"} <ArrowRight className="size-4" />
                </motion.button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-8 border-t border-border/60 pt-6">
            <button onClick={() => setShowHelper(!showHelper)} className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-[color:var(--navy)]">
              <Info className="size-3.5 text-[color:var(--mint)]" />
              <span>Afficher les comptes de démonstration</span>
            </button>

            <AnimatePresence>
              {showHelper && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 overflow-hidden rounded-2xl border bg-muted/40 p-4 text-xs">
                  <p className="font-semibold text-[color:var(--navy)]">Comptes de démonstration inclus dans le code :</p>
                  <div className="mt-3 grid gap-3 font-mono text-[10px] sm:grid-cols-2">
                    {Object.entries(CREDENTIALS).map(([mail, user]) => (
                      <button key={mail} type="button" onClick={() => fillDemo(mail, user.role)} className="rounded-xl border bg-card p-2.5 text-left transition hover:border-[color:var(--mint)]/30">
                        <p className="font-bold text-[color:var(--navy)]">{ROLES.find((r) => r.id === user.role)?.label ?? user.role}</p>
                        <p className="mt-1 text-muted-foreground">{mail}</p>
                        <p className="text-muted-foreground">Mdp : {mail.split("@")[0]}123</p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Check className="size-3 text-[color:var(--mint)]" />
                    Cliquez sur un compte pour pré-remplir la connexion.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
