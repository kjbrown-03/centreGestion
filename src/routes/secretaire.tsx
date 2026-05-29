import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { Calendar, Users, Phone, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/secretaire")({ component: SecretaireHome });

const queue = [
  { ticket: "A-12", patient: "Mariam Touré", motif: "RDV Dr. Cissé", wait: "3 min" },
  { ticket: "A-13", patient: "Pierre Lambert", motif: "Retrait ordonnance", wait: "5 min" },
  { ticket: "A-14", patient: "Sophie Lemaire", motif: "Inscription", wait: "8 min" },
  { ticket: "A-15", patient: "Ali Benani", motif: "RDV Dr. Karim", wait: "12 min" },
];

const upcoming = [
  { time: "09:00", patient: "Mariam Touré", doc: "Dr. Cissé" },
  { time: "09:30", patient: "Jean Dubois", doc: "Dr. Cissé" },
  { time: "10:00", patient: "Léa Bertrand", doc: "Dr. Moreau" },
  { time: "10:30", patient: "Marc Vidal", doc: "Dr. Karim" },
  { time: "11:00", patient: "Ali Benani", doc: "Dr. Cissé" },
];

function SecretaireHome() {
  return (
    <DashboardLayout allow="secretaire" title="Accueil & rendez-vous">
      <div className="grid sm:grid-cols-4 gap-5">
        <StatCard label="File d'attente" value={queue.length} icon={Users} accent />
        <StatCard label="RDV aujourd'hui" value="24" icon={Calendar} />
        <StatCard label="Appels traités" value="38" icon={Phone} />
        <StatCard label="Messages" value="12" icon={MessageSquare} />
      </div>

      <div className="mt-8 grid lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border bg-card p-7">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[color:var(--navy)]">File d'attente</h3>
            <span className="text-xs px-3 py-1 rounded-full bg-[color:var(--mint)]/20 text-[color:var(--navy)] font-medium">{queue.length} personnes</span>
          </div>
          <div className="mt-5 space-y-2">
            {queue.map((q, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-4 p-4 rounded-2xl border hover:bg-muted/40 transition"
              >
                <div className="size-12 rounded-xl bg-[color:var(--navy)] text-[color:var(--mint)] grid place-items-center font-bold text-sm">{q.ticket}</div>
                <div className="flex-1">
                  <p className="font-semibold text-[color:var(--navy)]">{q.patient}</p>
                  <p className="text-xs text-muted-foreground">{q.motif}</p>
                </div>
                <p className="text-sm text-muted-foreground">⏱ {q.wait}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-3xl border bg-card p-7">
          <h3 className="text-lg font-bold text-[color:var(--navy)]">Prochains rendez-vous</h3>
          <div className="mt-5 space-y-2">
            {upcoming.map((u, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="flex items-center gap-4 p-4 rounded-2xl bg-muted/40"
              >
                <div className="flex flex-col items-center justify-center size-14 rounded-xl gradient-mint text-[color:var(--navy)]">
                  <span className="text-xs">{u.time.split(":")[0]}h</span>
                  <span className="text-lg font-bold leading-none">{u.time.split(":")[1]}</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[color:var(--navy)]">{u.patient}</p>
                  <p className="text-xs text-muted-foreground">avec {u.doc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
