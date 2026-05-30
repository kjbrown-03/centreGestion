type CredentialFileParams = {
  email: string;
  password: string;
  role: string;
  fullName?: string;
  source: "inscription_patient" | "admin_creation" | "admin_reset";
};

function safeFilePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function downloadCredentialsTxt(params: CredentialFileParams) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const createdAt = new Date().toLocaleString("fr-FR");
  const content = [
    "Identifiants utilisateur - Centre de Sante 2KC",
    "================================================",
    "",
    `Source: ${params.source}`,
    `Date de creation: ${createdAt}`,
    "",
    `Nom: ${params.fullName?.trim() || "-"}`,
    `Email: ${params.email}`,
    `Role: ${params.role}`,
    `Mot de passe: ${params.password}`,
    "",
    "Important: conservez ce fichier dans un endroit securise.",
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `identifiants-2kc-${safeFilePart(params.email) || "utilisateur"}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
