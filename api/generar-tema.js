import JSZip from "jszip";

export default async function handler(req, res) {
  const { industry, style, colors, features, platform } = req.body;

  console.log("REQUEST_BODY:", { industry, style, colors, features, platform });

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
- SOLO usa los nombres EXACTOS listados arriba.
- El archivo templates/index.json DEBE referenciar EXACTAMENTE esas secciones.
- El JSON debe ser válido y parseable.
- NO incluyas texto fuera del array JSON.
- NO incluyas markdown.

Contexto:
Industria: ${industry}
Estilo: ${style}
Colores: ${colors}
Características: ${features}
  `.trim();

  // -------------------------------
  // PROVEEDORES
  // -------------------------------

  async function tryOpenRouter() {
    console.log("TRY: OpenRouter");
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://generador-temas-ecommerce.vercel.app",
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
      return { provider: "openrouter", raw: data.choices?.[0]?.message?.content };
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
      return { provider: "groq", raw: data.choices?.[0]?.message?.content };
    } catch (e) {
      console.log("Groq EXCEPTION:", e.message);
      return null;
    }
  }

  async function tryGemini() {
    console.log("TRY: Gemini");
    try {
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
          process.env.GEMINI_API_KEY,
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
      return { provider: "gemini", raw: data.candidates?.[0]?.content?.parts?.[0]?.text };
    } catch (e) {
      console.log("Gemini EXCEPTION:", e.message);
      return null;
    }
  }

  // -------------------------------
  // FALLBACK
  // -------------------------------

  let result = await tryOpenRouter();
  if (!result) result = await tryGroq();
  if (!result) result = await tryGemini();

  if (!result) {
    console.log("ALL PROVIDERS FAILED");
    return res.status(500).json({
      error: "Todas las APIs fallaron",
      ok: false
    });
  }

  const { provider, raw } = result;

  console.log("RAW_FROM_PROVIDER:", provider, raw?.slice?.(0, 200));

  // -------------------------------
  // VALIDAR JSON
  // -------------------------------

  let files;
  try {
    files = JSON.parse(raw);
  } catch (e) {
    console.log("JSON PARSE ERROR:", e.message);
    return res.status(500).json({
      ok: false,
      error: "JSON inválido devuelto por la IA",
      provider,
      rawSnippet: raw?.slice?.(0, 500)
    });
  }

  // -------------------------------
  // GENERAR ZIP
  // -------------------------------

  const zip = new JSZip();

  files.forEach(file => {
    if (file?.filename && file?.content !== undefined) {
      zip.file(file.filename, file.content);
    }
  });

  const zipContent = await zip.generateAsync({ type: "nodebuffer" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=shopify-theme.zip");

  console.log("ZIP_GENERATED_OK by", provider);

  return res.send(zipContent);
}
