// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { nitro } from "nitro/vite";

const isVercel = !!process.env.VERCEL;

// Cloudflare: custom server entry (src/server.ts). Vercel: Nitro + default TanStack server entry.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode ?? "development", process.cwd(), "");

  return {
    cloudflare: isVercel ? false : undefined,
    plugins: isVercel ? [nitro()] : [],
    tanstackStart: isVercel
      ? {}
      : {
          server: { entry: "server" },
        },
    vite: {
      envDir: process.cwd(),
      envPrefix: ["VITE_"],
      define: {
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL ?? ""),
        "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ""),
      },
    },
  };
});
