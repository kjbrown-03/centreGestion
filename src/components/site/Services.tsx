import { Stethoscope, HeartPulse, Pill, Syringe, ClipboardList, Activity } from "lucide-react";
import { Reveal } from "./Reveal";
import { motion } from "framer-motion";

const services = [
  { icon: Stethoscope, title: "Médecine générale", desc: "Consultations, bilans de santé et suivi de proximité." },
  { icon: Syringe, title: "Soins infirmiers", desc: "Pansements, injections, vaccinations et soins programmés." },
  { icon: Pill, title: "Pharmacie intégrée", desc: "Stock optimisé, délivrance rapide et conseils ciblés." },
  { icon: ClipboardList, title: "Prévention & Dépistage", desc: "Campagnes de vaccination, bilans préventifs et dépistages." },
  { icon: HeartPulse, title: "Coordination & Suivi", desc: "Suivi des maladies chroniques et éducation thérapeutique." },
  { icon: Activity, title: "Analyses & Prélèvements", desc: "Laboratoire de prélèvements et tests d'orientation rapide." },
];

export function Services() {
  return (
    <section id="services" className="relative py-32 bg-background">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-[color:var(--mint)]">Nos services</p>
            <h2 className="mt-4 text-4xl sm:text-5xl font-bold text-[color:var(--navy)]">
              Une offre de soins complète, sous un même toit.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Des professionnels de santé coordonnés autour de vous, avec un parcours fluide et un dossier unique.
            </p>
          </div>
        </Reveal>

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group relative h-full rounded-3xl border bg-card p-7 hover:shadow-glow transition"
              >
                <div className="size-12 rounded-2xl bg-[color:var(--navy)] grid place-items-center text-[color:var(--mint)] group-hover:gradient-mint group-hover:text-[color:var(--navy)] transition">
                  <s.icon className="size-6" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-[color:var(--navy)]">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.desc}</p>
                <div className="absolute inset-x-7 bottom-0 h-px bg-gradient-to-r from-transparent via-[color:var(--mint)]/50 to-transparent opacity-0 group-hover:opacity-100 transition" />
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
