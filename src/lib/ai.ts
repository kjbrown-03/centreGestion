import { getSupabaseAsync } from "@/lib/supabase";
import { formatFcfa } from "@/lib/currency";

type ChatbotParams = {
  role: string;
  userName?: string;
  message: string;
  context?: string[];
};

const emergencyWords = [
  "urgence",
  "respire pas",
  "difficulte a respirer",
  "difficulté à respirer",
  "douleur poitrine",
  "perte de connaissance",
  "convulsion",
  "saignement",
  "avc",
  "brulure grave",
  "brûlure grave",
];

const feverWords = ["fievre", "fièvre", "temperature", "température", "paludisme", "frisson"];
const painWords = ["douleur", "mal de tete", "mal de tête", "ventre", "dos", "poitrine"];
const coughWords = ["toux", "rhume", "gorge", "nez", "grippe"];
const pregnancyWords = ["grossesse", "enceinte", "retard de regles", "retard de règles"];
const medicineWords = ["medicament", "médicament", "ordonnance", "dose", "prise", "traitement"];
const appointmentWords = ["rdv", "rendez-vous", "consultation", "medecin", "médecin"];

function normalize(text: string) {
  return text.trim().toLowerCase();
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

async function askGemini(prompt: string, maxOutputTokens = 1200): Promise<string | null> {
  try {
    const supabase = await getSupabaseAsync();
    const { data, error } = await supabase.functions.invoke("ai-assistant", {
      body: { prompt, model: "gemini-2.5-flash", maxOutputTokens },
    });
    if (error) throw error;
    const text = String((data as any)?.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}

function buildMedicalPrompt(params: ChatbotParams) {
  const roleLabel = params.role === "patient" ? "patient" : `utilisateur ${params.role}`;
  return [
    "Tu es l'assistant IA du Centre de Santé 2KC au Cameroun.",
    "Réponds en français clair, court et utile.",
    "Donne une réponse complète et termine toujours par une phrase finale claire.",
    "Ne pose jamais de diagnostic définitif et ne remplace pas une consultation médicale.",
    "Si les symptômes semblent graves, conseille de contacter le centre sur WhatsApp au 693904197 ou d'aller aux urgences.",
    "Pour les professionnels du centre, donne une aide opérationnelle liée au flux de soins, sans inventer de données absentes.",
    params.context?.length ? `Contexte du dossier: ${params.context.slice(0, 6).join(" | ")}` : "",
    `Rôle: ${roleLabel}`,
    `Nom: ${params.userName ?? "Utilisateur"}`,
    `Question: ${params.message}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function medicalChatbot(params: ChatbotParams): Promise<string> {
  const aiText = await askGemini(buildMedicalPrompt(params));
  if (aiText) return aiText;
  return medicalChatbotAnswer(params.message, params.role, params.context);
}

export function medicalChatbotAnswer(message: string, role = "patient", context: string[] = []) {
  const text = normalize(message);
  const contextLine = context.length ? "\n\nContexte récent: " + context.slice(0, 2).join(" | ") : "";

  if (!text) {
    return "Posez votre question de santé. Je peux vous orienter, mais je ne remplace pas une consultation médicale.";
  }

  if (hasAny(text, emergencyWords)) {
    return [
      "Cela peut être une urgence.",
      "Appelez immédiatement le centre au 693904197 sur WhatsApp ou rendez-vous aux urgences.",
      "Si la personne respire mal, perd connaissance, convulse ou saigne beaucoup, ne restez pas seul avec elle.",
    ].join("\n");
  }

  if (hasAny(text, feverWords)) {
    return [
      "Pour une fièvre: hydratez-vous, reposez-vous et surveillez la température.",
      "Consultez rapidement si la fièvre dépasse 39 °C, dure plus de 48 h, ou s'accompagne de vomissements, raideur de nuque, grande fatigue, grossesse ou enfant en bas âge.",
      "Au Cameroun, pensez au paludisme si la fièvre vient avec des frissons: un test est recommandé avant traitement.",
    ].join("\n");
  }

  if (hasAny(text, coughWords)) {
    return [
      "Pour toux/rhume: buvez régulièrement, évitez la fumée et reposez-vous.",
      "Consultez si la toux dure plus de 7 jours, s'il y a douleur thoracique, difficulté à respirer, fièvre persistante ou crachats avec sang.",
      "Ne prenez pas d'antibiotique sans avis médical.",
    ].join("\n");
  }

  if (hasAny(text, painWords)) {
    return [
      "Pour une douleur: notez l'endroit, l'intensité, le début et ce qui l'aggrave.",
      "Consultez vite si la douleur est forte, brutale, au niveau de la poitrine, avec essoufflement, malaise, vomissements persistants ou grossesse.",
      "Évitez l'automédication si vous avez ulcère, maladie rénale, grossesse ou traitement anticoagulant.",
    ].join("\n");
  }

  if (hasAny(text, pregnancyWords)) {
    return [
      "En cas de grossesse ou suspicion, prenez rendez-vous pour une confirmation et un suivi prénatal.",
      "Consultez en urgence si douleurs fortes, saignements, fièvre, vertiges ou diminution des mouvements du bébé.",
      "Ne prenez pas de médicament sans avis d'un professionnel de santé.",
    ].join("\n");
  }

  if (hasAny(text, medicineWords)) {
    return [
      "Respectez l'ordonnance: dose, horaires et durée.",
      "Si vous avez oublié une prise, ne doublez pas la dose sans avis médical.",
      "Signalez rapidement allergie, éruption, gonflement, difficulté à respirer ou effet indésirable important.",
    ].join("\n");
  }

  if (hasAny(text, appointmentWords)) {
    return [
      "Vous pouvez demander un rendez-vous depuis l'onglet Rendez-vous de votre espace patient.",
      "Pour une réponse rapide, contactez le centre sur WhatsApp au 693904197.",
      "Indiquez votre nom, le motif, la date souhaitée et vos symptômes principaux.",
    ].join("\n");
  }

  if (role === "secretaire") {
    return "Orientez le patient selon l'urgence: signes graves vers consultation immédiate, demandes simples vers rendez-vous, et relance WhatsApp au 693904197 si besoin.";
  }

  return [
    "Je peux donner une orientation générale, mais seul un professionnel peut poser un diagnostic.",
    "Décrivez vos symptômes: âge, durée, température, douleur, médicaments pris et antécédents.",
    "Si les symptômes sont importants ou s'aggravent, contactez le centre sur WhatsApp au 693904197.",
    contextLine,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function suggestTreatment(params: {
  chiefComplaint?: string;
  symptoms?: string;
  notes?: string;
}): Promise<string> {
  const message = [params.chiefComplaint, params.symptoms, params.notes].filter(Boolean).join(" ");
  return medicalChatbot({
    role: "medecin",
    message: message || "Aide à la consultation",
    context: ["Aide clinique prudente", "Proposer examens, surveillance et conduite à tenir sans diagnostic définitif"],
  });
}

export async function stockReorderAdvice(
  items: Array<{ name: string; stock: number; threshold: number }>,
): Promise<string> {
  const low = items.filter((i) => i.stock <= i.threshold);
  if (!low.length) return "RAS: aucun article sous le seuil.";
  const prompt = [
    "Tu aides le pharmacien du Centre de Santé 2KC.",
    "À partir des articles sous le seuil, propose une priorité de réapprovisionnement courte.",
    low.map((i) => `${i.name}: stock ${i.stock}, seuil ${i.threshold}`).join("\n"),
  ].join("\n");
  return (
    (await askGemini(prompt, 360)) ??
    low.map((i) => `${i.name}: stock ${i.stock}, seuil ${i.threshold}. Commander en priorité.`).join("\n")
  );
}

export async function financeDailySummary(params: {
  invoicesCount: number;
  paymentsSum: number;
  outstanding: number;
  mobileMoneySum?: number;
}): Promise<string> {
  const fallback = [
    `Factures: ${params.invoicesCount}.`,
    `Encaissements: ${formatFcfa(params.paymentsSum)}.`,
    `Reste à payer: ${formatFcfa(params.outstanding)}.`,
    params.mobileMoneySum != null
      ? `Mobile Money: ${formatFcfa(params.mobileMoneySum)}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    (await askGemini(
      `Résume la journée comptable du Centre de Santé 2KC en 3 lignes et signale le point à suivre.\n${fallback}`,
      260,
    )) ?? fallback
  );
}

export async function nurseCareAdvisor(
  tasks: Array<{ time?: string; act?: string; urgent?: boolean }>,
): Promise<string> {
  const urgent = tasks.filter((t) => t.urgent);
  const fallback = [
    urgent.length ? `Priorité: ${urgent.map((t) => t.act ?? "soin urgent").join(", ")}.` : null,
    "Vérifier les constantes, les horaires de prise et signaler toute aggravation au médecin.",
    "Documenter chaque soin réalisé dans le dossier patient.",
  ]
    .filter(Boolean)
    .join("\n");

  if (!tasks.length) return "RAS: aucune tâche de soin fournie.";
  return (
    (await askGemini(
      `Tu aides l'infirmier du Centre de Santé 2KC. Priorise ces soins en français court:\n${JSON.stringify(tasks)}`,
      300,
    )) ?? fallback
  );
}

export async function patientReminders(params: {
  nextAppointmentIso?: string;
  meds?: Array<{ name: string; dosage?: string; frequency?: string }>;
}): Promise<string> {
  const ap = params.nextAppointmentIso ? new Date(params.nextAppointmentIso).toLocaleString() : null;
  const meds = (params.meds ?? []).map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(" - "));
  return [
    ap ? `Prochain rendez-vous: ${ap}.` : "Aucun rendez-vous à venir dans le dossier.",
    meds.length ? `Médicaments à respecter: ${meds.join("; ")}.` : "Aucun médicament actif trouvé.",
    "Conseil: hydratez-vous, reposez-vous et contactez le centre si les symptômes s'aggravent.",
  ].join("\n");
}

export async function secretaryQueueAdvisor(
  appts: Array<{
    scheduled_at: string;
    status: string;
    reason?: string | null;
    patient?: { first_name: string; last_name: string } | null;
  }>,
): Promise<string> {
  const waiting = appts.filter((a) => a.status === "en_attente");
  if (!appts.length) return "Aucun rendez-vous à traiter.";
  const fallback = [
    `${waiting.length} rendez-vous en attente à confirmer.`,
    "Prioriser les motifs avec douleur, fièvre, grossesse, enfant ou symptômes respiratoires.",
    "Relancer les patients par WhatsApp au 693904197 avec l'heure confirmée.",
  ].join("\n");

  return (
    (await askGemini(
      `Tu aides le secrétariat du Centre de Santé 2KC. Organise cette file de rendez-vous en 3 lignes:\n${JSON.stringify(appts.slice(0, 8))}`,
      320,
    )) ?? fallback
  );
}

export async function directorKpiInsights(params: {
  uniquePatients: number;
  apptCount: number;
  stockValue: number;
  monthRevenue: number;
}): Promise<string> {
  const fallback = [
    `Patients du jour: ${params.uniquePatients}.`,
    `Rendez-vous: ${params.apptCount}.`,
    `Valeur stock: ${formatFcfa(params.stockValue)}.`,
    `Encaissements du mois: ${formatFcfa(params.monthRevenue)}.`,
  ].join("\n");

  return (
    (await askGemini(
      `Analyse ces KPI du Centre de Santé 2KC en français court, avec une action prioritaire:\n${fallback}`,
      280,
    )) ?? fallback
  );
}
