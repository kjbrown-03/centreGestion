import { Reveal } from "./Reveal";
import { Check } from "lucide-react";

const points = [
  "Plateaux techniques de pointe",
  "Dossier patient sécurisé et unifié",
  "Équipes pluridisciplinaires coordonnées",
  "Approche humaine et personnalisée",
];

export function About() {
  return (
    <section id="about" className="py-32 bg-muted/40">
      <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16 items-center">
        <Reveal>
          <div className="relative">
            <div className="absolute -inset-4 gradient-mint rounded-[2rem] opacity-20 blur-2xl" />
            <img
              src="/team/djapp-chloe-patient.png"
              alt="Equipe medicale 2KC"
              className="relative rounded-[2rem] shadow-glow w-full h-[520px] object-cover"
            />
            <div className="absolute -bottom-6 -right-6 glass rounded-2xl p-5 shadow-glow hidden sm:block">
              <p className="text-3xl font-bold text-[color:var(--navy)]">15 ans</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                d'excellence médicale
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-[color:var(--mint)]">
              À propos de 2KC
            </p>
            <h2 className="mt-4 text-4xl sm:text-5xl font-bold text-[color:var(--navy)] leading-tight">
              Un centre pensé pour <span className="text-gradient-mint">l'humain d'abord</span>.
            </h2>
            <p className="mt-6 text-muted-foreground text-lg leading-relaxed">
              Depuis plus de quinze ans, le Centre 2KC réunit médecins, infirmiers et personnels
              soignants autour d'une même mission : offrir des soins d'excellence dans un cadre
              chaleureux et apaisant.
            </p>
            <ul className="mt-8 space-y-3">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-3">
                  <span className="size-6 rounded-full gradient-mint grid place-items-center text-[color:var(--navy)]">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-[color:var(--navy)]">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
