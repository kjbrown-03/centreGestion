import { GoogleGenerativeAI } from "@google/generative-ai";

function getApiKey(): string | null {
  const k1 = (import.meta as any)?.env?.VITE_GEMINI_API_KEY as string | undefined;
  const k1b = (import.meta as any)?.env?.GEMINI_API_KEY as string | undefined;
  const k2 = (globalThis as any)?.process?.env?.VITE_GEMINI_API_KEY as string | undefined;
  const k2b = (globalThis as any)?.process?.env?.GEMINI_API_KEY as string | undefined;
  return (k1 ?? k1b ?? k2 ?? k2b ?? null) as string | null;
}

export function hasGemini(): boolean {
  return !!getApiKey();
}

function getModel(model: string = "gemini-1.5-flash") {
  const key = getApiKey();
  if (!key)
    throw new Error(
      "Clé Gemini manquante. Ajoutez VITE_GEMINI_API_KEY (ou GEMINI_API_KEY) dans .env",
    );
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model });
}

export async function suggestTreatment(params: {
  chiefComplaint?: string;
  symptoms?: string;
  notes?: string;
}): Promise<string> {
  const model = getModel();
  const prompt = [
    "Tu es un assistant clinique qui propose des pistes de prise en charge basées sur des symptômes.",
    "Donne 3-6 suggestions concises, structurées en puces.",
    "Ne remplace pas le jugement clinique du médecin.",
    params.chiefComplaint ? `Motif principal: ${params.chiefComplaint}` : null,
    params.symptoms ? `Symptômes: ${params.symptoms}` : null,
    params.notes ? `Notes: ${params.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}

export async function stockReorderAdvice(items: Array<{ name: string; stock: number; threshold: number }>): Promise<string> {
  const model = getModel();
  const low = items.filter((i) => i.stock <= i.threshold).map((i) => `${i.name}: stock=${i.stock}, seuil=${i.threshold}`);
  const prompt = [
    "Tu es assistant pharmacie. Propose des commandes prioritaires pour articles sous seuil.",
    "Formate en liste courte: Produit — Quantité conseillée — Raison (sous seuil/rupture).",
    low.length ? `Articles sous seuil:\n- ${low.join("\n- ")}` : "Aucun article sous seuil. Réponds 'RAS'.",
  ].join("\n");
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}

export async function financeDailySummary(params: {
  invoicesCount: number;
  paymentsSum: number;
  outstanding: number;
  mobileMoneySum?: number;
}): Promise<string> {
  const model = getModel();
  const prompt = [
    "Tu es assistant comptable. Fais un résumé financier journalier très court (3-5 puces).",
    `Factures: ${params.invoicesCount}`,
    `Encaissements: ${params.paymentsSum}`,
    `Reste à payer: ${params.outstanding}`,
    params.mobileMoneySum != null ? `Mobile Money: ${params.mobileMoneySum}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}

export async function nurseCareAdvisor(tasks: Array<{ time?: string; act?: string; urgent?: boolean }>): Promise<string> {
  const model = getModel();
  const list = tasks.map((t) => `- ${t.time ?? ""} ${t.act ?? ""}${t.urgent ? " (urgent)" : ""}`.trim()).join("\n");
  const prompt = [
    "Tu es assistant infirmier. Priorise les actions de soins et signale les cas potentiellement à risque.",
    "Réponds avec 4-6 puces: priorités, risques, rappels (médicaments à l'heure).",
    list ? `Tâches du jour:\n${list}` : "Aucune tâche fournie (réponds RAS).",
  ].join("\n");
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}

export async function patientReminders(params: {
  nextAppointmentIso?: string;
  meds?: Array<{ name: string; dosage?: string; frequency?: string }>;
}): Promise<string> {
  const model = getModel();
  const ap = params.nextAppointmentIso ? new Date(params.nextAppointmentIso).toLocaleString() : null;
  const meds = (params.meds ?? []).map((m) => `${m.name}${m.dosage ? ", "+m.dosage : ""}${m.frequency ? ", "+m.frequency : ""}`);
  const prompt = [
    "Tu es coach santé pour patient. Fais:",
    "- Rappel de consultation à venir",
    "- Rappels de prise de médicaments",
    "- 2 conseils hygiène de vie génériques",
    ap ? `Prochain RDV: ${ap}` : null,
    meds.length ? `Médicaments: ${meds.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}

export async function secretaryQueueAdvisor(appts: Array<{
  scheduled_at: string;
  status: string;
  reason?: string | null;
  patient?: { first_name: string; last_name: string } | null;
  practitioner?: { full_name: string | null } | null;
}>): Promise<string> {
  const model = getModel();
  const lines = appts
    .map(
      (a) =>
        `- ${new Date(a.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${
          a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : "—"
        } · ${a.practitioner?.full_name ?? "—"} · ${a.status} · ${a.reason ?? "Rendez-vous"}`,
    )
    .join("\n");
  const prompt = [
    "Tu es assistant du secrétariat. Aide à prioriser et organiser la journée.",
    "Donne 3-6 puces: tri de la file d'attente (en_attente d'abord), RDV à confirmer/relancer, no-shows potentiels, messages à envoyer.",
    lines ? `Aujourd'hui:\n${lines}` : "Aucun rendez-vous.",
  ].join("\n");
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}

export async function directorKpiInsights(params: {
  uniquePatients: number;
  apptCount: number;
  stockValue: number;
  monthRevenue: number;
}): Promise<string> {
  const model = getModel();
  const prompt = [
    "Tu es directeur de centre. Fais une analyse courte en 3-5 puces (tendance, alertes, priorités).",
    `Patients uniques (jour): ${params.uniquePatients}`,
    `RDV aujourd'hui: ${params.apptCount}`,
    `Valeur stock pharma: ${Math.round(params.stockValue)}`,
    `Encaissements (mois): ${Math.round(params.monthRevenue)}`,
  ].join("\n");
  const res = await model.generateContent(prompt);
  return res.response.text().trim();
}
