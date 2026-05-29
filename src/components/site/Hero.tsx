import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play, ShieldCheck } from "lucide-react";

const VIDEO_SRC =
  "https://videos.pexels.com/video-files/4225862/4225862-uhd_2560_1440_25fps.mp4";
const POSTER =
  "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1920&q=80";

const headline = ["Soigner.", "Accompagner.", "Réinventer."];

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden text-white">
      {/* Video background */}
      <video
        className="absolute inset-0 size-full object-cover"
        src={VIDEO_SRC}
        poster={POSTER}
        autoPlay
        muted
        loop
        playsInline
      />
      {/* Overlays */}
      <div className="absolute inset-0 gradient-hero opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--navy)] via-transparent to-transparent" />
      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Floating orbs */}
      <motion.div
        animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-32 right-[12%] size-72 rounded-full bg-[color:var(--mint)]/20 blur-3xl"
      />
      <motion.div
        animate={{ y: [0, 16, 0], x: [0, -12, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-24 left-[8%] size-96 rounded-full bg-sky-400/20 blur-3xl"
      />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-40 pb-24 min-h-screen flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="inline-flex items-center gap-2 self-start rounded-full glass-dark px-4 py-1.5 text-xs font-medium text-white/90 mb-8"
        >
          <ShieldCheck className="size-3.5 text-[color:var(--mint)]" />
          Centre de Santé 2KC · Agréé & certifié
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
          Une médecine humaine et précise, augmentée par une plateforme moderne.
          Vos équipes et vos patients, au même endroit.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.3 }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-2xl bg-[color:var(--mint)] text-[color:var(--navy)] px-6 py-3.5 font-semibold shadow-mint hover:brightness-110 transition"
          >
            Accéder à mon espace
            <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Link>
          <a
            href="#services"
            className="inline-flex items-center gap-2 rounded-2xl glass-dark text-white px-6 py-3.5 font-medium hover:bg-white/15 transition"
          >
            <Play className="size-4" /> Découvrir le centre
          </a>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 0.8 }}
          className="mt-16 flex flex-wrap gap-x-10 gap-y-4 text-sm text-white/60"
        >
          <span>+12 000 patients suivis</span>
          <span>·</span>
          <span>Soins & Prévention</span>
          <span>·</span>
          <span>Ouvert 7j/7</span>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <div className="h-10 w-6 rounded-full border-2 border-white/40 flex justify-center pt-2">
          <motion.div
            animate={{ y: [0, 12, 0], opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="h-2 w-1 rounded-full bg-white/80"
          />
        </div>
      </motion.div>
    </section>
  );
}
