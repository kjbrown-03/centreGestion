import { Link } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Languages, Menu, X } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/lib/store";
import { ROLES } from "@/lib/roles";
import { homeText, useI18n } from "@/lib/i18n";

export function Navbar() {
  const user = useAuth((s: { user: any }) => s.user);
  const roleRoute = user ? ROLES.find((r) => r.id === user.role)?.route ?? "/login" : "/login";
  const lang = useI18n((s) => s.lang);
  const toggleLang = useI18n((s) => s.toggleLang);
  const path = useRouterState({ select: (s: any) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const t = homeText[lang];
  const anchor = (id: string) => (path === "/" ? `#${id}` : `/#${id}`);

  const links = [
    { href: anchor("services"), label: t.navServices },
    { href: "/centre", label: t.navAbout },
    { href: anchor("team"), label: t.navTeam },
    { href: anchor("contact"), label: t.navContact },
  ];

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed top-0 inset-x-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-3 sm:px-6 mt-3 sm:mt-4">
        <div className="glass-dark rounded-2xl px-3 sm:px-5 py-3 flex items-center justify-between gap-2 text-white">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-display font-bold text-lg">
            <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)] shrink-0">
              <Activity className="size-5" strokeWidth={2.5} />
            </span>
            <span className="truncate">2KC</span>
            <span className="text-white/60 font-normal text-sm hidden lg:inline">- Centre de Sante</span>
          </Link>

          <nav className="hidden md:flex items-center gap-5 lg:gap-7 text-sm text-white/80">
            {links.map((link) =>
              link.href.startsWith("/") ? (
                <Link key={link.href} to={link.href} className="hover:text-white transition">
                  {link.label}
                </Link>
              ) : (
                <a key={link.href} href={link.href} className="hover:text-white transition">
                  {link.label}
                </a>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLang}
              className="size-10 rounded-xl border border-white/20 grid place-items-center hover:bg-white/10"
              aria-label="Changer la langue"
              title={lang === "fr" ? "English" : "Francais"}
            >
              <Languages className="size-4" />
            </button>
            <Link
              to={roleRoute}
              className="hidden sm:inline-flex rounded-xl border border-white/20 text-white hover:bg-white/10 px-4 py-2 text-sm font-semibold transition"
            >
              {t.login}
            </Link>
            <Link
              to={roleRoute}
              className="hidden sm:inline-flex rounded-xl bg-[color:var(--mint)] text-[color:var(--navy)] px-4 py-2 text-sm font-semibold hover:brightness-110 transition shadow-mint"
            >
              {t.signup}
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="md:hidden size-10 rounded-xl border border-white/20 grid place-items-center"
              aria-label="Ouvrir le menu"
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="md:hidden mt-2 rounded-2xl glass-dark p-3 text-white"
            >
              <div className="grid gap-1">
                {links.map((link) =>
                  link.href.startsWith("/") ? (
                    <Link key={link.href} to={link.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm hover:bg-white/10">
                      {link.label}
                    </Link>
                  ) : (
                    <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm hover:bg-white/10">
                      {link.label}
                    </a>
                  ),
                )}
                <Link to={roleRoute} onClick={() => setOpen(false)} className="mt-1 rounded-xl bg-[color:var(--mint)] px-3 py-2 text-sm font-semibold text-[color:var(--navy)]">
                  {t.login} / {t.signup}
                </Link>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}
