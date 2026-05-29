import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";

import { useAuth } from "@/lib/store";
import { ROLES } from "@/lib/roles";

export function Navbar() {
  const user = useAuth((s: { user: any }) => s.user);
  const roleRoute = user ? ROLES.find((r) => r.id === user.role)?.route ?? "/login" : "/login";

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed top-0 inset-x-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-6 mt-4">
        <div className="glass-dark rounded-2xl px-5 py-3 flex items-center justify-between text-white">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)]">
              <Activity className="size-5" strokeWidth={2.5} />
            </span>
            2KC <span className="text-white/60 font-normal text-sm hidden sm:inline">· Centre de Santé</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-white/80">
            <a href="#services" className="hover:text-white transition">Services</a>
            <a href="#about" className="hover:text-white transition">À propos</a>
            <a href="#team" className="hover:text-white transition">Équipe</a>
            <a href="#contact" className="hover:text-white transition">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to={roleRoute}
              className="rounded-xl border border-white/20 text-white hover:bg-white/10 px-4 py-2 text-sm font-semibold transition"
            >
              Connexion
            </Link>
            <Link
              to={roleRoute}
              className="rounded-xl bg-[color:var(--mint)] text-[color:var(--navy)] px-4 py-2 text-sm font-semibold hover:brightness-110 transition shadow-mint"
            >
              S'inscrire
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
