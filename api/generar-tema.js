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

  // ---------------------------------------------------------
  // PROMPT BLINDADO (VERSIÓN ESTABLE, NO ULTRA)
  // ---------------------------------------------------------
  const prompt = `
Eres un experto en desarrollo de temas Shopify OS 2.0 con experiencia real en Dawn.

Debes generar EXCLUSIVAMENTE este array JSON:

[
  { "filename": "sections/custom-hero.liquid", "content": "..." },
  { "filename": "sections/custom-product-grid.liquid", "content": "..." },
  { "filename": "templates/index.json", "content": "..." },
  { "filename": "assets/custom.css", "content": "..." }
]

NO generes archivos adicionales.
NO cambies los nombres.
NO agregues texto fuera del array JSON.
NO uses markdown.
NO expliques nada.

────────────────────────────────────────
REGLAS PARA SECCIONES SHOPIFY
────────────────────────────────────────
El schema de una sección Shopify SIEMPRE debe seguir este formato:

{% schema %}
{
  "name": "Nombre de la sección",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading" }
  ],
  "blocks": [],
  "presets": [{ "name": "Preset" }]
}
{% endschema %}

REGLAS:
- NO uses JSON Schema.
- NO uses "type": "object".
- NO uses "properties".
- NO uses "required".
- NO uses estructuras que no existan en Shopify.
- SOLO usa settings válidos: text, textarea, image_picker, url, checkbox, select, range, color.

────────────────────────────────────────
SECCIÓN 1: custom-hero.liquid
────────────────────────────────────────
Debe incluir:
- Título
- Subtítulo
- Imagen
- Botón

────────────────────────────────────────
SECCIÓN 2: custom-product-grid.liquid
────────────────────────────────────────
Debe:
- Permitir elegir una colección
- Mostrar productos con:
  - product.title
  - product.url
  - product.featured_image
  - product.price

NO inventes loops.
NO inventes variables.

────────────────────────────────────────
TEMPLATE index.json
────────────────────────────────────────
Debe ser EXACTAMENTE:

{
  "sections": {
    "hero": { "type": "custom-hero", "settings": {} },
    "grid": { "type": "custom-product-grid", "settings": {} }
  },
  "order": ["hero", "grid"]
}

────────────────────────────────────────
CSS
────────────────────────────────────────
- Estilos simples
- NO frameworks
- NO @import

────────────────────────────────────────
CONTEXTO DEL USUARIO
────────────────────────────────────────
Industria: ${industry}
Estilo visual: ${style}
Colores principales: ${colors}
Características deseadas: ${features}
`.trim();

  // ---------------------------------------------------------
  // PROVEEDORES (OpenRouter → Groq)
  // ---------------------------------------------------------
  async function callProvider(url, payload, headers, providerName) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!r.ok) {
        console.log(providerName, "HTTP ERROR", r.status);
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

  // ---------------------------------------------------------
  // REPARAR JSON
  // ---------------------------------------------------------
  try {
    raw = jsonrepair(raw);
  } catch (e) {
    console.log("JSONREPAIR ERROR:", e.message);
  }

  // ---------------------------------------------------------
  // PARSEAR JSON
  // ---------------------------------------------------------
  let files;
  try {
    files = JSON.parse(raw
