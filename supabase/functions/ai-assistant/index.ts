declare const Deno: any;

type Body = {
  prompt?: string;
  model?: string;
  maxOutputTokens?: number;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const apiKey =
      Deno.env.get("api_google") ??
      Deno.env.get("VITE_GEMINI_API_KEY") ??
      Deno.env.get("GEMINI_API_KEY") ??
      Deno.env.get("GOOGLE_GEMINI_API_KEY") ??
      "";
    if (!apiKey) return json(500, { error: "Secret Gemini manquant: api_google" });

    const body = (await req.json()) as Body;
    const prompt = (body.prompt ?? "").trim();
    const model = (body.model ?? "gemini-2.5-flash").trim();
    const maxOutputTokens =
      typeof body.maxOutputTokens === "number" && body.maxOutputTokens > 0
        ? Math.min(Math.round(body.maxOutputTokens), 1200)
        : 420;
    if (!prompt) return json(400, { error: "Prompt manquant" });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens },
        }),
      },
    );

    const payload = await res.json();
    if (!res.ok) {
      return json(res.status, {
        error: payload?.error?.message ?? "Requete Gemini impossible",
        details: payload?.error ?? payload,
      });
    }

    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() ?? "";

    return json(200, { text });
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Erreur inconnue" });
  }
});
