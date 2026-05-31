import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "2kc-pwa-dismissed";

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      void navigator.serviceWorker?.getRegistrations?.().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
      void window.caches?.keys?.().then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))));
      return;
    }

    // Déjà installée (mode standalone) → ne rien afficher
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    // Déjà refusée récemment ?
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;

    // Détection iOS (Safari ne supporte pas beforeinstallprompt)
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    if (ios) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installed = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    setShowIOSHelp(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  async function install() {
    if (isIOS) {
      setShowIOSHelp(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] sm:left-auto sm:right-4 sm:bottom-4 sm:w-[380px]">
      <div className="rounded-2xl border bg-card shadow-lg overflow-hidden">
        {showIOSHelp || isIOS ? (
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-[color:var(--navy)]">
                Installer sur iPhone / iPad
              </p>
              <button onClick={dismiss} aria-label="Fermer" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                1. Touchez <Share className="size-4 inline text-[color:var(--navy)]" /> Partager (en bas de Safari)
              </li>
              <li>2. Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong></li>
              <li>3. Touchez <strong>« Ajouter »</strong> en haut à droite</li>
            </ol>
          </div>
        ) : (
          <div className="p-4 flex items-center gap-3">
            <div className="size-11 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)] shrink-0">
              <Download className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[color:var(--navy)]">Installer l'application 2KC</p>
              <p className="text-xs text-muted-foreground">
                Accès rapide depuis votre écran d'accueil, sans navigateur.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                onClick={() => void install()}
                className="rounded-xl gradient-mint text-[color:var(--navy)] text-xs font-semibold px-3 py-2 hover:brightness-110 transition"
              >
                Installer
              </button>
              <button
                onClick={dismiss}
                className="rounded-xl border text-xs text-muted-foreground px-3 py-1.5 hover:bg-muted transition"
              >
                Plus tard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
