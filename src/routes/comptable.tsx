import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { FileText, CreditCard, Wallet, TrendingUp, X, Download, Bell, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseAsync } from "@/lib/supabase";
import { toast } from "sonner";
import { financeDailySummary } from "@/lib/ai";
import { useT } from "@/lib/i18n";
import { formatFcfa } from "@/lib/currency";

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
  return formatFcfa(x);
}

function ComptableHome() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [report, setReport] = useState<string>("");
  const [paying, setPaying] = useState<Record<string, boolean>>({});
  const [creatingDemo, setCreatingDemo] = useState(false);

  const [stripeOpen, setStripeOpen] = useState(false);
  const [stripeInvoice, setStripeInvoice] = useState<Invoice | null>(null);
  const [stripeCard, setStripeCard] = useState("");
  const [stripeExpiry, setStripeExpiry] = useState("");
  const [stripeCvv, setStripeCvv] = useState("");
  const [stripeName, setStripeName] = useState("");
  const [stripeProcessing, setStripeProcessing] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  const todayStart = useMemo(() => startOfTodayIso(), []);
  const tomorrowStart = useMemo(() => startOfTomorrowIso(), []);

  useEffect(() => {
    let alive = true;
    let realtimeChannel: any = null;
    let supabaseInstance: any = null;

    async function load() {
      setLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        const sb: any = supabase;
        const [inv, pay] = await Promise.all([
          sb
            .schema("app")
            .from("invoices")
            .select(`id, invoice_no, status, total, created_at, patient:patient_id (first_name, last_name)`)
            .order("created_at", { ascending: false })
            .limit(100),
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
    }

    void load();

    // Realtime — subscription correctement nettoyée via ref local
    getSupabaseAsync().then((supabase) => {
      if (!alive) return;
      supabaseInstance = supabase;
      realtimeChannel = supabase
        .channel(`finance_comptable_${Date.now()}`)
        .on("postgres_changes", { event: "INSERT", schema: "app", table: "invoices" }, () => {
          if (alive) { setHasNew(true); void load(); }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "app", table: "invoices" }, () => {
          if (alive) void load();
        })
        .on("postgres_changes", { event: "INSERT", schema: "app", table: "payments" }, () => {
          if (alive) void load();
        })
        .subscribe();
    });

    // Polling toutes les 15s en cas d'échec de realtime
    const pollId = setInterval(() => { if (alive) void load(); }, 15000);

    return () => {
      alive = false;
      clearInterval(pollId);
      try {
        if (realtimeChannel && supabaseInstance?.removeChannel) {
          supabaseInstance.removeChannel(realtimeChannel);
        }
      } catch { /* ignore */ }
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
          currency: "FCFA",
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
      toast.success(t("Paiement enregistré."));
    } catch (err: any) {
      toast.error(err?.message ?? t("Paiement impossible."));
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
      toast.error(t("Numéro de carte invalide."));
      return;
    }
    if (!stripeExpiry.match(/^\d{2}\/\d{2}$/)) {
      toast.error(t("Date d'expiration invalide (MM/AA)."));
      return;
    }
    if (!stripeCvv.match(/^\d{3,4}$/)) {
      toast.error(t("CVV invalide."));
      return;
    }
    setStripeProcessing(true);
    try {
      const supabase = await getSupabaseAsync();
      const authUser = (await supabase.auth.getUser()).data.user;
      const sb: any = supabase;
      const amount = Number(stripeInvoice.total || 0);

      // Simulation locale — enregistre le paiement directement sans appeler Stripe
      await new Promise((r) => setTimeout(r, 1200)); // délai réaliste

      const { error: payErr } = await sb
        .schema("app")
        .from("payments")
        .insert({
          invoice_id: stripeInvoice.id,
          method: "card",
          amount,
          currency: "FCFA",
          received_by: authUser?.id ?? null,
        });
      if (payErr) throw payErr;
      await sb.schema("app").from("invoices").update({ status: "payee" }).eq("id", stripeInvoice.id);

      setInvoices((prev) =>
        prev.map((f) => (f.id === stripeInvoice!.id ? { ...f, status: "payee" } : f)),
      );
      setPayments((prev) => [
        {
          id: crypto.randomUUID(),
          amount,
          method: "card",
          received_at: new Date().toISOString(),
          invoice: { invoice_no: stripeInvoice.invoice_no },
        },
        ...prev,
      ]);

      toast.success(t("Paiement carte accepté ✓ — {amount}", { amount: fmt(amount) }));
      setStripeOpen(false);
      setStripeInvoice(null);
      setStripeCard("");
      setStripeExpiry("");
      setStripeCvv("");
      setStripeName("");
    } catch (err: any) {
      toast.error(err?.message ?? t("Paiement Stripe échoué."));
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
      toast.error(err?.message ?? t("Service indisponible."));
    } finally {
      setAiLoading(false);
    }
  }

  async function downloadInvoicePdf(invoice: Invoice) {
    const patientName = invoice.patient
      ? `${invoice.patient.first_name} ${invoice.patient.last_name}`
      : "Patient";
    const dateStr = new Date(invoice.created_at).toLocaleDateString("fr-FR");
    const statusLabel =
      invoice.status === "payee" ? "Payée ✓" : invoice.status === "emise" ? "Émise" : invoice.status;
    const amount = fmt(Number(invoice.total || 0));

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Facture ${invoice.invoice_no} — Centre 2KC</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#1e293b;padding:40px 32px;max-width:740px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #e2e8f0}
  .brand-icon{width:42px;height:42px;background:linear-gradient(135deg,#a8f0c8,#6ee7b7);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#1e3a5f;margin-right:12px;vertical-align:middle}
  .brand-name{font-size:22px;font-weight:800;color:#1e3a5f;vertical-align:middle}
  .brand-sub{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:#64748b;margin-top:4px}
  .brand-addr{font-size:11px;color:#94a3b8;margin-top:2px}
  .meta{text-align:right}
  .invoice-num{font-size:20px;font-weight:800;color:#1e3a5f}
  .status-badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;margin-top:8px;background:${invoice.status==="payee"?"#d1fae5":"#fef3c7"};color:${invoice.status==="payee"?"#10b981":"#f59e0b"}}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:28px 0;padding:20px;background:#f8fafc;border-radius:12px}
  .info-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;font-weight:600}
  .info-value{font-size:15px;font-weight:600;color:#1e3a5f;margin-top:3px}
  .footer{margin-top:48px;padding-top:18px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;line-height:1.6}
  @media print{body{padding:16px}@page{margin:1cm;size:A4 portrait}}
</style>
</head>
<body>
  <div class="header">
    <div>
      <span class="brand-icon">2KC</span>
      <span class="brand-name">2KC</span>
      <div class="brand-sub">Centre de Santé Pluridisciplinaire</div>
      <div class="brand-addr">Douala, Cameroun · +237 693 904 197</div>
    </div>
    <div class="meta">
      <div class="invoice-num">${invoice.invoice_no}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Émise le ${dateStr}</div>
      <div><span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>
  <div class="info-grid">
    <div>
      <div class="info-label">Facturé à</div>
      <div class="info-value">${patientName}</div>
    </div>
    <div style="text-align:right">
      <div class="info-label">Montant total</div>
      <div class="info-value" style="font-size:20px;color:${invoice.status==="payee"?"#10b981":"#f59e0b"}">${amount}</div>
    </div>
  </div>
  <div class="footer">
    <p>Centre de Santé 2KC · Douala, Cameroun · +237 693 904 197</p>
    <p>Statut : ${statusLabel} · Document généré le ${new Date().toLocaleDateString("fr-FR")}</p>
  </div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);})</script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `Facture_${invoice.invoice_no}_2KC.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  async function createDemoInvoice() {
    setCreatingDemo(true);
    try {
      const supabase = await getSupabaseAsync();
      const authUser = (await supabase.auth.getUser()).data.user;
      const sb: any = supabase;

      const { data: patient, error: patientErr } = await sb
        .schema("app")
        .from("patients")
        .select("id, first_name, last_name")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      if (patientErr) throw patientErr;

      const { data: invoice, error: invoiceErr } = await sb
        .schema("app")
        .from("invoices")
        .insert({
          patient_id: patient.id,
          created_by: authUser?.id ?? null,
          currency: "FCFA",
        })
        .select("id, invoice_no, status, total, created_at")
        .single();
      if (invoiceErr) throw invoiceErr;

      const { error: itemErr } = await sb.schema("app").from("invoice_items").insert({
        invoice_id: invoice.id,
        label: "Consultation generale",
        qty: 1,
        unit_price: 5000,
      });
      if (itemErr) throw itemErr;

      const created: Invoice = {
        id: invoice.id,
        invoice_no: invoice.invoice_no,
        status: invoice.status ?? "emise",
        total: 5000,
        created_at: invoice.created_at ?? new Date().toISOString(),
        patient: { first_name: patient.first_name, last_name: patient.last_name },
      };
      setInvoices((prev) => [created, ...prev]);
      toast.success(t("Facture de test creee en FCFA."));
    } catch (err: any) {
      toast.error(err?.message ?? t("Creation de facture impossible."));
    } finally {
      setCreatingDemo(false);
    }
  }

  return (
    <DashboardLayout allow="comptable" title={t("Facturation & paiements")}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label={t("Factures impayées")}
          value={loading ? "..." : String(invoicesCount)}
          icon={FileText}
          accent
        />
        <StatCard
          label={t("Paiements encaissés")}
          value={loading ? "..." : fmt(paymentsSum)}
          icon={Wallet}
        />
        <StatCard
          label={t("Mobile Money")}
          value={loading ? "..." : fmt(mobileMoneySum)}
          icon={CreditCard}
        />
        <StatCard
          label={t("Reste à payer")}
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
          <div className="flex items-center gap-2 justify-between">
            <h3 className="text-lg font-bold text-[color:var(--navy)]">{t("Factures à encaisser")}</h3>
            <div className="flex items-center gap-2">
              {hasNew ? (
                <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg flex items-center gap-1">
                  <Bell className="size-3" /> Nouvelles factures
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setHasNew(false);
                  void (async () => {
                    setLoading(true);
                    try {
                      const supabase = await getSupabaseAsync();
                      const sb: any = supabase;
                      const [inv, pay] = await Promise.all([
                        sb.schema("app").from("invoices").select(`id, invoice_no, status, total, created_at, patient:patient_id (first_name, last_name)`).order("created_at", { ascending: false }).limit(100),
                        sb.schema("app").from("payments").select(`id, amount, method, received_at, invoice:invoice_id (invoice_no)`).order("received_at", { ascending: false }),
                      ]);
                      if (!inv.error) setInvoices((inv.data ?? []) as any);
                      if (!pay.error) setPayments((pay.data ?? []) as any);
                    } finally {
                      setLoading(false);
                    }
                  })();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
                title={t("Actualiser")}
              >
                <RefreshCw className="size-3.5" /> {t("Actualiser")}
              </button>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {(loading ? [] : invoices).map((x) => {
              const isPaid = x.status === "payee";
              return (
                <div
                  key={x.id}
                  className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border ${isPaid ? "bg-emerald-50/40 border-emerald-200/60" : "bg-muted/20"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[color:var(--navy)]">{x.invoice_no}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {isPaid ? "✓ Payée" : "En attente"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {x.patient ? `${x.patient.first_name} ${x.patient.last_name}` : t("Patient")}
                      {" · "}
                      {new Date(x.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex flex-row items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[color:var(--navy)] mr-1">
                      {fmt(Number(x.total || 0))}
                    </p>
                    {/* Bouton PDF — toujours visible */}
                    <button
                      onClick={() => downloadInvoicePdf(x)}
                      className="rounded-xl border px-3 py-2 text-xs hover:bg-muted flex items-center gap-1.5 font-semibold"
                      title={t("Télécharger en PDF")}
                    >
                      <Download className="size-3.5" /> PDF
                    </button>
                    {/* Boutons paiement — seulement si non payée */}
                    {!isPaid ? (
                      <>
                        <button
                          disabled={paying[x.id]}
                          onClick={() => void recordPayment(x, "cash")}
                          className="rounded-xl border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                        >
                          {t("Cash")}
                        </button>
                        <button
                          disabled={paying[x.id]}
                          onClick={() => void recordPayment(x, "mobile_money")}
                          className="rounded-xl border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                        >
                          {t("Mobile Money")}
                        </button>
                        <button
                          disabled={paying[x.id]}
                          onClick={() => { setStripeInvoice(x); setStripeOpen(true); }}
                          className="rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 flex items-center gap-1.5"
                          style={{ backgroundColor: "#635BFF" }}
                        >
                          <CreditCard className="size-3.5" /> Stripe
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!loading && invoices.length === 0 ? (
              <div className="rounded-2xl border bg-muted/30 p-5 text-sm text-muted-foreground">
                {t("Aucune facture enregistrée.")}
              </div>
            ) : null}
          </div>

          <h3 className="mt-8 text-lg font-bold text-[color:var(--navy)]">{t("Derniers paiements")}</h3>
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
                  <p className="text-xs text-muted-foreground">{t("Mode:")} {x.method}</p>
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
          <h3 className="text-lg font-bold">{t("Rapport synthétique")}</h3>
          <p className="text-white/70 text-sm">{t("Journée en cours")}</p>
          <div className="mt-6 space-y-3">
            {[
              {
                label: t("Montant moyen/facture"),
                value: invoicesCount
                  ? fmt(
                      Math.round(
                        invoices.reduce((s, f) => s + Number(f.total || 0), 0) / invoicesCount,
                      ),
                    )
                  : "-",
              },
              {
                label: t("Paiement moyen"),
                value: payments.length ? fmt(Math.round(paymentsSum / payments.length)) : "-",
              },
              {
                label: t("Part Mobile Money"),
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
            {t("Générer le résumé du jour")}
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
                    <p className="text-white font-semibold text-sm">{t("Paiement par carte")}</p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                      Mode simulation · Carte de test
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
                {/* Carte de test */}
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-0.5">
                  <p className="font-bold">🧪 Carte de test</p>
                  <p>N° : <span className="font-mono">4242 4242 4242 4242</span></p>
                  <p>Expiration : <span className="font-mono">12/26</span> · CVV : <span className="font-mono">123</span></p>
                </div>

                <div className="rounded-xl bg-gray-50 border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{t("Facture")}</p>
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
                      {t("Titulaire de la carte")}
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
                      {t("Numéro de carte")}
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
                        {t("Expiration")}
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
                      {t("Traitement en cours...")}
                    </>
                  ) : (
                    <>
                      <CreditCard className="size-4" />
                      {t("Payer")} {fmt(Number(stripeInvoice.total || 0))}
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] text-gray-400">
                  🔒 Mode simulation · Aucun vrai débit effectué
                </p>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </DashboardLayout>
  );
}
