import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, CheckCircle2, MapPin, Phone } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { CENTRE_PHONE_DISPLAY, GOOGLE_MAPS_EMBED_URL, WHATSAPP_URL } from "@/lib/contact";

export const Route = createFileRoute("/centre")({
  component: CentrePage,
});

function CentrePage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="relative overflow-hidden bg-[color:var(--navy)] text-white pt-36 pb-20">
        <div className="absolute inset-0 opacity-30">
          <img
            src="https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=1800&q=80"
            alt="Centre de santé 2KC"
            className="size-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-[color:var(--navy)]/75" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <ArrowLeft className="size-4" /> Retour
          </Link>
          <div className="mt-10 max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="size-12 rounded-2xl gradient-mint grid place-items-center text-[color:var(--navy)]">
                <Activity className="size-6" />
              </span>
              <p className="text-sm uppercase tracking-widest text-[color:var(--mint)]">Centre de Santé 2KC</p>
            </div>
            <h1 className="mt-6 text-4xl sm:text-6xl font-bold leading-tight">
              Un centre camerounais pensé pour un parcours de soins fluide.
            </h1>
            <p className="mt-6 text-lg text-white/75 leading-relaxed">
              2KC centralise l'accueil, les rendez-vous, le dossier médical, la pharmacie,
              la facturation en FCFA et le suivi patient pour aider chaque acteur du centre à
              travailler avec des données fiables et sécurisées.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 grid lg:grid-cols-3 gap-6">
          {[
            "Accueil et rendez-vous connectés à Supabase",
            "Dossier patient, prescriptions et examens sécurisés par RLS",
            "Stock pharmacie et facturation adaptes au FCFA",
            "Notifications ciblées par rôle dans chaque tableau de bord",
            "Espace patient avec rendez-vous, ordonnances, factures et messagerie",
            "Administration des utilisateurs et rôles depuis la base",
          ].map((item) => (
            <div key={item} className="rounded-2xl border bg-card p-5 flex gap-3">
              <CheckCircle2 className="size-5 text-[color:var(--mint)] shrink-0 mt-0.5" />
              <p className="text-sm text-[color:var(--navy)]">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 rounded-3xl border bg-card p-6 sm:p-8 grid md:grid-cols-2 gap-6">
          <div className="flex gap-3">
            <MapPin className="size-5 text-[color:var(--mint)] shrink-0" />
            <div>
              <p className="font-semibold text-[color:var(--navy)]">Localisation</p>
              <p className="text-sm text-muted-foreground">Douala, Cameroun</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Phone className="size-5 text-[color:var(--mint)] shrink-0" />
            <div>
              <p className="font-semibold text-[color:var(--navy)]">Contact</p>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-[color:var(--navy)]">
                WhatsApp {CENTRE_PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-[color:var(--mint)]">
              Nous trouver
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-[color:var(--navy)]">
              Centre de Santé 2KC à Douala
            </h2>
          </div>
          <div className="overflow-hidden rounded-3xl border bg-card h-[420px]">
            <iframe
              title="Carte Google Maps du Centre de Santé 2KC"
              src={GOOGLE_MAPS_EMBED_URL}
              className="size-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
