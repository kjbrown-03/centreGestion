import { Reveal } from "./Reveal";
import { motion } from "framer-motion";

const team = [
  { name: "Jongwane Toko Joy", role: "Docteur", img: "/team/jongwane-toko-joy.jpeg" },
  { name: "Jules Parfait", role: "Docteur", img: "/team/jules-parfait.jpeg" },
  { name: "Kaldjob Jean Baptiste", role: "Docteur", img: "/team/kaldjob-jean-baptiste.jpeg" },
  { name: "Djapp Chloe Patient", role: "Docteur", img: "/team/djapp-chloe-patient.png" },
];

export function Team() {
  return (
    <section id="team" className="py-32 bg-background border-t">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-[color:var(--mint)]">Notre équipe</p>
            <h2 className="mt-4 text-4xl sm:text-5xl font-bold text-[color:var(--navy)]">
              Des visages, des expertises, une vocation.
            </h2>
          </div>
        </Reveal>

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {team.map((m, i) => (
            <Reveal key={m.name} delay={i * 0.08}>
              <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="group h-full">
                <div className="relative overflow-hidden rounded-3xl border bg-card h-80 flex flex-col justify-end hover:shadow-glow hover:border-[color:var(--mint)]/40 transition duration-300">
                  <div className="absolute inset-0 grid place-items-center bg-[color:var(--navy)] text-[color:var(--mint)]">
                    <span className="text-6xl font-display font-bold">
                      {m.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                    </span>
                  </div>
                  <img
                    src={m.img}
                    alt={m.name}
                    className="absolute inset-0 size-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--navy)]/90 via-[color:var(--navy)]/20 to-transparent" />
                  <div className="relative p-6">
                    <h3 className="font-semibold text-xl text-white">{m.name}</h3>
                    <p className="mt-2.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)] bg-[color:var(--mint)] px-3 py-1.5 rounded-xl inline-block">
                      {m.role}
                    </p>
                  </div>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

