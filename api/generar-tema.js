export default async function handler(req, res) {
  const { industry, style, colors, features, platform } = req.body;

  const prompt = `
Genera un tema completo para ${platform}.
Industria: ${industry}
Estilo: ${style}
Colores: ${colors}
Características: ${features}
Devuelve los archivos como JSON: [{ filename, content }]
  `;

  async function tryOpenRouter() {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-sonnet",
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!r.ok) throw new Error("OpenRouter error");
      const data = await r.json();
      return data;
    } catch (e) {
      return null;
    }
  }

  async function tryGroq() {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!r.ok) throw new Error("Groq error");
      const data = await r.json();
      return data;
    } catch (e) {
      return null;
    }
  }

  async function tryGemini() {
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

      if (!r.ok) throw new Error("Gemini error");
      const data = await r.json();
      return data;
    } catch (e) {
      return null;
    }
  }

  // Fallback chain
  const openrouter = await tryOpenRouter();
  if (openrouter) return res.status(200).json({ provider: "openrouter", data: openrouter });

  const groq = await tryGroq();
  if (groq) return res.status(200).json({ provider: "groq", data: groq });

  const gemini = await tryGemini();
  if (gemini) return res.status(200).json({ provider: "gemini", data: gemini });

  return res.status(500).json({
    error: "Todas las APIs fallaron",
    details: {
      openrouter: openrouter ? "ok" : "fail",
      groq: groq ? "ok" : "fail",
      gemini: gemini ? "ok" : "fail"
    }
  });
}
