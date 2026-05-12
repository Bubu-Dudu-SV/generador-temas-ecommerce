import JSZip from "jszip";
import fs from "fs";
import path from "path";
import { Liquid } from "liquidjs";
import { jsonrepair } from "jsonrepair";

export default async function handler(req, res) {
  const { industry, style, colors, features } = req.body;

  // -------------------------------
  // PROMPT BLINDADO
  // -------------------------------
  const prompt = `
Eres un experto en desarrollo de temas Shopify OS 2.0.

Debes generar EXCLUSIVAMENTE estos 4 archivos:

[
  { "filename": "sections/custom-hero.liquid", "content": "..." },
  { "filename": "sections/custom-product-grid.liquid", "content": "..." },
  { "filename": "templates/index.json", "content": "..." },
  { "filename": "assets/custom.css", "content": "..." }
]

REGLAS ESTRICTAS:
- NO inventes secciones que no estén listadas.
- NO inventes variables Liquid.
- NO uses loops inexistentes.
- NO uses "main-content" ni secciones de Dawn que no existan.
- Liquid debe ser válido.
- JSON debe ser válido y parseable.
- index.json debe incluir "sections" y "order".
- Usa Dawn como referencia oficial.
- NO incluyas texto fuera del array JSON.

Contexto:
Industria: ${industry}
Estilo: ${style}
Colores: ${colors}
Características: ${features}
`.trim();

  // -------------------------------
  // PROVEEDORES (OpenRouter → Groq)
  // -------------------------------
  async function callProvider(url, payload, headers, providerName) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!r.ok) return null;

      const data = await r.json();
      return { provider: providerName, raw: data.choices?.[0]?.message?.content };
    } catch {
      return null;
    }
  }

  let result =
    await callProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      { model: "meta-llama/llama-3.1-70b-instruct", messages: [{ role: "user", content: prompt }] },
      {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      "openrouter"
    ) ||
    await callProvider(
      "https://api.groq.com/openai/v1/chat/completions",
      { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }] },
      {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      "groq"
    );

  if (!result) {
    return res.status(500).json({ ok: false, error: "Todas las APIs fallaron" });
  }

  let { raw } = result;

  // -------------------------------
  // REPARAR JSON
  // -------------------------------
  try {
    raw = jsonrepair(raw);
  } catch {}

  // -------------------------------
  // PARSEAR JSON
  // -------------------------------
  let files;
  try {
    files = JSON.parse(raw);
  } catch {
    return res.status(500).json({ ok: false, error: "JSON inválido", raw });
  }

  // -------------------------------
  // FILTRAR ELEMENTOS INVÁLIDOS
  // -------------------------------
  if (!Array.isArray(files)) {
    return res.status(500).json({
      ok: false,
      error: "La IA no devolvió un array JSON",
      raw
    });
  }

  files = files.filter(f =>
    f &&
    typeof f === "object" &&
    typeof f.filename === "string" &&
    typeof f.content === "string"
  );

  if (files.length === 0) {
    return res.status(500).json({
      ok: false,
      error: "La IA devolvió un array vacío o inválido",
      raw
    });
  }

  // -------------------------------
  // VALIDAR LIQUID
  // -------------------------------
  const engine = new Liquid();
  for (const f of files) {
    if (typeof f.filename === "string" && f.filename.endsWith(".liquid")) {
      try {
        await engine.parse(f.content);
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: "Liquid inválido",
          filename: f.filename,
          message: err.message
        });
      }
    }
  }

  // -------------------------------
  // GENERAR ZIP
  // -------------------------------
  const zip = new JSZip();

  // 1. Copiar Dawn completo
  const dawnPath = path.join(process.cwd(), "base-theme", "dawn");

  function addFolderToZip(folderPath, zipFolder) {
    const items = fs.readdirSync(folderPath);
    for (const item of items) {
      const fullPath = path.join(folderPath, item);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        addFolderToZip(fullPath, zipFolder.folder(item));
      } else {
        zipFolder.file(item, fs.readFileSync(fullPath));
      }
    }
  }

  addFolderToZip(dawnPath, zip);

  // 2. Sobrescribir con archivos generados por IA
  files.forEach(file => {
    zip.file(file.filename, file.content);
  });

  const zipContent = await zip.generateAsync({ type: "nodebuffer" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=shopify-theme.zip");
  return res.send(zipContent);
}
