/* =========================================================================
   Marta — asistente de WhiteMoon (demo autoescuela)
   Flujo: carnet/curso -> zona -> nombre -> teléfono -> cierre.
   Lead -> Supabase leads_web (sector=Autoescuela, origen=autoescuela-demo)
        -> Edge Function autoescuela-notify (aviso a WhiteMoon).
   La publishable key va en cliente (solo INSERT vía RLS). El token del bot
   de avisos NUNCA está aquí: vive en los Secrets de la Edge Function.
   ========================================================================= */
(() => {
  "use strict";

  const SUPABASE_URL = "https://mlaqtniujnvfxcvcourm.supabase.co";
  const SUPABASE_KEY = "sb_publishable_6no6BuOgiA_2nonTJntAuQ_DTqEgrcV";
  const NOTIFY_FN = SUPABASE_URL + "/functions/v1/autoescuela-notify";
  const ORIGEN = "autoescuela-demo";
  const SECTOR = "Autoescuela";

  const WORKS = [
    { id: "coche",   label: "Carnet coche B",         interes: "Carnet coche B" },
    { id: "moto",    label: "Carnet moto",            interes: "Carnet moto" },
    { id: "pesados", label: "Carnets pesados",        interes: "Carnets pesados (C/D/E)" },
    { id: "intens",  label: "Cursos intensivos",      interes: "Cursos intensivos" },
    { id: "puntos",  label: "Recuperación de puntos", interes: "Recuperación de puntos" },
  ];
  const ZONES = [
    "Majadahonda", "Pozuelo de Alarcón", "Las Rozas", "Boadilla del Monte",
    "Villaviciosa de Odón", "Villanueva de la Cañada", "Brunete", "Alcorcón", "Móstoles", "Otra zona",
  ];

  const $ = (s, c = document) => c.querySelector(s);
  const panel = $("#watio");
  if (!panel) return;
  const body = $(".watio-body", panel);
  const quick = $(".watio-quick", panel);
  const form = $(".watio-foot", panel);
  const input = $(".watio-foot input", panel);
  const sendBtn = $(".watio-foot button", panel);
  const btn = $("#watio-open");

  const lead = { servicio: "", interes: "", zona: "", nombre: "", telefono: "" };
  let step = "work";       // work -> zone -> name -> phone -> done
  let started = false;

  /* ---------- helpers UI ---------- */
  const scroll = () => { body.scrollTop = body.scrollHeight; };
  const addMsg = (text, who = "bot") => {
    const el = document.createElement("div");
    el.className = "watio-msg " + who;
    el.textContent = text;
    body.appendChild(el); scroll();
  };
  const typing = () => {
    const t = document.createElement("div");
    t.className = "watio-typing";
    t.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(t); scroll();
    return t;
  };
  const botSay = (text, after) =>
    new Promise((res) => {
      const t = typing();
      setTimeout(() => {
        t.remove(); addMsg(text, "bot");
        if (after) after();
        res();
      }, Math.min(900, 340 + text.length * 12));
    });
  const clearQuick = () => { quick.innerHTML = ""; };
  const setQuick = (items, onPick) => {
    clearQuick();
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = it.label || it;
      b.addEventListener("click", () => onPick(it));
      quick.appendChild(b);
    });
  };
  const setInput = (enabled, placeholder) => {
    input.disabled = !enabled; sendBtn.disabled = !enabled;
    input.placeholder = placeholder || "Escribe tu respuesta…";
    if (enabled) setTimeout(() => input.focus(), 60);
  };

  /* ---------- flujo ---------- */
  const start = async () => {
    if (started) return; started = true;
    setInput(false);
    await botSay("Hola, soy Marta, el asistente de autoescuela de WhiteMoon. Te ayudo a pedir tu plaza sin compromiso en un minuto.");
    await botSay("¿Qué carnet o curso te interesa?", () => {
      setQuick(WORKS, (w) => {
        addMsg(w.label, "user");
        lead.servicio = w.label; lead.interes = w.interes;
        clearQuick(); askZone();
      });
    });
  };

  const askZone = async () => {
    step = "zone";
    await botSay("Perfecto. ¿En qué zona estás?", () => {
      setQuick(ZONES, (z) => {
        if (z === "Otra zona") {
          clearQuick();
          setInput(true, "Escribe tu localidad…");
          botSay("Dime tu localidad y lo vemos igualmente.");
          return;
        }
        addMsg(z, "user"); lead.zona = z; clearQuick(); askName();
      });
    });
  };

  const askName = async () => {
    step = "name";
    clearQuick();
    await botSay("¿Con quién hablo? Dime tu nombre.", () => setInput(true, "Tu nombre…"));
  };

  const askPhone = async () => {
    step = "phone";
    await botSay("Gracias, " + lead.nombre.split(" ")[0] + ". ¿A qué teléfono te llamamos?", () =>
      setInput(true, "Tu teléfono…")
    );
  };

  const finish = async () => {
    step = "done";
    setInput(false); clearQuick();
    const t = typing();
    const ok = await submitLead();
    t.remove();
    if (ok) {
      addMsg(
        "Listo, " + lead.nombre.split(" ")[0] + ". Ya tenemos tus datos y un asesor de WhiteMoon Autoescuela te llamará para darte toda la info. ¡Gracias!",
        "bot"
      );
      setTimeout(() => addMsg("Si lo prefieres, también puedes llamarnos ahora al 643 199 580.", "bot"), 700);
    } else {
      addMsg(
        "He guardado tus datos pero hubo un problema de conexión. Para no esperar, llámanos al 643 199 580 y te atendemos al momento.",
        "bot"
      );
    }
  };

  /* ---------- entrada de texto ---------- */
  const isPhone = (v) => {
    const d = v.replace(/[^\d]/g, "");
    return /^(0034|34)?[6789]\d{8}$/.test(d);
  };
  const handleText = (raw) => {
    const v = raw.trim();
    if (!v) return;
    addMsg(v, "user");
    input.value = "";
    if (step === "zone") { lead.zona = v; setInput(false); askName(); }
    else if (step === "name") {
      if (v.length < 2) { botSay("¿Me dices tu nombre, por favor?"); return; }
      lead.nombre = v; setInput(false); askPhone();
    } else if (step === "phone") {
      if (!isPhone(v)) { botSay("Ese teléfono no parece válido. Escríbelo con 9 dígitos, por favor."); return; }
      lead.telefono = v; finish();
    }
  };

  form.addEventListener("submit", (e) => { e.preventDefault(); handleText(input.value); });

  /* ---------- envío del lead (endurecido) ---------- */
  const payload = () => ({
    nombre: lead.nombre,
    telefono: lead.telefono,
    sector: SECTOR,
    servicio: lead.servicio,
    interes: lead.interes,
    zona: lead.zona,
    origen: ORIGEN,
  });

  /* INSERT en leads_web, con un reintento si falla la red o da 5xx. */
  async function insertLead() {
    const p = payload();
    const req = () =>
      fetch(SUPABASE_URL + "/rest/v1/leads_web", {
        method: "POST",
        keepalive: true,
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          nombre: p.nombre,
          telefono: p.telefono,
          sector: p.sector,
          interes: p.interes,
          mensaje: "Servicio: " + p.servicio + " · Zona: " + p.zona,
          origen: p.origen,
        }),
      });

    for (let intento = 1; intento <= 2; intento++) {
      try {
        const r = await req();
        if (r.ok) return true;
        console.warn("[marta] leads_web insert:", r.status, await r.text());
        if (r.status < 500) return false;          // 4xx: reintentar no arregla nada
      } catch (e) {
        console.warn("[marta] leads_web error (intento " + intento + "):", e);
      }
      if (intento === 1) await new Promise((r) => setTimeout(r, 600));
    }
    return false;
  }

  /* Notificación WhatsApp. sendBeacon sobrevive a que se cierre la pestaña;
     si el navegador lo rechaza, cae a fetch con keepalive. */
  function notify() {
    const bodyStr = JSON.stringify(payload());
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([bodyStr], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(NOTIFY_FN, blob)) return;
      }
    } catch (e) { console.warn("[marta] sendBeacon error:", e); }

    fetch(NOTIFY_FN, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
      },
      body: bodyStr,
    }).catch((e) => console.warn("[marta] notify error:", e));
  }

  async function submitLead() {
    const inserted = await insertLead();
    notify();
    return inserted;
  }

  /* ---------- abrir / cerrar ---------- */
  const open = () => {
    panel.classList.add("open");
    if (btn) btn.style.display = "none";
    start();
  };
  const close = () => {
    panel.classList.remove("open");
    if (btn) btn.style.display = "";
  };
  btn && btn.addEventListener("click", open);
  $(".watio-head__close", panel).addEventListener("click", close);
  document.querySelectorAll("[data-watio]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); open(); })
  );
})();
