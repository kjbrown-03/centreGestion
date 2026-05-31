import { Reveal } from "./Reveal";
import { MapPin, Phone } from "lucide-react";
import { CENTRE_PHONE_DISPLAY, WHATSAPP_URL } from "@/lib/contact";

const MAPS_URL =
  "https://maps.google.com/maps?q=Centre+de+Sant%C3%A9+2KC+Douala+Cameroun&t=&z=15&ie=UTF8&iwloc=&output=embed";

export function MapSection() {
  return (
    <section id="localisation" className="py-24 bg-muted/30 border-t">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="max-w-2xl mb-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-[color:var(--mint)]">
              Nous trouver
            </p>
            <h2 className="mt-3 text-4xl sm:text-5xl font-bold text-[color:var(--navy)]">
              Centre de Santé 2KC — Douala
            </h2>
            <div className="mt-5 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <MapPin className="size-4 text-[color:var(--mint)]" />
                Douala, Cameroun
              </span>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 hover:text-[color:var(--navy)] transition"
              >
                <Phone className="size-4 text-[color:var(--mint)]" />
                {CENTRE_PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="overflow-hidden rounded-3xl border bg-card shadow-sm h-[420px]">
            <iframe
              title="Localisation Centre de Santé 2KC sur Google Maps"
              src={MAPS_URL}
              className="size-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
