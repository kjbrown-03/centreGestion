import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";

import { useAuth, useAuditLog } from "@/lib/store";
import { homeText, useI18n } from "@/lib/i18n";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "2KC — Centre de Santé · Plateforme médicale moderne" },
      { name: "description", content: "Centre de Santé 2KC : médecine humaine et plateforme moderne pour patients, médecins, infirmiers et personnel d'accueil." },
      { name: "author", content: "Centre 2KC" },
      { property: "og:title", content: "2KC — Centre de Santé" },
      { property: "og:description", content: "Une médecine moderne, humaine et accessible à tous." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const lang = useI18n((s) => s.lang);
  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const user = useAuth((s: { user: any }) => s.user);
  const logout = useAuth((s: { logout: () => void }) => s.logout);
  const touch = useAuth((s: { touch: () => void }) => s.touch);
  const lastActivityAt = useAuth((s: { lastActivityAt: number | null }) => s.lastActivityAt);
  const auditAdd = useAuditLog((s: { add: (e: any) => void }) => s.add);
  const lang = useI18n((s) => s.lang);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const text = homeText[lang].welcome;
    const speak = () => {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === "fr" ? "fr-FR" : "en-US";
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Some browsers block autoplayed speech until the first user interaction.
      }
    };

    speak();
    const timer = window.setTimeout(speak, 80);
    const onFirstInteraction = () => speak();
    window.addEventListener("pointerdown", onFirstInteraction, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onFirstInteraction);
    };
  }, [lang]);

  useEffect(() => {
    const unsub = router.subscribe("onResolved", () => {
      touch();
    });
    return () => {
      unsub();
    };
  }, [router, touch]);

  useEffect(() => {
    const onActivity = () => touch();
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
    };
  }, [touch]);

  useEffect(() => {
    if (!user || !lastActivityAt) return;

    const timeoutMs = 15 * 60 * 1000;
    const tick = () => {
      if (!useAuth.getState().user) return;
      const last = useAuth.getState().lastActivityAt;
      if (last && Date.now() - last > timeoutMs) {
        const actor = useAuth.getState().user;
        auditAdd({
          actorEmail: actor?.email ?? null,
          actorRole: actor?.role ?? null,
          action: "auth.logout",
          target: actor?.email ?? undefined,
          meta: { reason: "inactivity" },
        });
        logout();
      }
    };

    const id = window.setInterval(tick, 15 * 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [user, lastActivityAt, logout, auditAdd]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors closeButton position="top-right" />
    </QueryClientProvider>
  );
}
