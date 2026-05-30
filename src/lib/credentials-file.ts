type CredentialFileParams = {
  email: string;
  password: string;
  role: string;
  fullName?: string;
  source: "inscription_patient" | "admin_creation" | "admin_reset";
};

const STORAGE_KEY = "2kc_credentials_history";

type StoredCredential = CredentialFileParams & {
  createdAt: string;
};

function readHistory(): StoredCredential[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function downloadCredentialsTxt(params: CredentialFileParams) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const entry: StoredCredential = {
    ...params,
    createdAt: new Date().toISOString(),
  };
  const history = [...readHistory(), entry];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

  const content = [
    "Identifiants utilisateurs - Centre de Sante 2KC",
    "=================================================",
    "",
    `Derniere mise a jour: ${new Date().toLocaleString("fr-FR")}`,
    `Nombre de comptes dans ce fichier: ${history.length}`,
    "",
    ...history.flatMap((item, index) => [
      `#${index + 1}`,
      `Source: ${item.source}`,
      `Date de creation: ${new Date(item.createdAt).toLocaleString("fr-FR")}`,
      `Nom: ${item.fullName?.trim() || "-"}`,
      `Email: ${item.email}`,
      `Role: ${item.role}`,
      `Mot de passe: ${item.password}`,
      "",
    ]),
    "",
    "Important: conservez ce fichier dans un endroit securise.",
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "identifiants-utilisateurs-2kc.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
