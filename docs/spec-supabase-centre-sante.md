---
description: Spécification technique complète (Supabase) — Gestion Centre de Santé 2KC
---

# Spécification Technique — Application Web de Gestion d’un Centre de Santé (2KC)

## 0) Objectifs

- Centraliser : administratif, médical (DME), opérationnel (stock), financier.
- Sécuriser : authentification Supabase, **RLS** (Row Level Security), audit complet.
- Contexte : **Cameroun** (format téléphone +237, devise **XAF**, Mobile Money).

## 1) Architecture Globale

### 1.1 Diagramme (texte)

- **Frontend (React + TanStack Router)**
  - UI + logique métier
  - Supabase JS Client
- **Supabase**
  - Auth (email/password + OTP)
  - Postgres (schéma `app`)
  - Storage (documents médicaux si besoin)
  - Realtime (optionnel : rendez-vous, file d’attente)

Flux :

1. Utilisateur -> UI (login)
2. UI -> `supabase.auth.*` (Auth)
3. UI -> `supabase.from('app.*')` (CRUD)
4. DB applique **RLS** selon `auth.uid()` -> retourne seulement les lignes autorisées.
5. UI affiche résultats.

### 1.2 Sessions & expiration

- Supabase gère le **refresh token**.
- Côté frontend : timer d’inactivité (15 min) + logout (déjà implémenté dans `__root.tsx`).

### 1.3 Sécurité (modèle)

- Toutes les tables `app.*` ont **RLS activé**.
- Les permissions se font via :
  - `app.profiles.role` (rôle applicatif)
  - fonctions SQL `app.has_role(...)`, `app.has_any_role(...)`
- Les pages frontend masquent l’UI, mais **la sécurité réelle est en DB** (RLS).

## 2) Modèle de Données (PostgreSQL)

Le SQL complet est fourni dans : `supabase/schema.sql`.

### 2.1 Entités principales

- `app.profiles` : mapping `auth.users` -> rôle + nom + téléphone.
- `app.patients` : identité patient + `patient_code` auto.
- `app.appointments` : rendez-vous + statut + détection de conflit (unique praticien + horaire).
- `app.consultations` : consultation médicale (DME) liée patient et médecin.
- `app.vitals` : constantes (infirmier).
- `app.prescriptions` / `app.prescription_items` : ordonnance.
- `app.exam_orders` / `app.exam_results` : examens + résultats.
- `app.stock_items` / `app.stock_movements` : pharmacie & consommables + mouvements.
- `app.invoices` / `app.invoice_items` / `app.payments` : facturation & paiements.
- `app.audit_logs` : audit des actions sensibles.

### 2.2 Indices & perfs

- Index sur : patient (nom, téléphone), rendez-vous (patient/praticien/temps), audit (date/action).
- Pagination recommandée : `.range(from, to)` sur Supabase.

## 3) Rôles & Permissions

Rôles : `admin`, `medecin`, `infirmier`, `secretaire`, `comptable`, `pharmacien`, `directeur`, `patient`.

### 3.1 Matrice synthèse

- **Admin** : tout (config, users, logs).
- **Médecin** : consultations, prescriptions, examens.
- **Infirmier** : constantes, consommables.
- **Secrétaire** : patients, rendez-vous, facturation basique.
- **Comptable** : factures, paiements, rapports.
- **Pharmacien** : stock pharmacie, exécution ordonnance.
- **Directeur** : lecture KPIs + stats (lecture seule).
- **Patient** : lecture de son dossier + demandes RDV (si on lie patient->auth user dans une table future).

Les politiques RLS initiales sont incluses dans `schema.sql`.

## 4) Fonctionnalités détaillées

### 4.1 Authentification

#### Connexion
- `supabase.auth.signInWithPassword({ email, password })`
- Gestion tentative échouée :
  - soit DB (table `login_attempts` + trigger),
  - soit client (déjà présent) en attendant.

#### Mot de passe oublié (OTP)

Flux (implémenté côté frontend dans `/forgot-password`) :

1. `signInWithOtp({ email, options: { shouldCreateUser: false } })`
2. L’utilisateur reçoit un **OTP** par email (SMTP à configurer sur Supabase)
3. `verifyOtp({ email, token, type: 'email' })`
4. `updateUser({ password: newPassword })`

Pré-requis Supabase :
- Auth -> Providers -> Email : activer OTP
- SMTP : configurer Gmail (App Password)

### 4.2 Patients

- CRUD patient : secrétaire/admin
- `patient_code` généré via trigger.

### 4.3 RDV

- CRUD RDV : secrétaire/admin
- Conflits : contrainte unique `(practitioner_id, scheduled_at)`.

### 4.4 DME

- Consultation : médecin
- Constantes : infirmier
- Ordonnances : médecin + lecture pharmacien

### 4.5 Finance

- Facture générée après consultation (phase 2 : trigger de génération + items)
- Paiements : comptable
- Devise : XAF
- Moyens : cash, mobile_money, card, bank_transfer.

### 4.6 Audit

- Insertion autorisée aux users connectés
- Lecture uniquement admin
- Frontend : page admin logs (phase 2)

## 5) UI / Wireframes (texte)

### 5.1 Connexion

- Onglet Connexion
  - email
  - password
  - lien `Mot de passe oublié ?` -> `/forgot-password`

### 5.2 Mot de passe oublié

- Step 1 : email -> bouton "Envoyer OTP"
- Step 2 : champ OTP + nouveau mot de passe -> "Changer le mot de passe"

### 5.3 Dashboards par rôle

- Admin : KPIs, alertes stock
- Médecin : agenda + consultations
- Infirmier : tâches + constantes
- Secrétaire : file d’attente + rdv
- Comptable : factures/paiements
- Pharmacien : stock
- Directeur : KPIs (lecture seule)

## 6) Flux applicatifs

- Auth -> redirection route rôle
- Création patient -> création RDV -> consultation -> ordonnance -> facturation -> paiement
- Stock bas -> mouvement d’entrée -> audit

## 7) Configuration Supabase

- Exécuter `supabase/schema.sql` dans SQL Editor.
- Créer les utilisateurs via Auth.
- Remplir `app.profiles` pour associer role/nom.
- Configurer SMTP Gmail App Password.

## 8) Frontend : structure recommandée

- `src/lib/supabase.ts` : client.
- `src/lib/auth.ts` : wrappers (phase 2)
- `src/routes/forgot-password.tsx` : OTP reset.
- `src/components/*` : UI.

## 9) Points critiques sécurité

- RLS obligatoire (déjà dans SQL)
- Jamais exposer de Service Role Key côté client.
- Valider toutes les entrées.
- Audit : conserver `actor_user_id`.

## 10) Données de test

- Patients seeds dans `schema.sql`
- Utilisateurs : à créer dans Supabase Auth UI.
