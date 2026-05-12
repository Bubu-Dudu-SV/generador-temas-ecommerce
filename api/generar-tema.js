import JSZip from "jszip";
import fs from "fs";
import path from "path";
import { Liquid } from "liquidjs";
import { jsonrepair } from "jsonrepair";

export default async function handler(req, res) {
  const { industry, style, colors, features } = req.body;

  // -------------------------------
  // PROMPT ULTRA‑BLINDADO
  // -------------------------------
  const prompt = `
Eres un experto en desarrollo de temas Shopify OS 2.0 con experiencia real en Dawn.

Tu tarea es generar EXCLUSIVAMENTE los siguientes 4 archivos:

[
  { "filename": "sections/custom-hero.liquid", "content": "..." },
  { "filename": "sections/custom-product-grid.liquid", "content": "..." },
  { "filename": "templates/index.json", "content": "..." },
  { "filename": "assets/custom.css", "content": "..." }
]

NO generes ningún archivo adicional.
NO cambies los nombres.
NO agregues propiedades extra.
NO incluyas texto fuera del array JSON.
NO uses markdown.
NO expliques nada.
NO agregues comentarios.
NO agregues texto antes o después del array.

────────────────────────────────────────
REGLAS ABSOLUTAS SOBRE LIQUID
────────────────────────────────────────
Solo puedes usar variables, objetos y filtros válidos de Shopify OS 2.0.

OBJETOS PERMITIDOS:
product, collection, article, blog, cart, customer, localization,
routes, shop, settings, request, section, block

OBJETOS PROHIBIDOS:
products, collections, all_products, shop.products, shop.collections,
pages, blogs, linklists, cualquier objeto no listado arriba

FILTROS PERMITIDOS:
escape, json, money, money_with_currency, img_url, image_url,
asset_url, t, default, upcase, downcase, capitalize, slice,
replace, replace_first

FILTROS PROHIBIDOS:
map, where, sort, uniq, compact, cualquier filtro no listado arriba

REGLAS DE LOOPS:
Solo puedes iterar sobre:
- collection.products
- section.blocks

NO uses loops sobre arrays inventados.

REGLAS DE VARIABLES:
Solo puedes usar:
- section.settings
- section.blocks
- block.settings

NO inventes settings.
NO inventes bloques.
NO inventes propiedades.

────────────────────────────────────────
REGLAS SOBRE SECCIONES
────────────────────────────────────────
Debes generar SOLO estas dos secciones:

1. sections/custom-hero.liquid  
   - título, subtítulo, imagen, botón
   - compatible con Theme Editor

2. sections/custom-product-grid.liquid  
   - mostrar productos de una colección
   - usar SOLO collection.products
   - NO inventar propiedades

────────────────────────────────────────
LISTA COMPLETA DE SECCIONES VÁLIDAS DE DAWN
────────────────────────────────────────
announcement-bar, apps, bulk-quick-order-list, cart-drawer,
cart-icon-bubble, cart-live-region-text, cart-notification-button,
cart-notification-product, collage, collapsible-content,
collection-list, contact-form, custom-liquid, email-signup-banner,
featured-blog, featured-collection, featured-product, footer-group,
footer, header-group, header, image-banner, image-with-text,
main-404, main-account, main-activate-account, main-addresses,
main-article, main-blog, main-cart-footer, main-cart-items,
main-collection-banner, main-collection-product-grid,
main-list-collections, main-login, main-order, main-page,
main-password-footer, main-password-header, main-product,
main-register, main-reset-password, main-search, multicolumn,
multirow, newsletter, page, pickup-availability, predictive-search,
quick-order-list, related-products, rich-text, slideshow, video

NO uses ninguna sección fuera de esta lista EXCEPTO:
- custom-hero
- custom-product-grid

────────────────────────────────────────
LISTA COMPLETA DE SNIPPETS VÁLIDOS DE DAWN
────────────────────────────────────────
article-card, buy-buttons, card-collection, card-product,
cart-drawer, cart-notification, country-localization, facets,
gift-card-recipient-form, header-drawer, header-dropdown-menu,
header-mega-menu, header-search, icon-accordion, icon-with-text,
language-localization, loading-spinner, meta-tags, pagination,
price-facet, price, product-media-gallery, product-media-modal,
product-media, product-thumbnail, product-variant-options,
product-variant-picker, progress-bar, quantity-input,
quick-order-list-row, quick-order-list, quick-order-product-row,
share-button, social-icons, swatch-input, swatch, unit-price

NO uses snippets fuera de esta lista.

────────────────────────────────────────
REGLAS PARA templates/index.json
────────────────────────────────────────
Debe tener EXACTAMENTE:

{
  "sections": {
    "hero": { "type": "custom-hero", "settings": {} },
    "grid": { "type": "custom-product-grid", "settings": {} }
  },
  "order": ["hero", "grid"]
}

────────────────────────────────────────
REGLAS PARA assets/custom.css
────────────────────────────────────────
- Estilos simples
- NO @import
- NO frameworks
- NO Tailwind
- NO Bootstrap

────────────────────────────────────────
FORMATO DE RESPUESTA (OBLIGATORIO)
────────────────────────────────────────
Debes devolver EXCLUSIVAMENTE:

[
  { "filename": "sections/custom-hero.liquid", "content": "..." },
  { "filename": "sections/custom-product-grid.liquid", "content": "..." },
  { "filename": "templates/index.json", "content": "..." },
  { "filename": "assets/custom.css", "content": "..." }
]

SIN TEXTO ANTES  
SIN TEXTO DESPUÉS  
SIN MARKDOWN  

────────────────────────────────────────
CONTEXTO DEL USUARIO
────────────────────────────────────────
Industria: ${industry}
Estilo visual: ${style}
Colores principales: ${colors}
Características deseadas: ${features}

Usa este contexto SOLO para copywriting y estilos.
NO modifiques la estructura técnica.
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
