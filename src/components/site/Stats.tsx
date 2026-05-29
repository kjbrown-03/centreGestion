import { Counter } from "./Counter";
import { Reveal } from "./Reveal";

const stats = [
  { value: 12000, suffix: "+", label: "Patients accompagnés" },
  { value: 48, suffix: "", label: "Praticiens experts" },
  { value: 24, suffix: "/7", label: "Disponibilité" },
  { value: 99, suffix: "%", label: "Satisfaction" },
];

export function Stats() {
  return (
    <section className="relative py-24 bg-[color:var(--navy)] text-white overflow-hidden">
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-6 grid grid-cols-2 md:grid-cols-4 gap-10">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08}>
            <div>
              <div className="font-display text-5xl md:text-6xl font-bold text-gradient-mint">
                <Counter to={s.value} suffix={s.suffix} />
              </div>
              <p className="mt-3 text-white/70 text-sm uppercase tracking-wider">{s.label}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
