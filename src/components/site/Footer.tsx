import { Activity, Mail, MapPin, Phone } from "lucide-react";
import { CENTRE_PHONE_DISPLAY, WHATSAPP_URL } from "@/lib/contact";

export function Footer() {
  return (
    <footer id="contact" className="bg-[color:var(--navy)] text-white pt-24 pb-10">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid md:grid-cols-3 gap-12">
          <div>
            <div className="flex items-center gap-2 font-display font-bold text-2xl">
              <span className="size-10 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)]">
                <Activity className="size-5" strokeWidth={2.5} />
              </span>
              2KC
            </div>
            <p className="mt-4 text-white/65 max-w-sm">
              Le Centre de Santé 2KC, pour une médecine moderne, humaine et accessible au Cameroun.
            </p>
          </div>
          <div className="space-y-3 text-white/80">
            <div className="flex items-start gap-3"><MapPin className="size-4 mt-0.5 text-[color:var(--mint)]" /> Douala, Cameroun</div>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-white transition">
              <Phone className="size-4 text-[color:var(--mint)]" /> WhatsApp {CENTRE_PHONE_DISPLAY}
            </a>
            <div className="flex items-center gap-3"><Mail className="size-4 text-[color:var(--mint)]" /> contact@2kc-sante.cm</div>
          </div>
          <div>
            <p className="font-semibold mb-3">Horaires</p>
            <p className="text-white/65 text-sm">Lun - Ven: 7h30 - 20h<br />Sam: 8h - 18h<br />Dim: 9h - 13h urgences</p>
          </div>
        </div>
        <div className="mt-16 border-t border-white/10 pt-6 text-center text-xs text-white/40">
          (c) {new Date().getFullYear()} Centre de Santé 2KC. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
