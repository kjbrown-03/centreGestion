import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Lang = "fr" | "en";

const safeStorage = createJSONStorage(() =>
  typeof window !== "undefined"
    ? window.localStorage
    : ({ getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage),
);

type I18nState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
};

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      lang: "fr",
      setLang: (lang) => set({ lang }),
      toggleLang: () => set({ lang: get().lang === "fr" ? "en" : "fr" }),
    }),
    { name: "2kc-lang", storage: safeStorage },
  ),
);

export const homeText = {
  fr: {
    navServices: "Services",
    navAbout: "À propos",
    navTeam: "Équipe",
    navContact: "Contact",
    login: "Connexion",
    signup: "S'inscrire",
    badge: "Centre de Santé 2KC - Agréé & certifié",
    h1a: "Soigner.",
    h1b: "Accompagner.",
    h1c: "Réinventer.",
    heroCopy: "Une médecine humaine et précise, augmentée par une plateforme moderne. Vos équipes et vos patients, au même endroit.",
    cta: "Accéder à mon espace",
    discover: "Découvrir le centre",
    patients: "+12 000 patients suivis",
    care: "Soins & Prévention",
    open: "Ouvert 7j/7",
    welcome: "Bienvenue dans notre application de gestion de centre de santé.",
  },
  en: {
    navServices: "Services",
    navAbout: "About",
    navTeam: "Team",
    navContact: "Contact",
    login: "Login",
    signup: "Sign up",
    badge: "2KC Health Centre - Licensed & certified",
    h1a: "Care.",
    h1b: "Support.",
    h1c: "Reinvent.",
    heroCopy: "Human, precise healthcare enhanced by a modern platform. Your teams and patients in one place.",
    cta: "Open my space",
    discover: "Discover the centre",
    patients: "+12,000 patients followed",
    care: "Care & Prevention",
    open: "Open 7 days",
    welcome: "Welcome to our health centre management application.",
  },
};
