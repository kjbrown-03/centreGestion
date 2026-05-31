import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { FileText, CreditCard, Wallet, TrendingUp, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

  const [stripeOpen, setStripeOpen] = useState(false);
  const [stripeInvoice, setStripeInvoice] = useState<Invoice | null>(null);
  const [stripeCard, setStripeCard] = useState("");
  const [stripeExpiry, setStripeExpiry] = useState("");
  const [stripeCvv, setStripeCvv] = useState("");
  const [stripeName, setStripeName] = useState("");
  const [stripeProcessing, setStripeProcessing] = useState(false);

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
          // Toutes les factures non payées (pas de filtre date)
          sb
            .schema("app")
            .from("invoices")
            .select(
              `id, invoice_no, status, total, created_at, patient:patient_id (first_name, last_name)`,
            )
            .order("created_at", { ascending: false })
            .limit(100),
          // Paiements du jour
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

  const unpaidInvoices = invoices.filter((f) => f.status !== "payee");
  const invoicesCount = unpaidInvoices.length;
  const paymentsSum = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const mobileMoneySum = payments
    .filter((p) => p.method === "mobile_money")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = unpaidInvoices.reduce((s, f) => s + Number(f.total || 0), 0);

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
      toast.success("Paiement enregistré.");
    } catch (err: any) {
      toast.error(err?.message ?? "Paiement impossible.");
    } finally {
      setPaying((s) => ({ ...s, [invoice.id]: false }));
    }
  }

  function formatCardNumber(value: string) {
    return value
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  }

  function formatExpiry(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  }

  async function processStripePayment() {
    if (!stripeInvoice) return;
    if (!stripeCard.replace(/\s/g, "").match(/^\d{16}$/)) {
      toast.error("Numéro de carte invalide.");
      return;
    }
    if (!stripeExpiry.match(/^\d{2}\/\d{2}$/)) {
      toast.error("Date d'expiration invalide (MM/AA).");
      return;
    }
    if (!stripeCvv.match(/^\d{3,4}$/)) {
      toast.error("CVV invalide.");
      return;
    }
    setStripeProcessing(true);
    try {
      const supabase = await getSupabaseAsync();
      const [expMonth, expYear] = stripeExpiry.split("/");

      const { data, error } = await supabase.functions.invoke("stripe-charge", {
        body: {
          card_number: stripeCard.replace(/\s/g, ""),
          exp_month: expMonth,
          exp_year: `20${expYear}`,
          cvc: stripeCvv,
          holder_name: stripeName || undefined,
          amount_xaf: Number(stripeInvoice.total || 0),
          invoice_id: stripeInvoice.id,
        },
      });

      if (error) {
        const msg = (error as any)?.context?.json
          ? (await (error as any).context.json().catch(() => null))?.error
          : null;
        throw new Error(msg ?? error.message ?? "Paiement Stripe échoué.");
      }
      if (!data?.ok) throw new Error(data?.error ?? "Paiement Stripe échoué.");

      // Mettre à jour l'état local
      setInvoices((prev) =>
        prev.map((f) => (f.id === stripeInvoice.id ? { ...f, status: "payee" } : f)),
      );
      setPayments((prev) => [
        {
          id: crypto.randomUUID(),
          amount: Number(stripeInvoice.total || 0),
          method: "card",
          received_at: new Date().toISOString(),
          invoice: { invoice_no: stripeInvoice.invoice_no },
        },
        ...prev,
      ]);

      toast.success(`Paiement Stripe accepté ! (PI: ${data.payment_intent_id?.slice(0, 12)}...)`);
      setStripeOpen(false);
      setStripeInvoice(null);
      setStripeCard("");
      setStripeExpiry("");
      setStripeCvv("");
      setStripeName("");
    } catch (err: any) {
      toast.error(err?.message ?? "Paiement Stripe échoué.");
    } finally {
      setStripeProcessing(false);
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
          label="Factures impayées"
          value={loading ? "..." : String(invoicesCount)}
          icon={FileText}
          accent
        />
        <StatCard
          label="Paiements encaissés"
          value={loading ? "..." : fmt(paymentsSum)}
          icon={Wallet}
        />
        <StatCard
          label="Mobile Money"
          value={loading ? "..." : fmt(mobileMoneySum)}
          icon={CreditCard}
        />
        <StatCard
          label="Reste à payer"
          value={loading ? "..." : fmt(outstanding)}
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
            Factures à encaisser
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
                    {x.patient ? `${x.patient.first_name} ${x.patient.last_name}` : "Patient"}
                    {" · "}
                    {new Date(x.created_at).toLocaleDateString("fr-FR")}
                    {" · "}
                    <span className="capitalize">{x.status}</span>
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
                  <button
                    disabled={paying[x.id]}
                    onClick={() => {
                      setStripeInvoice(x);
                      setStripeOpen(true);
                    }}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 flex items-center gap-1.5"
                    style={{ backgroundColor: "#635BFF" }}
                  >
                    <CreditCard className="size-3.5" /> Stripe
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
                    {x.invoice?.invoice_no ?? "-"}
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
          <h3 className="text-lg font-bold">Rapport synthétique</h3>
          <p className="text-white/70 text-sm">Journée en cours</p>
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
                  : "-",
              },
              {
                label: "Paiement moyen",
                value: payments.length ? fmt(Math.round(paymentsSum / payments.length)) : "-",
              },
              {
                label: "Part Mobile Money",
                value: paymentsSum ? Math.round((mobileMoneySum / paymentsSum) * 100) + "%" : "-",
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
            Générer le résumé du jour
          </button>
          {report ? (
            <div className="mt-4 rounded-2xl bg-white/5 border border-white/15 p-4 text-sm whitespace-pre-wrap">
              {report}
            </div>
          ) : null}
        </motion.div>
      </div>

      {/* Modal Stripe */}
      <AnimatePresence>
        {stripeOpen && stripeInvoice ? (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !stripeProcessing && setStripeOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-6 py-4 flex items-center justify-between"
                style={{ backgroundColor: "#635BFF" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="size-8 rounded-lg grid place-items-center"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                  >
                    <CreditCard className="size-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Paiement sécurisé</p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                      Propulsé par Stripe
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !stripeProcessing && setStripeOpen(false)}
                  className="text-white/80 hover:text-white"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="rounded-xl bg-gray-50 border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Facture</p>
                    <p className="font-bold text-gray-800">{stripeInvoice.invoice_no}</p>
                    {stripeInvoice.patient ? (
                      <p className="text-xs text-gray-500">
                        {stripeInvoice.patient.first_name} {stripeInvoice.patient.last_name}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-2xl font-bold text-gray-800">
                    {fmt(Number(stripeInvoice.total || 0))}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Titulaire de la carte
                    </label>
                    <input
                      value={stripeName}
                      onChange={(e) => setStripeName(e.target.value)}
                      placeholder="Jean DUPONT"
                      disabled={stripeProcessing}
                      className="mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none transition disabled:opacity-60"
                      style={{ outline: "none" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Numéro de carte
                    </label>
                    <input
                      value={stripeCard}
                      onChange={(e) => setStripeCard(formatCardNumber(e.target.value))}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                      disabled={stripeProcessing}
                      className="mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none font-mono disabled:opacity-60"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Expiration
                      </label>
                      <input
                        value={stripeExpiry}
                        onChange={(e) => setStripeExpiry(formatExpiry(e.target.value))}
                        placeholder="MM/AA"
                        maxLength={5}
                        disabled={stripeProcessing}
                        className="mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none font-mono disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        CVV
                      </label>
                      <input
                        value={stripeCvv}
                        onChange={(e) =>
                          setStripeCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
                        }
                        placeholder="123"
                        maxLength={4}
                        disabled={stripeProcessing}
                        className="mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none font-mono disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void processStripePayment()}
                  disabled={stripeProcessing || !stripeCard || !stripeExpiry || !stripeCvv}
                  className="w-full rounded-xl text-white font-semibold py-4 text-sm transition disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ backgroundColor: "#635BFF" }}
                >
                  {stripeProcessing ? (
                    <>
                      <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Traitement en cours...
                    </>
                  ) : (
                    <>
                      <CreditCard className="size-4" />
                      Payer {fmt(Number(stripeInvoice.total || 0))}
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] text-gray-400">
                  🔒 Paiement sécurisé SSL · Données chiffrées par Stripe
                </p>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </DashboardLayout>
  );
}
