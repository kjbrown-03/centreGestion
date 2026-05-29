import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useAuditLog, type Role } from "@/lib/store";
import { ROLES } from "@/lib/roles";
import { getSupabaseAsync } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, ArrowRight, ShieldCheck, Mail, Lock, User, Info, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: Login,
});

// Credentials mapping
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

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginRole, setLoginRole] = useState<Role>("patient");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  
  // Registration state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState<Role>("patient");
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regSex, setRegSex] = useState("");
  const [regBirthDate, setRegBirthDate] = useState("");
  const [regBlood, setRegBlood] = useState("");

  const REGISTER_ROLES = useMemo(() => ROLES.filter((r) => r.id === "patient"), []);
  
  const [showHelper, setShowHelper] = useState(false);
  const login = useAuth((s: { login: (u: any) => void }) => s.login);
  const recordLoginFailure = useAuth(
    (s: { recordLoginFailure: (email: string) => { attempts: number; lockedUntil: number | null } }) =>
      s.recordLoginFailure
  );
  const clearLoginFailures = useAuth((s: { clearLoginFailures: (email: string) => void }) => s.clearLoginFailures);
  const isLocked = useAuth((s: { isLocked: (email: string) => { locked: boolean; until: number | null } }) => s.isLocked);
  const auditAdd = useAuditLog((s: { add: (e: any) => void }) => s.add);
  const navigate = useNavigate();

  async function hydrateProfileAndRedirect(cleanEmail: string, expectedRole?: Role) {
    const supabase = await getSupabaseAsync();

    const authUser = (await supabase.auth.getUser()).data.user;
    if (!authUser?.id) {
      throw new Error("Session introuvable. Vérifiez votre e-mail si une confirmation est requise.");
    }

    const { data: profile, error } = await supabase
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
      auditAdd({
        actorEmail: cleanEmail,
        actorRole: null,
        action: "auth.locked",
        target: cleanEmail,
        meta: { until: lock.until },
      });
      const mins = lock.until ? Math.max(1, Math.ceil((lock.until - Date.now()) / 60000)) : 5;
      toast.error(`Compte temporairement bloqué. Réessayez dans ${mins} min.`);
      return;
    }
    
    setLoading(true);
    try {
      const supabase = await getSupabaseAsync();

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!error) {
        clearLoginFailures(cleanEmail);
        await hydrateProfileAndRedirect(cleanEmail, loginRole);
        return;
      }

      if (CREDENTIALS[cleanEmail]) {
        const match = CREDENTIALS[cleanEmail];
        if (match.role !== loginRole) {
          toast.error("Ce compte de démo n'appartient pas au rôle sélectionné.");
          return;
        }
        const expectedPassword = cleanEmail.split("@")[0] + "123";
        if (password !== expectedPassword) {
          const { attempts, lockedUntil } = recordLoginFailure(cleanEmail);
          auditAdd({
            actorEmail: cleanEmail,
            actorRole: null,
            action: "auth.login_failed",
            target: cleanEmail,
            meta: { attempts, lockedUntil },
          });
          if (lockedUntil) {
            auditAdd({
              actorEmail: cleanEmail,
              actorRole: null,
              action: "auth.locked",
              target: cleanEmail,
              meta: { until: lockedUntil },
            });
            toast.error("Trop de tentatives. Compte bloqué 5 minutes.");
          } else {
            toast.error(`Mot de passe incorrect. Tentatives: ${attempts}/3`);
          }
          return;
        }

        clearLoginFailures(cleanEmail);
        login({ name: match.name, email: cleanEmail, role: match.role });
        auditAdd({ actorEmail: cleanEmail, actorRole: match.role, action: "auth.login", target: cleanEmail, meta: { mode: "demo" } });
        const roleObj = ROLES.find((r) => r.id === match.role)!;
        toast.success(`Ravi de vous revoir, ${match.name} !`);
        navigate({ to: roleObj.route });
        return;
      }

      toast.error(error.message ?? "Connexion impossible.");
    } catch (err: any) {
      toast.error(err?.message ?? "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      toast.error("Veuillez remplir tous les champs d'inscription.");
      return;
    }

    if (regRole === "admin") {
      toast.error("Vous ne pouvez pas vous inscrire en tant qu'administrateur.");
      return;
    }

    const cleanEmail = regEmail.trim().toLowerCase();

    // Prevent registering with professional domains
    if (cleanEmail.endsWith("@2kc.fr")) {
      toast.error("Cette adresse e-mail est réservée aux praticiens.");
      return;
    }

    if (regRole === "patient") {
      if (!regFirstName.trim() || !regLastName.trim()) {
        toast.error("Renseignez votre prénom et votre nom.");
        return;
      }
      if (!regSex) {
        toast.error("Sélectionnez votre sexe (M/F).");
        return;
      }
      if (!regBirthDate) {
        toast.error("Saisissez votre date de naissance.");
        return;
      }
      if (!regBlood) {
        toast.error("Sélectionnez votre groupe sanguin.");
        return;
      }
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
            first_name: (regFirstName || regName.split(" ")[0] || "").trim() || null,
            last_name: (regLastName || regName.split(" ").slice(1).join(" ") || "").trim() || null,
            sex: regSex || null,
            birth_date: regBirthDate || null,
            blood_type: regBlood || null,
          },
        },
      });

      if (error) throw error;

      if (!data.session) {
        toast.success("Compte créé. Vérifiez votre e-mail (confirmation) puis connectez-vous.");
        return;
      }

      toast.success("Compte créé. Connexion en cours...");
      await hydrateProfileAndRedirect(cleanEmail, regRole);
    } catch (err: any) {
      toast.error(err?.message ?? "Inscription impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left — visual */}
      <div className="hidden lg:flex relative overflow-hidden gradient-hero text-white p-12 flex-col justify-between">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <motion.div animate={{ y: [0, -16, 0] }} transition={{ duration: 8, repeat: Infinity }} className="absolute top-32 right-16 size-64 rounded-full bg-[color:var(--mint)]/25 blur-3xl" />
        <motion.div animate={{ y: [0, 18, 0] }} transition={{ duration: 10, repeat: Infinity }} className="absolute bottom-24 left-12 size-80 rounded-full bg-sky-400/20 blur-3xl" />

        <Link to="/" className="relative flex items-center gap-2 font-display font-bold text-xl">
          <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)]">
            <Activity className="size-5" strokeWidth={2.5} />
          </span>
          2KC
        </Link>

        <div className="relative">
          <h1 className="font-display text-5xl xl:text-6xl font-bold leading-tight">
            Votre santé en toute <span className="text-gradient-mint">simplicité</span>.
          </h1>
          <p className="mt-5 text-white/70 max-w-md text-lg leading-relaxed">
            Accédez à vos ordonnances, prenez vos rendez-vous en ligne, ou pilotez le centre en quelques clics.
          </p>
        </div>

        <div className="relative flex items-center gap-3 text-sm text-white/60">
          <ShieldCheck className="size-4 text-[color:var(--mint)]" />
          Session sécurisée · Données cryptées conformes HDS
        </div>
      </div>

      {/* Right — forms */}
      <div className="flex flex-col justify-center p-6 sm:p-12 relative">
        <div className="w-full max-w-md mx-auto">
          <Link to="/" className="lg:hidden flex items-center gap-2 font-display font-bold text-xl text-[color:var(--navy)] mb-8">
            <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)]">
              <Activity className="size-5" strokeWidth={2.5} />
            </span>
            2KC
          </Link>

          <Tabs defaultValue="login" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-2xl">
              <TabsTrigger value="login" className="rounded-xl font-semibold">Connexion</TabsTrigger>
              <TabsTrigger value="register" className="rounded-xl font-semibold">Inscription</TabsTrigger>
            </TabsList>

            {/* CONNEXION TAB */}
            <TabsContent value="login" className="outline-none">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-[color:var(--navy)]">Espace Personnel</h2>
                <p className="mt-2 text-sm text-muted-foreground">Saisissez vos identifiants pour accéder à votre espace de soins.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Rôle</label>
                  <select
                    value={loginRole}
                    onChange={(e) => setLoginRole(e.target.value as Role)}
                    className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                  >
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
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

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border bg-card pl-11 pr-11 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showLoginPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showLoginPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <div className="mt-2 text-right">
                    <Link
                      to="/forgot-password"
                      className="text-xs font-semibold text-[color:var(--navy)]/80 hover:text-[color:var(--navy)] underline underline-offset-4"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-4 shadow-mint hover:brightness-110 transition"
                >
                  Se connecter <ArrowRight className="size-4" />
                </motion.button>
              </form>
            </TabsContent>

            {/* INSCRIPTION TAB */}
            <TabsContent value="register" className="outline-none">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-[color:var(--navy)]">Créer mon espace</h2>
                <p className="mt-2 text-sm text-muted-foreground">Inscrivez-vous en tant que patient pour suivre vos soins.</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Rôle</label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as Role)}
                    className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                  >
                    {REGISTER_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {regRole === "patient" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Prénom</label>
                      <input
                        type="text"
                        value={regFirstName}
                        onChange={(e) => setRegFirstName(e.target.value)}
                        placeholder="Pierre"
                        className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Nom</label>
                      <input
                        type="text"
                        value={regLastName}
                        onChange={(e) => setRegLastName(e.target.value)}
                        placeholder="Durand"
                        className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Sexe</label>
                      <select
                        value={regSex}
                        onChange={(e) => setRegSex(e.target.value)}
                        className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                        required
                      >
                        <option value="">— Sélectionner —</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Date de naissance</label>
                      <input
                        type="date"
                        value={regBirthDate}
                        onChange={(e) => setRegBirthDate(e.target.value)}
                        className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                        required
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Groupe sanguin</label>
                      <select
                        value={regBlood}
                        onChange={(e) => setRegBlood(e.target.value)}
                        className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                        required
                      >
                        <option value="">— Sélectionner —</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Nom complet</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Pierre Durand"
                      className="w-full rounded-2xl border bg-card pl-11 pr-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Adresse e-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="nom@exemple.com"
                      className="w-full rounded-2xl border bg-card pl-11 pr-4 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type={showRegPassword ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Créer un mot de passe"
                      className="w-full rounded-2xl border bg-card pl-11 pr-11 py-3.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showRegPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showRegPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-4 shadow-mint hover:brightness-110 transition"
                >
                  S'inscrire et se connecter <ArrowRight className="size-4" />
                </motion.button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Premium Demo Credentials Panel */}
          <div className="mt-8 pt-6 border-t border-border/60">
            <button
              onClick={() => setShowHelper(!showHelper)}
              className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-[color:var(--navy)] transition"
            >
              <Info className="size-3.5 text-[color:var(--mint)]" />
              <span>Afficher les comptes de démonstration (Médecin, Admin...)</span>
            </button>

            <AnimatePresence>
              {showHelper && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-3 rounded-2xl bg-muted/40 border p-4 text-xs space-y-3"
                >
                  <p className="font-semibold text-[color:var(--navy)]">Comptes de démo inclus dans le code :</p>
                  <div className="grid sm:grid-cols-2 gap-3 font-mono text-[10px]">
                    <div className="p-2.5 rounded-xl border bg-card hover:border-[color:var(--mint)]/30 transition cursor-pointer" onClick={() => { setEmail("patient@2kc.fr"); setPassword("patient123"); }}>
                      <p className="font-bold text-[color:var(--navy)]">Patient (Pierre)</p>
                      <p className="mt-1 text-muted-foreground">patient@2kc.fr</p>
                      <p className="text-muted-foreground">Mdp : patient123</p>
                    </div>
                    <div className="p-2.5 rounded-xl border bg-card hover:border-[color:var(--mint)]/30 transition cursor-pointer" onClick={() => { setEmail("medecin@2kc.fr"); setPassword("medecin123"); }}>
                      <p className="font-bold text-[color:var(--navy)]">Médecin (Dr. Cissé)</p>
                      <p className="mt-1 text-muted-foreground">medecin@2kc.fr</p>
                      <p className="text-muted-foreground">Mdp : medecin123</p>
                    </div>
                    <div className="p-2.5 rounded-xl border bg-card hover:border-[color:var(--mint)]/30 transition cursor-pointer" onClick={() => { setEmail("infirmier@2kc.fr"); setPassword("infirmier123"); }}>
                      <p className="font-bold text-[color:var(--navy)]">Infirmier (Nadia)</p>
                      <p className="mt-1 text-muted-foreground">infirmier@2kc.fr</p>
                      <p className="text-muted-foreground">Mdp : infirmier123</p>
                    </div>
                    <div className="p-2.5 rounded-xl border bg-card hover:border-[color:var(--mint)]/30 transition cursor-pointer" onClick={() => { setEmail("secretaire@2kc.fr"); setPassword("secretaire123"); }}>
                      <p className="font-bold text-[color:var(--navy)]">Secrétaire</p>
                      <p className="mt-1 text-muted-foreground">secretaire@2kc.fr</p>
                      <p className="text-muted-foreground">Mdp : secretaire123</p>
                    </div>
                    <div className="p-2.5 rounded-xl border bg-card hover:border-[color:var(--mint)]/30 transition cursor-pointer sm:col-span-2" onClick={() => { setEmail("admin@2kc.fr"); setPassword("admin123"); }}>
                      <p className="font-bold text-[color:var(--navy)]">Administrateur</p>
                      <p className="mt-1 text-muted-foreground">admin@2kc.fr</p>
                      <p className="text-muted-foreground">Mdp : admin123</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">💡 Astuce : Cliquez sur un bloc ci-dessus pour pré-remplir les champs !</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
