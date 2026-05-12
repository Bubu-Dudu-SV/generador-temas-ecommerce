import JSZip from "jszip";
import fs from "fs";
import path from "path";
import { Liquid } from "liquidjs";
import { jsonrepair } from "jsonrepair";

export default async function handler(req, res) {
  const { industry, style, colors, features } = req.body || {};

  if (!industry || !style) {
    return res.status(400).json({ ok: false, error: "Faltan parámetros básicos" });
  }

  const prompt = `
Eres un experto en desarrollo de temas Shopify OS 2.0 con experiencia real en Dawn.

Debes generar EXCLUSIVAMENTE este array JSON:

[
  { "filename": "sections/custom-hero.liquid", "content": "..." },
  { "filename": "sections/custom-product-grid.liquid", "content": "..." },
  { "filename": "templates/index.json", "content": "..." },
  { "filename": "assets/custom.css", "content": "..." }
]

REGLAS:
- No generes archivos adicionales.
- No cambies los nombres.
- No agregues texto fuera del array JSON.
- No uses markdown.
- JSON debe ser válido y parseable.
- Liquid debe ser válido.

Contexto:
Industria: ${industry}
Estilo visual: ${style}
Colores principales: ${colors}
Características deseadas: ${features}
`.trim();

  async function callProvider(url, payload, headers, providerName) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!r.ok) {
        console.log(providerName, "HTTP ERROR", r.status, await r.text());
        return null;
      }

      const data = await r.json();
      const raw = data.choices?.[0]?.message?.content;
      console.log(providerName, "RAW_SNIPPET:", raw?.slice?.(0, 200));
      return { provider: providerName, raw };
    } catch (e) {
      console.log(providerName, "EXCEPTION:", e.message);
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

  // Reparar JSON si viene con texto extra
  try {
    raw = jsonrepair(raw);
  } catch (e) {
    console.log("JSONREPAIR ERROR:", e.message);
  }

  let files;
  try {
    files = JSON.parse(raw);
  } catch (e) {
    console.log("JSON PARSE ERROR:", e.message);
    return res.status(500).json({ ok: false, error: "JSON inválido devuelto por la IA", rawSnippet: raw?.slice?.(0, 400) });
  }

  if (!Array.isArray(files)) {
    console.log("FILES NO ES ARRAY:", typeof files);
    return res.status(500).json({ ok: false, error: "La IA no devolvió un array JSON", rawSnippet: raw?.slice?.(0, 400) });
  }

  // Filtrar basura
  files = files.filter(
    f =>
      f &&
      typeof f === "object" &&
      typeof f.filename === "string" &&
      typeof f.content === "string"
  );

  if (files.length === 0) {
    console.log("FILES VACÍO TRAS FILTRO");
    return res.status(500).json({ ok: false, error: "La IA devolvió un array vacío o inválido", rawSnippet: raw?.slice?.(0, 400) });
  }

  // Validar Liquid
  const engine = new Liquid();
  for (const f of files) {
    if (f.filename.endsWith(".liquid")) {
      try {
        await engine.parse(f.content);
      } catch (err) {
        console.log("LIQUID ERROR EN", f.filename, err.message);
        return res.status(500).json({
          ok: false,
          error: "Liquid inválido",
          filename: f.filename,
          message: err.message
        });
      }
    }
  }

  // Generar ZIP
  const zip = new JSZip();

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

  files.forEach(file => {
    zip.file(file.filename, file.content);
  });

  const zipContent = await zip.generateAsync({ type: "nodebuffer" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=shopify-theme.zip");
  return res.send(zipContent);
}
