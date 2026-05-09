export default async function handler(req, res) {
  const { industry, style, colors, features, platform } = req.body;

  console.log("REQUEST_BODY:", { industry, style, colors, features, platform });

  // Por ahora nos concentramos en Shopify
  const effectivePlatform = platform || "shopify";

  const prompt = `
Eres un experto en desarrollo de temas de Shopify.

DEVUELVE EXCLUSIVAMENTE ESTE ARRAY JSON, SIN CAMBIAR NOMBRES NI CANTIDAD DE ARCHIVOS:

[
  { "filename": "layout/theme.liquid", "content": "..." },
  { "filename": "templates/index.json", "content": "..." },
  { "filename": "sections/header.liquid", "content": "..." },
  { "filename": "sections/footer.liquid", "content": "..." },
  { "filename": "sections/main-hero.liquid", "content": "..." },
  { "filename": "sections/product-grid.liquid", "content": "..." },
  { "filename": "assets/theme.css", "content": "..." },
  { "filename": "config/settings_schema.json", "content": "..." }
]

REGLAS ESTRICTAS:
- NO agregues archivos adicionales.
- NO cambies los nombres.
- NO inventes secciones nuevas.
- NO uses “main-content”, “hero-section”, “grid-section” ni otros nombres.
- SOLO usa los nombres EXACTOS listados arriba.
- El archivo templates/index.json DEBE referenciar EXACTAMENTE esas secciones.
- El JSON debe ser válido y parseable.
- NO incluyas texto fuera del array JSON.
- NO incluyas markdown.


Contexto del tema:
- Plataforma: ${effectivePlatform}
- Industria: ${industry}
- Estilo visual: ${style}
- Colores principales: ${colors}
- Características: ${features}

Requisitos:
- Usa Liquid y JSON válidos.
- El archivo templates/index.json debe referenciar las secciones definidas.
- El CSS debe ser simple pero usable.
- settings_schema.json debe permitir cambiar colores principales y textos básicos.

DEVUELVE ÚNICAMENTE el JSON del array, SIN TEXTO EXPLICATIVO, SIN COMENTARIOS, SIN MARKDOWN.
  `.trim();

  async function tryOpenRouter() {
    console.log("TRY: OpenRouter");
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://generador-temas-ecommerce.vercel.app/",
          "X-Title": "Generador de temas"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.1-70b-instruct",
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!r.ok) {
        console.log("OpenRouter HTTP ERROR:", r.status, await r.text());
        return null;
      }
      const data = await r.json();
      console.log("OpenRouter OK");
      return { provider: "openrouter", data };
    } catch (e) {
      console.log("OpenRouter EXCEPTION:", e.message);
      return null;
    }
  }

  async function tryGroq() {
    console.log("TRY: Groq");
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!r.ok) {
        console.log("Groq HTTP ERROR:", r.status, await r.text());
        return null;
      }
      const data = await r.json();
      console.log("Groq OK");
      return { provider: "groq", data };
    } catch (e) {
      console.log("Groq EXCEPTION:", e.message);
      return null;
    }
  }

  async function tryGemini() {
    console.log("TRY: Gemini");
    try {
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }]
          })
        }
      );

      if (!r.ok) {
        console.log("Gemini HTTP ERROR:", r.status, await r.text());
        return null;
      }
      const data = await r.json();
      console.log("Gemini OK");
      return { provider: "gemini", data };
    } catch (e) {
      console.log("Gemini EXCEPTION:", e.message);
      return null;
    }
  }

  // Fallback chain
  let result = await tryOpenRouter();
  if (!result) result = await tryGroq();
  if (!result) result = await tryGemini();

  if (!result) {
    console.log("ALL PROVIDERS FAILED");
    return res.status(500).json({
      error: "Todas las APIs fallaron",
      details: { openrouter: "fail", groq: "fail", gemini: "fail" }
    });
  }

  const { provider, data } = result;

  // Extraer texto según proveedor
  let raw;
  if (provider === "groq" || provider === "openrouter") {
    raw = data.choices?.[0]?.message?.content;
  } else if (provider === "gemini") {
    raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  console.log("RAW_FROM_PROVIDER:", provider, typeof raw, raw?.slice?.(0, 200));

  // Devolvemos el texto crudo y el provider para depurar
  return res.status(200).json({
    provider,
    raw
  });
}
