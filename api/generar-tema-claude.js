export default async function handler(req, res) {
  try {
    const { industry, style, colors, features, platform } = req.body;

    const prompt = `
Genera un tema completo para ${platform}.
Industria: ${industry}
Estilo: ${style}
Colores: ${colors}
Características: ${features}

Devuelve los archivos en formato JSON así:
{
  "filename": "ruta/archivo.ext",
  "content": "contenido del archivo"
}
    `;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();

    res.status(200).json({ result: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
