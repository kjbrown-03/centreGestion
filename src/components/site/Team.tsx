import { Reveal } from "./Reveal";
import { motion } from "framer-motion";

const team = [
  { name: "Keumeni Dassie Merveille", role: "Equipe 2KC", img: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=600&q=80" },
  { name: "Kemzeu Gilles Parfait", role: "Equipe 2KC", img: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=600&q=80" },
  { name: "Djappa Chloe Patient", role: "Equipe 2KC", img: "https://images.unsplash.com/photo-1550831107-1553da8c8464?w=600&q=80" },
  { name: "Kaldjob Jean Baptiste", role: "Equipe 2KC", img: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=600&q=80" },
  { name: "Jongwane Toko Joy", role: "Equipe 2KC", img: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=600&q=80" },
  { name: "Kingsley Tia", role: "Equipe 2KC", img: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=600&q=80" },
];

export function Team() {
  return (
    <section id="team" className="py-32 bg-background border-t">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-[color:var(--mint)]">Notre equipe</p>
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
                  <img src={m.img} alt={m.name} className="absolute inset-0 size-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--navy)]/90 via-[color:var(--navy)]/25 to-transparent" />
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
