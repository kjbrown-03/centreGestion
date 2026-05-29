import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { FileText, CreditCard, Wallet, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/comptable")({ component: ComptableHome });

function ComptableHome() {
  return (
    <DashboardLayout allow="comptable" title="Facturation & paiements (simulation)">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="Factures du jour" value="18" icon={FileText} accent />
        <StatCard label="Paiements encaissés" value="1 240 €" icon={Wallet} />
        <StatCard label="Mobile Money" value="540 €" icon={CreditCard} />
        <StatCard label="Reste à payer" value="180 €" icon={TrendingUp} />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 rounded-3xl border bg-card p-7"
        >
          <h3 className="text-lg font-bold text-[color:var(--navy)]">Dernières opérations</h3>
          <div className="mt-5 space-y-2">
            {[
              { id: "F-2026-051", patient: "Mariam Touré", amount: "45 €", mode: "Espèces" },
              { id: "F-2026-052", patient: "Jean Dubois", amount: "60 €", mode: "Mobile Money" },
              { id: "F-2026-053", patient: "Sophie Lemaire", amount: "30 €", mode: "Carte" },
            ].map((x) => (
              <div
                key={x.id}
                className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20"
              >
                <div>
                  <p className="font-semibold text-[color:var(--navy)]">{x.id} — {x.patient}</p>
                  <p className="text-xs text-muted-foreground">Mode: {x.mode}</p>
                </div>
                <p className="text-sm font-bold text-[color:var(--navy)]">{x.amount}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl gradient-hero p-7 text-white"
        >
          <h3 className="text-lg font-bold">Rapport synthétique</h3>
          <p className="text-white/70 text-sm">Simulation de reporting</p>
          <div className="mt-6 space-y-3">
            {[
              { label: "Tickets moyens", value: "52 €" },
              { label: "Taux d'impayés", value: "3%" },
              { label: "Encaissement/heure", value: "155 €" },
            ].map((k) => (
              <div key={k.label} className="rounded-xl glass-dark p-4 flex items-center justify-between">
                <p className="text-sm text-white/80">{k.label}</p>
                <p className="font-semibold">{k.value}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
