import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { HeartPulse, Activity, Syringe, Thermometer, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { nurseCareAdvisor } from "@/lib/ai";

export const Route = createFileRoute("/infirmier")({ component: InfirmierHome });

const tasks = [
  { time: "08:30", patient: "Chambre 102 - M. Lopez", act: "Prise de constantes", urgent: false },
  { time: "09:00", patient: "Chambre 104 - Mme. Bernard", act: "Injection insuline", urgent: true },
  { time: "10:00", patient: "Chambre 110 - M. Achour", act: "Pansement post-op", urgent: false },
  { time: "11:30", patient: "Chambre 112 - Mme. Riou", act: "Perfusion antibio", urgent: true },
  { time: "14:00", patient: "Consult. 3 - Enfant Diallo", act: "Vaccination", urgent: false },
];

function InfirmierHome() {
  const [aiLoading, setAiLoading] = useState(false);
  const [tips, setTips] = useState("");

  async function runAi() {
    try {
      setAiLoading(true);
      setTips(await nurseCareAdvisor(tasks));
    } catch (err: any) {
      toast.error(err?.message ?? "Service indisponible.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <DashboardLayout allow="infirmier" title="Soins du jour">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard label="Soins planifies" value="18" icon={Syringe} accent />
        <StatCard label="Patients suivis" value="32" icon={HeartPulse} />
        <StatCard label="Constantes prises" value="46" icon={Activity} />
        <StatCard label="Alertes" value="2" icon={AlertCircle} />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 rounded-3xl border bg-card p-4 sm:p-7"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-[color:var(--navy)]">Planning de soins</h3>
            <button
              type="button"
              onClick={() => void runAi()}
              disabled={aiLoading}
              className="rounded-2xl border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60"
            >
              Prioriser les soins
            </button>
          </div>
          <div className="mt-5 space-y-2">
            {tasks.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border transition hover:bg-muted/40 ${t.urgent ? "border-amber-400/50 bg-amber-50/40" : ""}`}
              >
                <div className="flex sm:flex-col items-center justify-center gap-1 sm:gap-0 rounded-xl gradient-mint text-[color:var(--navy)] px-4 py-3 sm:size-14">
                  <span className="text-xs">{t.time.split(":")[0]}h</span>
                  <span className="text-lg font-bold leading-none">{t.time.split(":")[1]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[color:var(--navy)] break-words">{t.patient}</p>
                  <p className="text-sm text-muted-foreground break-words">{t.act}</p>
                </div>
                {t.urgent && (
                  <span className="self-start sm:self-auto text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-amber-500 text-white">
                    Urgent
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl gradient-hero p-4 sm:p-7 text-white"
        >
          <Thermometer className="size-6 text-[color:var(--mint)]" />
          <h3 className="mt-3 text-lg font-bold">Constantes critiques</h3>
          <p className="text-white/70 text-sm">Patients sous surveillance</p>
          {tips ? (
            <div className="mt-4 rounded-2xl glass-dark p-4 text-xs whitespace-pre-wrap">
              {tips}
            </div>
          ) : null}
          <div className="mt-5 space-y-3">
            {[
              { name: "Mme. Bernard", v: "TA 160/95", color: "text-amber-300" },
              { name: "M. Achour", v: "T 38.4 C", color: "text-amber-300" },
              { name: "Mme. Riou", v: "FC 110 bpm", color: "text-red-300" },
            ].map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-3 rounded-xl glass-dark"
              >
                <p className="text-sm break-words">{p.name}</p>
                <p className={`font-mono font-semibold shrink-0 ${p.color}`}>{p.v}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}

