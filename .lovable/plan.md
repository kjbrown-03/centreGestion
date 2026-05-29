# 2KC — Centre de Santé

App front-only ultra-polie pour gérer un centre de santé, avec login simulé, 4 dashboards par rôle, pharmacie CRUD et un home immersif.

## Direction visuelle (Medical Trust)

- Palette : `#0a1f3d` (deep navy), `#1e5fa8` (medical blue), `#22c5a8` (mint accent), `#f1f6fb` (clinical white)
- Typo : **Plus Jakarta Sans** (headings) + **Inter** (body)
- Style : glassmorphism léger, ombres douces bleutées, coins arrondis 16-24px, gradients navy→mint sur les CTA
- Iconographie : Lucide (Stethoscope, Pill, Calendar, Users, Activity…)
- Tokens HSL centralisés dans `index.css` + `tailwind.config.ts` (pas de couleurs en dur)

## Animations (couper le souffle)

- **Framer Motion** pour transitions de pages, stagger sur cartes, parallax léger
- Hero : vidéo full-bleed Coverr/Pexels (médecine — chirurgien, stethoscope) + overlay gradient navy, titre qui se révèle mot par mot, scroll-indicator pulsant
- Sections "feature" en reveal au scroll (IntersectionObserver + Framer)
- Compteurs animés (patients suivis, médecins, années…)
- Hover 3D tilt sur les cartes de rôle
- Loader/transition entre login → dashboard (fondu + scale)
- Particules subtiles en fond du hero (canvas léger ou CSS)

## Pages & structure

```text
/                       Landing publique (hero vidéo, à propos, services, équipe, contact, CTA login)
/login                  Login simulé : choisir un rôle (Admin / Médecin / Infirmier / Secrétaire)
/admin                  Dashboard admin (KPIs, accès pharmacie, gestion staff)
/admin/pharmacie        CRUD médicaments (liste, ajouter, éditer, supprimer, recherche, filtre catégorie, stock bas)
/medecin                Dashboard médecin (RDV du jour, patients, consultations récentes)
/infirmier              Dashboard infirmier (soins planifiés, constantes, alertes)
/secretaire             Dashboard secrétaire (agenda RDV, accueil patients, files d'attente)
```

Layout dashboard partagé : sidebar fixe (logo 2KC, nav par rôle, profil en bas) + topbar (recherche, notifications, avatar) + zone contenu animée.

## Données (front-only)

- Tout en mémoire via Zustand + persistance localStorage
- Seed initial : ~12 médicaments, ~8 patients, ~10 RDV, ~6 membres staff
- Pharmacie CRUD : nom, catégorie, stock, prix, seuil d'alerte, date d'expiration, image (URL Unsplash)
- Auth simulée : sélection du rôle → stockage localStorage → guard de routes

## Composants clés

- `Hero` (vidéo + overlay + texte animé)
- `RoleCard` (carte de sélection rôle avec tilt)
- `DashboardLayout` (sidebar + topbar)
- `StatCard` (KPI animé avec compteur)
- `MedicineTable` + `MedicineFormDialog` (CRUD pharmacie, shadcn Dialog + Form)
- `AppointmentList`, `PatientList`, `CareSchedule` (par rôle)
- `AnimatedSection` (wrapper reveal au scroll)

## Détails techniques

- Stack : Vite + React + TS + Tailwind + shadcn/ui + Framer Motion + Zustand + React Router + Lucide + react-hook-form + zod + sonner (toasts)
- Vidéo hero : URL Coverr libre (medical/hospital), `<video autoplay muted loop playsinline>` + fallback poster
- Images : Unsplash (médicaments, équipe, hero secondaire) — URLs directes optimisées
- Accessibilité : focus visibles, contrastes AA, `prefers-reduced-motion` respecté
- SEO : title, meta description, H1 unique, alt sur toutes les images, lang="fr"
- Pas de backend, pas de Lovable Cloud

## Hors scope (v1)

- Vraie auth / base de données
- Notifications temps réel
- Génération PDF / export
- Multi-langue

Prêt à construire dès validation.