import { getSupabaseAsync } from "@/lib/supabase";

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

export async function medicalChatbot(params: ChatbotParams): Promise<string> {
  if (params.role === "patient") {
    try {
      const prompt = [
        "Tu es le chatbot medical du Centre de Sante 2KC au Cameroun.",
        "Reponds en francais simple, avec prudence, sans poser de diagnostic definitif.",
        "Si les symptomes semblent graves, conseille de contacter le centre sur WhatsApp au 693904197 ou d'aller aux urgences.",
        params.context?.length ? `Contexte recent: ${params.context.slice(0, 3).join(" | ")}` : "",
        `Patient: ${params.userName ?? "Patient"}`,
        `Question: ${params.message}`,
      ]
        .filter(Boolean)
        .join("\n");
      const supabase = await getSupabaseAsync();
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { prompt, model: "gemini-2.5-flash" },
      });
      if (error) throw error;
      const text = String((data as any)?.text ?? "").trim();
      if (text) return text;
    } catch {
      // Fallback local si l'Edge Function n'est pas encore deployee.
    }
  }

  return medicalChatbotAnswer(params.message, params.role, params.context);
}

export function medicalChatbotAnswer(message: string, role = "patient", context: string[] = []) {
  const text = normalize(message);
  const contextLine = context.length ? "\n\nContexte recent: " + context.slice(0, 2).join(" | ") : "";

  if (!text) {
    return "Posez votre question de sante. Je peux vous orienter, mais je ne remplace pas une consultation medicale.";
  }

  if (hasAny(text, emergencyWords)) {
    return [
      "Cela peut etre une urgence.",
      "Appelez immediatement le centre au 693904197 sur WhatsApp ou rendez-vous aux urgences.",
      "Si la personne respire mal, perd connaissance, convulse ou saigne beaucoup, ne restez pas seul avec elle.",
    ].join("\n");
  }

  if (hasAny(text, feverWords)) {
    return [
      "Pour une fievre: hydratez-vous, reposez-vous et surveillez la temperature.",
      "Consultez rapidement si la fievre depasse 39°C, dure plus de 48h, s'accompagne de vomissements, raideur de nuque, grande fatigue, grossesse ou enfant en bas age.",
      "Au Cameroun, pensez au paludisme si fievre avec frissons: un test est recommande avant traitement.",
    ].join("\n");
  }

  if (hasAny(text, coughWords)) {
    return [
      "Pour toux/rhume: buvez regulierement, evitez la fumee et reposez-vous.",
      "Consultez si la toux dure plus de 7 jours, s'il y a douleur thoracique, difficulte a respirer, fievre persistante ou crachats avec sang.",
      "Ne prenez pas d'antibiotique sans avis medical.",
    ].join("\n");
  }

  if (hasAny(text, painWords)) {
    return [
      "Pour une douleur: notez l'endroit, l'intensite, le debut et ce qui l'aggrave.",
      "Consultez vite si la douleur est forte, brutale, au niveau de la poitrine, avec essoufflement, malaise, vomissements persistants ou grossesse.",
      "Evitez l'automedication si vous avez ulcere, maladie renale, grossesse ou traitement anticoagulant.",
    ].join("\n");
  }

  if (hasAny(text, pregnancyWords)) {
    return [
      "En cas de grossesse ou suspicion, prenez rendez-vous pour une confirmation et un suivi prenatal.",
      "Consultez en urgence si douleurs fortes, saignements, fievre, vertiges ou diminution des mouvements du bebe.",
      "Ne prenez pas de medicament sans avis d'un professionnel de sante.",
    ].join("\n");
  }

  if (hasAny(text, medicineWords)) {
    return [
      "Respectez l'ordonnance: dose, horaires et duree.",
      "Si vous avez oublie une prise, ne doublez pas la dose sans avis medical.",
      "Signalez rapidement allergie, eruption, gonflement, difficulte a respirer ou effet indesirable important.",
    ].join("\n");
  }

  if (hasAny(text, appointmentWords)) {
    return [
      "Vous pouvez demander un rendez-vous depuis l'onglet Rendez-vous de votre espace patient.",
      "Pour une reponse rapide, contactez le centre sur WhatsApp au 693904197.",
      "Indiquez votre nom, le motif, la date souhaitee et vos symptomes principaux.",
    ].join("\n");
  }

  if (role === "secretaire") {
    return "Orientez le patient selon l'urgence: signes graves vers consultation immediate, demandes simples vers rendez-vous, et relance WhatsApp au 693904197 si besoin.";
  }

  return [
    "Je peux donner une orientation generale, mais seul un professionnel peut poser un diagnostic.",
    "Decrivez vos symptomes: age, duree, temperature, douleur, medicaments pris et antecedents.",
    "Si les symptomes sont importants ou s'aggravent, contactez le centre sur WhatsApp au 693904197.",
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
  return medicalChatbotAnswer(
    [params.chiefComplaint, params.symptoms, params.notes].filter(Boolean).join(" "),
    "medecin",
  );
}

export async function stockReorderAdvice(
  items: Array<{ name: string; stock: number; threshold: number }>,
): Promise<string> {
  const low = items.filter((i) => i.stock <= i.threshold);
  if (!low.length) return "RAS: aucun article sous le seuil.";
  return low
    .map((i) => `${i.name}: stock ${i.stock}, seuil ${i.threshold}. Commander en priorite.`)
    .join("\n");
}

export async function financeDailySummary(params: {
  invoicesCount: number;
  paymentsSum: number;
  outstanding: number;
  mobileMoneySum?: number;
}): Promise<string> {
  return [
    `Factures: ${params.invoicesCount}.`,
    `Encaissements: ${Math.round(params.paymentsSum).toLocaleString("fr-FR")} FCFA.`,
    `Reste a payer: ${Math.round(params.outstanding).toLocaleString("fr-FR")} FCFA.`,
    params.mobileMoneySum != null
      ? `Mobile Money: ${Math.round(params.mobileMoneySum).toLocaleString("fr-FR")} FCFA.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function nurseCareAdvisor(
  tasks: Array<{ time?: string; act?: string; urgent?: boolean }>,
): Promise<string> {
  const urgent = tasks.filter((t) => t.urgent);
  if (!tasks.length) return "RAS: aucune tache de soin fournie.";
  return [
    urgent.length ? `Priorite: ${urgent.map((t) => t.act ?? "soin urgent").join(", ")}.` : null,
    "Verifier les constantes, les horaires de prise et signaler toute aggravation au medecin.",
    "Documenter chaque soin realise dans le dossier patient.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function patientReminders(params: {
  nextAppointmentIso?: string;
  meds?: Array<{ name: string; dosage?: string; frequency?: string }>;
}): Promise<string> {
  const ap = params.nextAppointmentIso ? new Date(params.nextAppointmentIso).toLocaleString() : null;
  const meds = (params.meds ?? []).map((m) =>
    [m.name, m.dosage, m.frequency].filter(Boolean).join(" - "),
  );
  return [
    ap ? `Prochain rendez-vous: ${ap}.` : "Aucun rendez-vous a venir dans le dossier.",
    meds.length ? `Medicaments a respecter: ${meds.join("; ")}.` : "Aucun medicament actif trouve.",
    "Conseil: hydratez-vous, reposez-vous et contactez le centre si les symptomes s'aggravent.",
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
  if (!appts.length) return "Aucun rendez-vous a traiter.";
  return [
    `${waiting.length} rendez-vous en attente a confirmer.`,
    "Prioriser les motifs avec douleur, fievre, grossesse, enfant ou symptomes respiratoires.",
    "Relancer les patients par WhatsApp au 693904197 avec l'heure confirmee.",
  ].join("\n");
}

export async function directorKpiInsights(params: {
  uniquePatients: number;
  apptCount: number;
  stockValue: number;
  monthRevenue: number;
}): Promise<string> {
  return [
    `Patients du jour: ${params.uniquePatients}.`,
    `Rendez-vous: ${params.apptCount}.`,
    `Valeur stock: ${Math.round(params.stockValue).toLocaleString("fr-FR")} FCFA.`,
    `Encaissements du mois: ${Math.round(params.monthRevenue).toLocaleString("fr-FR")} FCFA.`,
  ].join("\n");
}
