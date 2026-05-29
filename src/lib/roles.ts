import type { Role } from "./store";

export const ROLES: { id: Role; label: string; tagline: string; route: string }[] = [
  { id: "admin", label: "Administrateur", tagline: "Pilotage global & pharmacie", route: "/admin" },
  { id: "medecin", label: "Médecin", tagline: "Consultations & dossiers", route: "/medecin" },
  { id: "infirmier", label: "Infirmier·ère", tagline: "Soins & constantes", route: "/infirmier" },
  { id: "secretaire", label: "Secrétaire", tagline: "Accueil & rendez-vous", route: "/secretaire" },
  { id: "comptable", label: "Comptable", tagline: "Facturation & paiements", route: "/comptable" },
  { id: "pharmacien", label: "Pharmacien", tagline: "Stock & délivrance", route: "/pharmacien" },
  { id: "directeur", label: "Directeur", tagline: "Statistiques & pilotage", route: "/directeur" },
  { id: "patient", label: "Patient", tagline: "Espace santé & ordonnances", route: "/patient" },
];

export const roleLabel = (r: Role) => ROLES.find((x) => x.id === r)?.label ?? r;
