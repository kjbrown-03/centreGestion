import { Reveal } from "./Reveal";
import { motion } from "framer-motion";

const team = [
  { name: "Keumeni Dassie Merveille", role: "Équipe 2KC", img: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=600&q=80" },
  { name: "Kemzeu Gilles Parfait", role: "Équipe 2KC", img: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=600&q=80" },
  { name: "Djappa Chloe Patient", role: "Équipe 2KC", img: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=600&q=80" },
  { name: "Kaldjob Jean Baptiste", role: "Équipe 2KC", img: "https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=600&q=80" },
  { name: "Jongwane Toko Joy", role: "Équipe 2KC", img: "https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=600&q=80" },
  { name: "Kingsley Tia", role: "Équipe 2KC", img: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=600&q=80" },
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

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {team.map((m, i) => (
            <Reveal key={m.name} delay={i * 0.08}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group h-full"
              >
                <div className="relative overflow-hidden rounded-3xl border bg-card p-8 h-60 flex flex-col justify-between hover:shadow-glow hover:border-[color:var(--mint)]/40 transition duration-300">
                  <div className="size-12 rounded-2xl bg-[color:var(--navy)] text-[color:var(--mint)] grid place-items-center text-lg font-bold border border-[color:var(--mint)]/20 shadow-sm group-hover:gradient-mint group-hover:text-[color:var(--navy)] transition duration-300">
                    {m.name
                      .replace("Dr. ", "")
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <h3 className="font-semibold text-xl text-[color:var(--navy)]">{m.name}</h3>
                    <p className="mt-2.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--mint)] bg-[color:var(--navy)]/5 border border-[color:var(--navy)]/10 px-3 py-1.5 rounded-xl inline-block">
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
