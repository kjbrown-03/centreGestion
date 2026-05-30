import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { FileText, CreditCard, Wallet, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseAsync } from "@/lib/supabase";
import { toast } from "sonner";
import { financeDailySummary } from "@/lib/ai";

export const Route = createFileRoute("/comptable")({ component: ComptableHome });

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfTomorrowIso() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}

type Invoice = {
  id: string;
  invoice_no: string;
  status: string;
  total: number;
  created_at: string;
  patient?: { first_name: string; last_name: string } | null;
};
type Payment = {
  id: string;
  amount: number;
  method: string;
  received_at: string;
  invoice?: { invoice_no: string } | null;
};

function fmt(x: number) {
  return new Intl.NumberFormat("fr-FR").format(x) + " XAF";
}

function ComptableHome() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [report, setReport] = useState<string>("");
  const [paying, setPaying] = useState<Record<string, boolean>>({});

  const todayStart = useMemo(() => startOfTodayIso(), []);
  const tomorrowStart = useMemo(() => startOfTomorrowIso(), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        const sb: any = supabase;
        const [inv, pay] = await Promise.all([
          sb
            .schema("app")
            .from("invoices")
            .select(
              `id, invoice_no, status, total, created_at, patient:patient_id (first_name, last_name)`,
            )
            .gte("created_at", todayStart)
            .lt("created_at", tomorrowStart)
            .order("created_at", { ascending: false }),
          sb
            .schema("app")
            .from("payments")
            .select(`id, amount, method, received_at, invoice:invoice_id (invoice_no)`)
            .gte("received_at", todayStart)
            .lt("received_at", tomorrowStart)
            .order("received_at", { ascending: false }),
        ]);
        if (inv.error) throw inv.error;
        if (pay.error) throw pay.error;
        if (alive) {
          setInvoices((inv.data ?? []) as any);
          setPayments((pay.data ?? []) as any);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [todayStart, tomorrowStart]);

  const invoicesCount = invoices.length;
  const paymentsSum = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const mobileMoneySum = payments
    .filter((p) => p.method === "mobile_money")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = Math.max(
    invoices.reduce((s, f) => s + Number(f.total || 0), 0) - paymentsSum,
    0,
  );
  const unpaidInvoices = invoices.filter((f) => f.status !== "payee");

  async function recordPayment(
    invoice: Invoice,
    method: "cash" | "mobile_money" | "card" | "bank_transfer",
  ) {
    setPaying((s) => ({ ...s, [invoice.id]: true }));
    try {
      const supabase = await getSupabaseAsync();
      const authUser = (await supabase.auth.getUser()).data.user;
      const sb: any = supabase;
      const amount = Number(invoice.total || 0);
      const { error } = await sb
        .schema("app")
        .from("payments")
        .insert({
          invoice_id: invoice.id,
          method,
          amount,
          received_by: authUser?.id ?? null,
        });
      if (error) throw error;
      await sb.schema("app").from("invoices").update({ status: "payee" }).eq("id", invoice.id);
      setInvoices((prev) => prev.map((f) => (f.id === invoice.id ? { ...f, status: "payee" } : f)));
      setPayments((prev) => [
        {
          id: crypto.randomUUID(),
          amount,
          method,
          received_at: new Date().toISOString(),
          invoice: { invoice_no: invoice.invoice_no },
        },
        ...prev,
      ]);
      toast.success("Paiement enregistre.");
    } catch (err: any) {
      toast.error(err?.message ?? "Paiement impossible.");
    } finally {
      setPaying((s) => ({ ...s, [invoice.id]: false }));
    }
  }

  async function runReport() {
    try {
      setAiLoading(true);
      const txt = await financeDailySummary({
        invoicesCount,
        paymentsSum: Math.round(paymentsSum),
        outstanding: Math.round(outstanding),
        mobileMoneySum: Math.round(mobileMoneySum),
      });
      setReport(txt);
    } catch (err: any) {
      toast.error(err?.message ?? "Service indisponible.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <DashboardLayout allow="comptable" title="Facturation & paiements">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Factures du jour"
          value={loading ? "â€¦" : String(invoicesCount)}
          icon={FileText}
          accent
        />
        <StatCard
          label="Paiements encaissÃ©s"
          value={loading ? "â€¦" : fmt(paymentsSum)}
          icon={Wallet}
        />
        <StatCard
          label="Mobile Money"
          value={loading ? "â€¦" : fmt(mobileMoneySum)}
          icon={CreditCard}
        />
        <StatCard
          label="Reste Ã  payer"
          value={loading ? "â€¦" : fmt(outstanding)}
          icon={TrendingUp}
        />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 rounded-3xl border bg-card p-7"
        >
          <h3 className="text-lg font-bold text-[color:var(--navy)]">
            Factures du jour a encaisser
          </h3>
          <div className="mt-5 space-y-2">
            {(loading ? [] : unpaidInvoices).map((x) => (
              <div
                key={x.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20"
              >
                <div>
                  <p className="font-semibold text-[color:var(--navy)]">{x.invoice_no}</p>
                  <p className="text-xs text-muted-foreground">
                    {x.patient ? `${x.patient.first_name} ${x.patient.last_name}` : "Patient"} -{" "}
                    {x.status}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <p className="text-sm font-bold text-[color:var(--navy)] sm:mr-2">
                    {fmt(Number(x.total || 0))}
                  </p>
                  <button
                    disabled={paying[x.id]}
                    onClick={() => void recordPayment(x, "cash")}
                    className="rounded-xl border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                  >
                    Cash
                  </button>
                  <button
                    disabled={paying[x.id]}
                    onClick={() => void recordPayment(x, "mobile_money")}
                    className="rounded-xl border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                  >
                    Mobile Money
                  </button>
                </div>
              </div>
            ))}
            {!loading && unpaidInvoices.length === 0 ? (
              <div className="rounded-2xl border bg-muted/30 p-5 text-sm text-muted-foreground">
                Aucune facture en attente aujourd'hui.
              </div>
            ) : null}
          </div>

          <h3 className="mt-8 text-lg font-bold text-[color:var(--navy)]">Derniers paiements</h3>
          <div className="mt-5 space-y-2">
            {(loading ? [] : payments).map((x) => (
              <div
                key={x.id}
                className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20"
              >
                <div>
                  <p className="font-semibold text-[color:var(--navy)]">
                    {x.invoice?.invoice_no ?? "â€”"}
                  </p>
                  <p className="text-xs text-muted-foreground">Mode: {x.method}</p>
                </div>
                <p className="text-sm font-bold text-[color:var(--navy)]">
                  {fmt(Number(x.amount || 0))}
                </p>
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
          <h3 className="text-lg font-bold">Rapport synthÃ©tique</h3>
          <p className="text-white/70 text-sm">JournÃ©e en cours</p>
          <div className="mt-6 space-y-3">
            {[
              {
                label: "Montant moyen/facture",
                value: invoicesCount
                  ? fmt(
                      Math.round(
                        invoices.reduce((s, f) => s + Number(f.total || 0), 0) / invoicesCount,
                      ),
                    )
                  : "â€”",
              },
              {
                label: "Paiement moyen",
                value: payments.length ? fmt(Math.round(paymentsSum / payments.length)) : "â€”",
              },
              {
                label: "Part Mobile Money",
                value: paymentsSum ? Math.round((mobileMoneySum / paymentsSum) * 100) + "%" : "â€”",
              },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-xl glass-dark p-4 flex items-center justify-between"
              >
                <p className="text-sm text-white/80">{k.label}</p>
                <p className="font-semibold">{k.value}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void runReport()}
            disabled={aiLoading}
            className="mt-6 w-full rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold py-3 border border-white/20 disabled:opacity-60"
          >
            Generer le resume du jour
          </button>
          {report ? (
            <div className="mt-4 rounded-2xl bg-white/5 border border-white/15 p-4 text-sm whitespace-pre-wrap">
              {report}
            </div>
          ) : null}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}


