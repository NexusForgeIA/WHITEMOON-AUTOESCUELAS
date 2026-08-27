import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// autoescuela-notify — aviso por Telegram de un nuevo lead de la demo de
// autoescuela (WHITEMOON-AUTOESCUELAS).
//
// El lead ya se inserta en leads_web desde el cliente (origen='autoescuela-demo')
// con la publishable key, que por RLS solo permite INSERT. Esta función SOLO
// envía la notificación: el token del bot es EXCLUSIVAMENTE server-side y nunca
// aparece en el JavaScript de la web.
//
// Recibe (POST JSON): { nombre, telefono, sector?, servicio?, modalidad?, zona?, origen? }
// El cuerpo puede llegar como text/plain (navigator.sendBeacon): req.json() lo
// parsea igual.
//
// Devuelve 400 si falta nombre o teléfono: sin esos dos campos el lead no sirve
// para devolver la llamada, así que se rechaza en vez de mandar un aviso vacío.
//
// Secrets usados (nunca en cliente):
//   - TELEGRAM_BOT_TOKEN : token del bot de Telegram
//   - TELEGRAM_CHAT_ID   : chat destino; si falta se usa CHAT_ID_FALLBACK
//
// Regla del proyecto: si el envío falla → console.warn, nunca interrumpe la
// conversación del chatbot.
//
// Desplegar con:
//   supabase functions deploy autoescuela-notify --no-verify-jwt --project-ref mlaqtniujnvfxcvcourm

// El chat_id no es un secreto (solo identifica el destino); el token sí lo es.
const CHAT_ID_FALLBACK = "861432965";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { payload = {}; }

  const data = (payload.args ?? payload) as Record<string, unknown>;
  const nombre = String(data.nombre ?? "").trim();
  const telefono = String(data.telefono ?? "").trim();
  const sector = String(data.sector ?? "Autoescuela").trim();
  const servicio = String(data.servicio ?? "").trim();
  const modalidad = String(data.modalidad ?? "").trim();
  const zona = String(data.zona ?? "").trim();
  const origen = String(data.origen ?? "autoescuela-demo").trim();

  if (!nombre || !telefono) return json({ ok: false, error: "lead incompleto" }, 400);

  const digits = telefono.replace(/\D/g, "");

  const message =
    `🚗 NUEVO LEAD — demo WhiteMoon · ${sector}\n\n` +
    `👤 ${nombre}\n` +
    `📱 ${telefono}\n` +
    `🎓 Interés: ${servicio || "-"}\n` +
    (modalidad ? `⏱️ Modalidad: ${modalidad}\n` : "") +
    (zona ? `📍 Zona: ${zona}\n` : "") +
    `🔗 Origen: ${origen}\n\n` +
    "⚠️ Lead de una WEB DE DEMOSTRACIÓN: es una SOLICITUD de información, no una matrícula.\n" +
    (digits.length >= 9 ? `📲 CONTACTAR: https://wa.me/34${digits.slice(-9)}` : "");

  let notified = false;
  try {
    const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const tgChat = Deno.env.get("TELEGRAM_CHAT_ID") || CHAT_ID_FALLBACK;
    if (tgToken) {
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ chat_id: tgChat, text: message }),
      });
      notified = r.ok;
      if (!r.ok) console.warn("[autoescuela-notify] Telegram falló:", r.status, await r.text());
    } else {
      console.warn("[autoescuela-notify] sin TELEGRAM_BOT_TOKEN, mensaje:", message);
    }
  } catch (e) {
    console.warn("[autoescuela-notify] error enviando Telegram:", e);
  }

  return json({ ok: true, notified });
});
