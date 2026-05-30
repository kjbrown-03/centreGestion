import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play, ShieldCheck } from "lucide-react";
import { homeText, useI18n } from "@/lib/i18n";

const VIDEO_SRC = "https://videos.pexels.com/video-files/4225862/4225862-uhd_2560_1440_25fps.mp4";
const POSTER = "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1920&q=80";

export function Hero() {
  const lang = useI18n((s) => s.lang);
  const t = homeText[lang];
  const headline = [t.h1a, t.h1b, t.h1c];

  return (
    <section className="relative min-h-screen overflow-hidden text-white">
      <video className="absolute inset-0 size-full object-cover" src={VIDEO_SRC} poster={POSTER} autoPlay muted loop playsInline />
      <div className="absolute inset-0 gradient-hero opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--navy)] via-transparent to-transparent" />
      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 pt-36 sm:pt-40 pb-24 min-h-screen flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="inline-flex items-center gap-2 self-start rounded-full glass-dark px-4 py-1.5 text-xs font-medium text-white/90 mb-8"
        >
          <ShieldCheck className="size-3.5 text-[color:var(--mint)]" />
          {t.badge}
        </motion.div>

        <h1 className="font-display font-bold text-5xl sm:text-7xl md:text-8xl leading-[0.95] max-w-5xl">
          {headline.map((word, i) => (
            <motion.span
              key={word}
              initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, delay: 0.4 + i * 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="block"
            >
              {i === 2 ? <span className="text-gradient-mint">{word}</span> : word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.1 }}
          className="mt-8 max-w-xl text-lg text-white/75 leading-relaxed"
        >
          {t.heroCopy}
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 1.3 }} className="mt-10 flex flex-wrap items-center gap-4">
          <Link to="/login" className="group inline-flex items-center gap-2 rounded-2xl bg-[color:var(--mint)] text-[color:var(--navy)] px-6 py-3.5 font-semibold shadow-mint hover:brightness-110 transition">
            {t.cta}
            <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Link>
          <Link to="/centre" className="inline-flex items-center gap-2 rounded-2xl glass-dark text-white px-6 py-3.5 font-medium hover:bg-white/15 transition">
            <Play className="size-4" /> {t.discover}
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.8 }} className="mt-14 sm:mt-16 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
          <span>{t.patients}</span>
          <span className="hidden sm:inline">-</span>
          <span>{t.care}</span>
          <span className="hidden sm:inline">-</span>
          <span>{t.open}</span>
        </motion.div>
      </div>
    </section>
  );
}
