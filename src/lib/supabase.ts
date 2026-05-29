import { createClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof createClient> | null = null;
let _envPromise: Promise<{ url: string; anon: string }> | null = null;

function readEnv(key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const metaEnvUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;
  const metaEnvAnon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  const metaEnv = (key === "VITE_SUPABASE_URL" ? metaEnvUrl : metaEnvAnon) as string | undefined;

  const nodeEnvUrl = (globalThis as any)?.process?.env?.VITE_SUPABASE_URL as string | undefined;
  const nodeEnvAnon = (globalThis as any)?.process?.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  const nodeEnv = (key === "VITE_SUPABASE_URL" ? nodeEnvUrl : nodeEnvAnon) as string | undefined;

  return (metaEnv ?? nodeEnv ?? "").toString();
}

function maskValue(value: string, keepStart = 6, keepEnd = 4) {
  if (!value) return "";
  if (value.length <= keepStart + keepEnd + 3) return "***";
  return `${value.slice(0, keepStart)}…${value.slice(-keepEnd)}`;
}

async function readEnvAsync(): Promise<{ url: string; anon: string }> {
  const url = readEnv("VITE_SUPABASE_URL");
  const anon = readEnv("VITE_SUPABASE_ANON_KEY");
  if (url && anon) return { url, anon };

  // Browser fallback: load from a runtime-served JSON file.
  // This bypasses Vite env injection issues.
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/runtime-env.json", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as Partial<Record<string, string>>;
        const runtimeUrl = (json.VITE_SUPABASE_URL ?? "").toString();
        const runtimeAnon = (json.VITE_SUPABASE_ANON_KEY ?? "").toString();
        if (runtimeUrl && runtimeAnon) return { url: runtimeUrl, anon: runtimeAnon };
      }
    } catch {
      // ignore, we'll throw a detailed error below
    }
  }

  return { url, anon };
}

export async function getSupabaseAsync() {
  if (_client) return _client;
  if (!_envPromise) _envPromise = readEnvAsync();

  const { url, anon } = await _envPromise;
  if (!url || !anon) {
    const metaEnv = (import.meta as any)?.env;
    const metaKeys = metaEnv ? Object.keys(metaEnv) : [];
    const nodeKeys = Object.keys(((globalThis as any)?.process?.env ?? {}) as Record<string, string>);

    throw new Error(
      [
        "Missing Supabase env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY",
        `- meta(VITE_SUPABASE_URL): ${maskValue((import.meta as any)?.env?.VITE_SUPABASE_URL ?? "")}`,
        `- meta(VITE_SUPABASE_ANON_KEY): ${maskValue((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY ?? "")}`,
        `- node(process.env.VITE_SUPABASE_URL): ${maskValue((globalThis as any)?.process?.env?.VITE_SUPABASE_URL ?? "")}`,
        `- node(process.env.VITE_SUPABASE_ANON_KEY): ${maskValue((globalThis as any)?.process?.env?.VITE_SUPABASE_ANON_KEY ?? "")}`,
        `- meta keys include VITE_SUPABASE_URL?: ${metaKeys.includes("VITE_SUPABASE_URL")}`,
        `- meta keys include VITE_SUPABASE_ANON_KEY?: ${metaKeys.includes("VITE_SUPABASE_ANON_KEY")}`,
        `- node keys include VITE_SUPABASE_URL?: ${nodeKeys.includes("VITE_SUPABASE_URL")}`,
        `- node keys include VITE_SUPABASE_ANON_KEY?: ${nodeKeys.includes("VITE_SUPABASE_ANON_KEY")}`,
        "- runtime file tried: /runtime-env.json",
      ].join("\n"),
    );
  }

  _client = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

export function getSupabase() {
  if (_client) return _client;

  const supabaseUrl = readEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = readEnv("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    const metaEnv = (import.meta as any)?.env;
    const metaKeys = metaEnv ? Object.keys(metaEnv) : [];
    const nodeKeys = Object.keys(((globalThis as any)?.process?.env ?? {}) as Record<string, string>);

    throw new Error(
      [
        "Missing Supabase env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY",
        `- meta(VITE_SUPABASE_URL): ${maskValue((import.meta as any)?.env?.VITE_SUPABASE_URL ?? "")}`,
        `- meta(VITE_SUPABASE_ANON_KEY): ${maskValue((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY ?? "")}`,
        `- node(process.env.VITE_SUPABASE_URL): ${maskValue((globalThis as any)?.process?.env?.VITE_SUPABASE_URL ?? "")}`,
        `- node(process.env.VITE_SUPABASE_ANON_KEY): ${maskValue((globalThis as any)?.process?.env?.VITE_SUPABASE_ANON_KEY ?? "")}`,
        `- meta keys include VITE_SUPABASE_URL?: ${metaKeys.includes("VITE_SUPABASE_URL")}`,
        `- meta keys include VITE_SUPABASE_ANON_KEY?: ${metaKeys.includes("VITE_SUPABASE_ANON_KEY")}`,
        `- node keys include VITE_SUPABASE_URL?: ${nodeKeys.includes("VITE_SUPABASE_URL")}`,
        `- node keys include VITE_SUPABASE_ANON_KEY?: ${nodeKeys.includes("VITE_SUPABASE_ANON_KEY")}`,
      ].join("\n"),
    );
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _client;
}
