const JSZip = require("jszip");
const fs = require("fs");
const path = require("path");
const { Liquid } = require("liquidjs");
const { jsonrepair } = require("jsonrepair");

module.exports = async function handler(req, res) {
  const { industry, style, colors, features } = req.body || {};

  if (!industry || !style) {
    return res.status(400).json({ ok: false, error: "Faltan parámetros básicos" });
  }

  // ---------------------------------------------------------
  // PROMPT BLINDADO ESTABLE + FIX DE SCHEMA
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
REGLAS DE FORMATO OBLIGATORIO PARA EL SCHEMA
────────────────────────────────────────
El schema DEBE seguir EXACTAMENTE este formato:

{% schema %}
{
  "name": "Nombre",
  "settings": [
    {
      "type": "text",
      "id": "heading",
      "label": "Heading"
    }
  ],
  "blocks": [],
  "presets": [
    {
      "name": "Preset"
    }
  ]
}
{% endschema %}

REGLAS OBLIGATORIAS:
- {% schema %} DEBE estar SOLO en una línea.
- El JSON DEBE comenzar en la línea siguiente.
- El JSON DEBE terminar en su propia línea.
- {% endschema %} DEBE estar SOLO en una línea.
- NO permitas schema en una sola línea.
- NO permitas JSON pegado al tag.
- NO permitas schema sin {% endschema %}.
- NO uses JSON Schema.
- NO uses "type": "object".
- NO uses "properties".
- NO uses "required".

────────────────────────────────────────
SECCIÓN 1: custom-hero.l
