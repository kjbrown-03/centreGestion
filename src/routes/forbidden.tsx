import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/forbidden")({
  component: Forbidden,
});

function Forbidden() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-[color:var(--navy)]">403</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Accès refusé</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Vous n'avez pas l'autorisation d'accéder à cette page avec votre rôle actuel.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l'accueil
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Se reconnecter
          </Link>
        </div>
      </div>
    </div>
  );
}
