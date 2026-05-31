import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Battement de cœur : double pulsation (lub-dub) + silence + répétition
const HEARTBEAT_KEYFRAMES = {
  scale: [1, 1.45, 1.05, 1.38, 1, 1, 1],
  opacity: [1, 1, 1, 1, 1, 1, 1],
};
const HEARTBEAT_TRANSITION = {
  duration: 0.85,
  times: [0, 0.14, 0.28, 0.42, 0.57, 0.78, 1],
  ease: "easeInOut" as const,
  repeat: Infinity,
  repeatDelay: 0.55,
};

const RING_TRANSITION = {
  duration: 0.85,
  times: [0, 0.14, 0.28, 0.42, 0.57, 0.78, 1],
  ease: "easeOut" as const,
  repeat: Infinity,
  repeatDelay: 0.55,
};

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "pulse" | "out">("in");

  useEffect(() => {
    // Entrée → 0.6s, battements → 5.9s, sortie → 0.5s = 7s total
    const t1 = setTimeout(() => setPhase("pulse"), 600);
    const t2 = setTimeout(() => setPhase("out"), 6500);
    const t3 = setTimeout(() => onDone(), 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <AnimatePresence>
      {phase !== "out" ? (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{
            background: "linear-gradient(160deg, #0a1f3d 0%, #0f2e56 60%, #0a1f3d 100%)",
            /* Le contenu est poussé sous la barre de statut + home bar */
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {/* Cercles concentriques animés derrière le logo */}
          {phase === "pulse" ? (
            <>
              <motion.div
                animate={{ scale: [1, 2.2], opacity: [0.18, 0] }}
                transition={{ ...RING_TRANSITION, repeatDelay: 0.55 }}
                className="absolute size-32 rounded-full"
                style={{ background: "radial-gradient(circle, #22c5a8 0%, transparent 70%)" }}
              />
              <motion.div
                animate={{ scale: [1, 1.7], opacity: [0.12, 0] }}
                transition={{ ...RING_TRANSITION, delay: 0.12, repeatDelay: 0.55 }}
                className="absolute size-32 rounded-full"
                style={{ background: "radial-gradient(circle, #22c5a8 0%, transparent 70%)" }}
              />
            </>
          ) : null}

          {/* Logo */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col items-center"
          >
            {/* Cercle gradient-mint avec cœur */}
            <div className="relative">
              <motion.div
                animate={phase === "pulse" ? HEARTBEAT_KEYFRAMES : {}}
                transition={phase === "pulse" ? HEARTBEAT_TRANSITION : {}}
                className="size-28 rounded-[2.5rem] flex items-center justify-center shadow-2xl"
                style={{
                  background: "linear-gradient(135deg, #a8f0c8 0%, #22c5a8 60%, #0faa8e 100%)",
                  boxShadow: "0 0 60px rgba(34,197,168,0.35), 0 20px 60px rgba(0,0,0,0.5)",
                }}
              >
                {/* Cœur SVG */}
                <motion.svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-14"
                  animate={phase === "pulse" ? { scale: HEARTBEAT_KEYFRAMES.scale } : {}}
                  transition={phase === "pulse" ? HEARTBEAT_TRANSITION : {}}
                >
                  <path
                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                    fill="#0a1f3d"
                    stroke="#0a1f3d"
                    strokeWidth="0.5"
                  />
                </motion.svg>
              </motion.div>

              {/* Ligne ECG — apparaît après l'entrée */}
              {phase === "pulse" ? (
                <motion.svg
                  viewBox="0 0 120 30"
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-36 opacity-60"
                  initial={{ opacity: 0, pathLength: 0 }}
                  animate={{ opacity: 0.7 }}
                  transition={{ duration: 0.4 }}
                >
                  <motion.polyline
                    points="0,15 20,15 28,15 32,3 36,27 40,15 48,15 52,8 56,22 60,15 80,15 88,15 92,5 96,25 100,15 120,15"
                    fill="none"
                    stroke="#22c5a8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </motion.svg>
              ) : null}
            </div>

            {/* Nom + tagline */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="mt-12 text-center"
            >
              <p
                className="text-4xl font-extrabold tracking-tight text-white"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}
              >
                2KC
              </p>
              <p className="mt-1.5 text-sm font-semibold tracking-widest uppercase"
                style={{ color: "#22c5a8", letterSpacing: "0.2em" }}>
                Centre de Santé
              </p>
              <p className="mt-2 text-xs text-white/40 font-medium">Douala · Cameroun</p>
            </motion.div>
          </motion.div>

          {/* Barre de chargement en bas */}
          <motion.div
            className="absolute bottom-12 left-1/2 -translate-x-1/2 h-0.5 rounded-full overflow-hidden"
            style={{ width: 80, background: "rgba(255,255,255,0.1)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #22c5a8, #a8f0c8)" }}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 6.0, delay: 0.4, ease: "easeInOut" }}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
