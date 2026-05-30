import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAsync } from "./supabase";

function getApiKey(): string | null {
  const k1 = (import.meta as any)?.env?.VITE_GEMINI_API_KEY as string | undefined;
  const k1b = (import.meta as any)?.env?.GEMINI_API_KEY as string | undefined;
  const k2 = (globalThis as any)?.process?.env?.VITE_GEMINI_API_KEY as string | undefined;
  const k2b = (globalThis as any)?.process?.env?.GEMINI_API_KEY as string | undefined;
  return (k1 ?? k1b ?? k2 ?? k2b ?? null) as string | null;
}

export function hasGemini(): boolean {
  return true;
}

function getModel(model: string = "gemini-2.5-flash") {
  const key = getApiKey();
  if (!key)
    throw new Error(
      "Clé Gemini manquante. Ajoutez VITE_GEMINI_API_KEY (ou GEMINI_API_KEY) dans .env",
    );
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model });
}

async function generateAiText(prompt: string): Promise<string> {
  const key = getApiKey();
  if (key) {
    const res = await getModel().generateContent(prompt);
    return res.response.text().trim();
  }

  const supabase = await getSupabaseAsync();
  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { prompt },
  });
  if (error) throw error;
  const text = (data as any)?.text;
  if (!text) throw new Error("RÃ©ponse IA vide.");
  return String(text).trim();
}

export async function dashboardAssistant(params: {
  role: string;
  userName?: string;
  message: string;
  context?: string[];
}): Promise<string> {
  const roleGuidance: Record<string, string> = {
    medecin:
      "Pour les médecins: rappeler les rendez-vous importants, détecter les résultats anormaux, proposer des pistes de traitement selon les symptômes sans remplacer le jugement clinique.",
    infirmier:
      "Pour les infirmières: alerter quand un patient doit recevoir un médicament, prioriser les soins, signaler les patients en danger.",
    pharmacien:
      "Pour le pharmacien: prévenir quand le stock est faible, recommander les commandes de médicaments et les priorités de délivrance.",
    comptable:
      "Pour le comptable: signaler les paiements en retard, résumer les encaissements et générer des rapports financiers courts.",
    patient:
      "Pour les patients: rappeler les consultations, les prises de médicaments et donner des conseils de santé généraux.",
    secretaire:
      "Pour le secrétariat: prioriser les rendez-vous, repérer les demandes urgentes et proposer les relances utiles.",
    directeur:
      "Pour la direction: repérer les alertes opérationnelles, les tendances et les priorités du centre.",
    admin:
      "Pour l'administration: aider au pilotage, à la création des comptes et au suivi des alertes du centre.",
  };

  const prompt = [
    "Tu es l'assistant IA proactif du Centre de Santé 2KC.",
    `Utilisateur: ${params.userName ?? "Utilisateur"}`,
    `Rôle: ${params.role}`,
    roleGuidance[params.role] ?? "Aide l'utilisateur avec des réponses concrètes et courtes.",
    "Réponds en français, avec des actions concrètes. Si la demande est médicale, précise que le médecin décide.",
    params.context?.length ? `Contexte récent:\n- ${params.context.join("\n- ")}` : null,
    `Message utilisateur: ${params.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateAiText(prompt);
}

export async function suggestTreatment(params: {
  chiefComplaint?: string;
  symptoms?: string;
  notes?: string;
}): Promise<string> {
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
  return generateAiText(prompt);
}

export async function stockReorderAdvice(
  items: Array<{ name: string; stock: number; threshold: number }>,
): Promise<string> {
  const low = items
    .filter((i) => i.stock <= i.threshold)
    .map((i) => `${i.name}: stock=${i.stock}, seuil=${i.threshold}`);
  const prompt = [
    "Tu es assistant pharmacie. Propose des commandes prioritaires pour articles sous seuil.",
    "Formate en liste courte: Produit — Quantité conseillée — Raison (sous seuil/rupture).",
    low.length
      ? `Articles sous seuil:\n- ${low.join("\n- ")}`
      : "Aucun article sous seuil. Réponds 'RAS'.",
  ].join("\n");
  return generateAiText(prompt);
}

export async function financeDailySummary(params: {
  invoicesCount: number;
  paymentsSum: number;
  outstanding: number;
  mobileMoneySum?: number;
}): Promise<string> {
  const prompt = [
    "Tu es assistant comptable. Fais un résumé financier journalier très court (3-5 puces).",
    `Factures: ${params.invoicesCount}`,
    `Encaissements: ${params.paymentsSum}`,
    `Reste à payer: ${params.outstanding}`,
    params.mobileMoneySum != null ? `Mobile Money: ${params.mobileMoneySum}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return generateAiText(prompt);
}

export async function nurseCareAdvisor(
  tasks: Array<{ time?: string; act?: string; urgent?: boolean }>,
): Promise<string> {
  const list = tasks
    .map((t) => `- ${t.time ?? ""} ${t.act ?? ""}${t.urgent ? " (urgent)" : ""}`.trim())
    .join("\n");
  const prompt = [
    "Tu es assistant infirmier. Priorise les actions de soins et signale les cas potentiellement à risque.",
    "Réponds avec 4-6 puces: priorités, risques, rappels (médicaments à l'heure).",
    list ? `Tâches du jour:\n${list}` : "Aucune tâche fournie (réponds RAS).",
  ].join("\n");
  return generateAiText(prompt);
}

export async function patientReminders(params: {
  nextAppointmentIso?: string;
  meds?: Array<{ name: string; dosage?: string; frequency?: string }>;
}): Promise<string> {
  const ap = params.nextAppointmentIso
    ? new Date(params.nextAppointmentIso).toLocaleString()
    : null;
  const meds = (params.meds ?? []).map(
    (m) => `${m.name}${m.dosage ? ", " + m.dosage : ""}${m.frequency ? ", " + m.frequency : ""}`,
  );
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
  return generateAiText(prompt);
}

export async function secretaryQueueAdvisor(
  appts: Array<{
    scheduled_at: string;
    status: string;
    reason?: string | null;
    patient?: { first_name: string; last_name: string } | null;
    practitioner?: { full_name: string | null } | null;
  }>,
): Promise<string> {
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
  return generateAiText(prompt);
}

export async function directorKpiInsights(params: {
  uniquePatients: number;
  apptCount: number;
  stockValue: number;
  monthRevenue: number;
}): Promise<string> {
  const prompt = [
    "Tu es directeur de centre. Fais une analyse courte en 3-5 puces (tendance, alertes, priorités).",
    `Patients uniques (jour): ${params.uniquePatients}`,
    `RDV aujourd'hui: ${params.apptCount}`,
    `Valeur stock pharma: ${Math.round(params.stockValue)}`,
    `Encaissements (mois): ${Math.round(params.monthRevenue)}`,
  ].join("\n");
  return generateAiText(prompt);
}
