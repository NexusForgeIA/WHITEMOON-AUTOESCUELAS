/*
 * LEX — asistente guiado de WHITEMOON AUTOESCUELA
 * Widget de captación de leads para la demo de autoescuela
 * (permiso B, moto, intensivos, teórica, prácticas, puntos y renovación).
 *
 * Clon estructural del asistente del despacho de abogados: misma máquina de
 * estados (categoría → [modalidad] → nombre → teléfono), mismo DOM, mismos
 * estilos autoinyectados. Solo cambian el contenido y el acento de color.
 *
 * Al completar el flujo:
 *   1) inserta el lead en Supabase (tabla leads_web) con la publishable key,
 *      que por RLS solo permite INSERT desde el cliente;
 *   2) llama a la Edge Function pública autoescuela-notify, que avisa al
 *      equipo por Telegram. El token del bot vive EXCLUSIVAMENTE en los
 *      secrets de la función: aquí no hay ninguna clave privada.
 *
 * Ambas llamadas usan fetch con keepalive y caen a navigator.sendBeacon si la
 * pestaña se cierra antes de que termine la petición.
 *
 * Sin dependencias. Se autoinyecta estilos y DOM.
 */
(function () {
  "use strict";
  if (window.__lexChatLoaded) return;
  window.__lexChatLoaded = true;

  /* ---------- Config ----------
     La publishable key NO es un secreto: identifica al proyecto y las políticas
     RLS de leads_web solo dejan insertar. El token de Telegram nunca sale del
     servidor: lo usa la Edge Function autoescuela-notify. */
  var SUPABASE_URL = "https://mlaqtniujnvfxcvcourm.supabase.co";
  var SUPABASE_KEY = "sb_publishable_6no6BuOgiA_2nonTJntAuQ_DTqEgrcV";
  var LEADS_URL = SUPABASE_URL + "/rest/v1/leads_web";
  var NOTIFY_URL = SUPABASE_URL + "/functions/v1/autoescuela-notify";
  var ORIGEN = "autoescuela-demo";
  var SECTOR = "Autoescuela";

  var ACCENT = "#7c4dff";
  var ACCENT_SOFT = "#9d70ff";
  var OK = "#00d4aa";

  /* ---------- Flujo (categoría → modalidad) ---------- */
  var CATEGORIAS = ["🚗 Permiso B", "🏍️ Permiso de moto", "⚡ Curso intensivo", "🎯 Recuperar puntos"];
  /* Solo tiene sentido preguntar el ritmo cuando aún está por decidir: en el
     curso intensivo ya está elegido y en puntos no aplica. */
  var CON_MODALIDAD = ["Permiso B", "Permiso de moto"];
  var MODALIDADES = ["Normal", "Intensivo"];

  /* ---------- Estado ---------- */
  var state = { categoria: "", modalidad: "", nombre: "", telefono: "" };
  var els = {};

  /* ---------- Estilos ---------- */
  var css = "" +
    ".lex-fab{position:fixed;right:clamp(16px,3vw,28px);bottom:clamp(16px,3vw,28px);z-index:2147483000;" +
      "width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;" +
      "background:" + ACCENT + ";color:#fff;box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 0 6px rgba(124,77,255,.16);" +
      "transition:transform .15s ease}" +
    ".lex-fab:hover{transform:translateY(-2px)}" +
    ".lex-fab:active{transform:scale(.95)}" +
    ".lex-fab svg{width:28px;height:28px}" +
    ".lex-fab .lex-dot{position:absolute;top:-3px;right:-3px;width:16px;height:16px;border-radius:50%;background:" + OK + ";border:2px solid #08080d}" +
    ".lex-fab[aria-expanded=true]{transform:scale(.9);opacity:.85}" +

    ".lex-panel{position:fixed;right:clamp(16px,3vw,28px);bottom:calc(clamp(16px,3vw,28px) + 74px);z-index:2147483000;" +
      "width:min(320px,calc(100vw - 32px));height:min(480px,calc(100vh - 120px));" +
      "background:#08080d;border:1px solid #22222e;border-radius:18px;overflow:hidden;display:none;flex-direction:column;" +
      "font-family:'Sora',system-ui,-apple-system,sans-serif;color:#f0f0f5;" +
      "box-shadow:0 24px 60px rgba(0,0,0,.6);opacity:0;transform:translateY(14px) scale(.98);" +
      "transition:opacity .22s cubic-bezier(.2,.7,.2,1),transform .22s cubic-bezier(.2,.7,.2,1)}" +
    ".lex-panel.open{display:flex}" +
    ".lex-panel.in{opacity:1;transform:none}" +

    ".lex-head{display:flex;align-items:center;gap:12px;padding:16px 16px;background:#12121a;border-bottom:1px solid #22222e;flex:none}" +
    ".lex-ava{width:42px;height:42px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;" +
      "background:" + ACCENT + ";color:#fff}" +
    ".lex-ava svg{width:22px;height:22px}" +
    ".lex-htxt b{display:block;font-size:15px;font-weight:700;letter-spacing:-.01em}" +
    ".lex-htxt span{display:flex;align-items:center;gap:6px;font-size:12px;color:#8888a0;margin-top:2px}" +
    ".lex-htxt span::before{content:'';width:7px;height:7px;border-radius:50%;background:" + OK + "}" +
    ".lex-x{margin-left:auto;background:none;border:0;color:#8888a0;cursor:pointer;width:34px;height:34px;border-radius:9px;" +
      "display:flex;align-items:center;justify-content:center;transition:color .2s,background .2s}" +
    ".lex-x:hover{color:#f0f0f5;background:#1a1a24}" +
    ".lex-x svg{width:20px;height:20px}" +

    ".lex-body{flex:1;overflow-y:auto;padding:18px 16px 8px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}" +
    ".lex-body::-webkit-scrollbar{width:8px}.lex-body::-webkit-scrollbar-thumb{background:#22222e;border-radius:8px}" +

    ".lex-row{display:flex;gap:9px;align-items:flex-end;max-width:88%}" +
    ".lex-row.bot{align-self:flex-start}" +
    ".lex-row.user{align-self:flex-end;flex-direction:row-reverse}" +
    ".lex-mini{width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;" +
      "background:" + ACCENT + ";color:#fff}" +
    ".lex-mini svg{width:15px;height:15px}" +
    ".lex-bub{padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;border:1px solid transparent;text-wrap:pretty;white-space:pre-line}" +
    ".lex-row.bot .lex-bub{background:#12121a;border-color:#22222e;border-bottom-left-radius:5px}" +
    ".lex-row.user .lex-bub{background:" + ACCENT + ";color:#fff;font-weight:600;border-bottom-right-radius:5px}" +
    /* Cierre en verde: confirma visualmente que el lead ha quedado registrado */
    ".lex-row.bot .lex-bub.ok{background:rgba(0,212,170,.10);border-color:rgba(0,212,170,.45);color:#c9fff2;font-weight:600}" +

    ".lex-opts{display:flex;flex-wrap:wrap;gap:7px;align-self:flex-start;max-width:96%;padding-left:32px;margin-top:-2px}" +
    ".lex-chip{background:#12121a;border:1px solid #333342;color:#f0f0f5;font-family:inherit;font-size:13px;font-weight:500;" +
      "padding:8px 13px;border-radius:10px;cursor:pointer;min-height:36px;transition:border-color .18s,background .18s,transform .12s}" +
    ".lex-chip:hover{border-color:" + ACCENT + ";background:#1a1a24}" +
    ".lex-chip:active{transform:scale(.97)}" +
    ".lex-chip.urg{border-color:" + ACCENT + ";color:" + ACCENT_SOFT + ";font-weight:600}" +

    ".lex-foot{flex:none;border-top:1px solid #22222e;padding:12px;background:#08080d}" +
    ".lex-form{display:flex;gap:9px}" +
    ".lex-input{flex:1;background:#1a1a24;border:1px solid #333342;color:#f0f0f5;border-radius:11px;padding:12px 14px;" +
      "font-family:inherit;font-size:15px;min-height:46px}" +
    ".lex-input::placeholder{color:#6f6f80}" +
    ".lex-input:focus{outline:none;border-color:" + ACCENT + "}" +
    ".lex-send{flex:none;width:46px;height:46px;border-radius:11px;border:0;cursor:pointer;background:" + ACCENT + ";color:#fff;" +
      "display:flex;align-items:center;justify-content:center;transition:transform .12s}" +
    ".lex-send:hover{transform:translateY(-1px)}.lex-send:active{transform:scale(.95)}" +
    ".lex-send svg{width:20px;height:20px}" +
    ".lex-err{color:#ff8a8a;font-size:12.5px;padding:6px 4px 0}" +
    ".lex-foot-note{text-align:center;font-size:11px;color:#6f6f80;padding-top:9px}" +

    ".lex-typing{display:flex;gap:4px;padding:13px 14px}" +
    ".lex-typing i{width:7px;height:7px;border-radius:50%;background:#6f6f80;animation:lex-bounce 1.2s infinite ease-in-out}" +
    ".lex-typing i:nth-child(2){animation-delay:.15s}.lex-typing i:nth-child(3){animation-delay:.3s}" +
    "@keyframes lex-bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}" +

    "@media (prefers-reduced-motion: reduce){" +
      ".lex-panel,.lex-fab,.lex-chip,.lex-send{transition:none}" +
      ".lex-typing i{animation:none}.lex-body{scroll-behavior:auto}}" +
    "@media (max-width:600px){.lex-panel{right:8px;left:8px;width:auto;bottom:84px;height:min(68vh,480px)}}";

  /* ---------- Iconos ---------- */
  var WHEEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M3.4 10.5h6M14.6 10.5h6M12 15v6"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';

  /* ---------- Construcción del DOM ---------- */
  function build() {
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    var fab = document.createElement("button");
    fab.className = "lex-fab";
    fab.id = "lex-toggle";
    fab.setAttribute("aria-label", "Abrir chat con LEX, asistente de WhiteMoon Autoescuela");
    fab.setAttribute("aria-expanded", "false");
    fab.innerHTML = WHEEL + '<span class="lex-dot" aria-hidden="true"></span>';

    var panel = document.createElement("div");
    panel.className = "lex-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat con LEX, asistente de WhiteMoon Autoescuela");
    panel.innerHTML =
      '<div class="lex-head">' +
        '<div class="lex-ava">' + WHEEL + '</div>' +
        '<div class="lex-htxt"><b>LEX</b><span>Asistente · WhiteMoon Autoescuela</span></div>' +
        '<button class="lex-x" aria-label="Cerrar chat">' + CLOSE + '</button>' +
      '</div>' +
      '<div class="lex-body" id="lex-body" aria-live="polite"></div>' +
      '<div class="lex-foot" id="lex-foot" style="display:none">' +
        '<form class="lex-form" id="lex-form" autocomplete="on">' +
          '<input class="lex-input" id="lex-input" type="text" autocomplete="name">' +
          '<button class="lex-send" type="submit" aria-label="Enviar">' + SEND + '</button>' +
        '</form>' +
        '<div class="lex-err" id="lex-err" style="display:none"></div>' +
        '<div class="lex-foot-note">Demo · tus datos llegan al equipo de la autoescuela</div>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    els.fab = fab;
    els.panel = panel;
    els.body = panel.querySelector("#lex-body");
    els.foot = panel.querySelector("#lex-foot");
    els.form = panel.querySelector("#lex-form");
    els.input = panel.querySelector("#lex-input");
    els.err = panel.querySelector("#lex-err");

    fab.addEventListener("click", toggle);
    panel.querySelector(".lex-x").addEventListener("click", close);
    els.form.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) close();
    });
  }

  /* ---------- Abrir / cerrar ---------- */
  var opened = false;
  function toggle() { els.panel.classList.contains("open") ? close() : open(); }

  function open() {
    els.panel.classList.add("open");
    els.fab.setAttribute("aria-expanded", "true");
    requestAnimationFrame(function () { els.panel.classList.add("in"); });
    if (!opened) { opened = true; startFlow(); }
  }
  function close() {
    els.panel.classList.remove("in");
    els.fab.setAttribute("aria-expanded", "false");
    setTimeout(function () { els.panel.classList.remove("open"); }, 220);
  }

  /* ---------- Render helpers ---------- */
  function scroll() { els.body.scrollTop = els.body.scrollHeight; }

  function botMsg(text, cb, ok) {
    var typing = document.createElement("div");
    typing.className = "lex-row bot";
    typing.innerHTML = '<div class="lex-mini">' + WHEEL + '</div><div class="lex-bub"><div class="lex-typing"><i></i><i></i><i></i></div></div>';
    els.body.appendChild(typing);
    scroll();
    var delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 480;
    setTimeout(function () {
      var bub = typing.querySelector(".lex-bub");
      bub.innerHTML = "";
      bub.textContent = text;
      if (ok) bub.classList.add("ok");
      scroll();
      if (cb) cb();
    }, delay);
  }

  function userMsg(text) {
    var row = document.createElement("div");
    row.className = "lex-row user";
    row.innerHTML = '<div class="lex-bub"></div>';
    row.querySelector(".lex-bub").textContent = text;
    els.body.appendChild(row);
    scroll();
  }

  function options(list, onPick, urgentLabel) {
    var wrap = document.createElement("div");
    wrap.className = "lex-opts";
    list.forEach(function (label) {
      var b = document.createElement("button");
      b.className = "lex-chip" + (label === urgentLabel ? " urg" : "");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", function () {
        wrap.remove();
        userMsg(label);
        onPick(label);
      });
      wrap.appendChild(b);
    });
    els.body.appendChild(wrap);
    scroll();
    return wrap;
  }

  function showInput(placeholder, type, autocomplete) {
    els.foot.style.display = "block";
    els.input.value = "";
    els.input.placeholder = placeholder;
    els.input.type = type || "text";
    els.input.inputMode = type === "tel" ? "tel" : "text";
    els.input.setAttribute("autocomplete", autocomplete || "off");
    hideErr();
    setTimeout(function () { els.input.focus(); }, 60);
  }
  function hideInput() { els.foot.style.display = "none"; }
  function showErr(msg) { els.err.textContent = msg; els.err.style.display = "block"; }
  function hideErr() { els.err.style.display = "none"; }

  /* ---------- Máquina de estados ---------- */
  var step = "";

  function startFlow() {
    botMsg("¡Hola! Soy LEX, el asistente de WhiteMoon Autoescuela 🚗 Te informo sin compromiso. ¿Qué permiso te interesa?", function () {
      step = "categoria";
      options(CATEGORIAS, pickCategoria);
    });
  }

  function pickCategoria(label) {
    var cat = label.replace(/^\S+\s+/, "").trim();
    state.categoria = cat;
    if (CON_MODALIDAD.indexOf(cat) !== -1) {
      botMsg("¿Lo quieres en modalidad normal o intensiva?", function () {
        step = "modalidad";
        options(MODALIDADES, pickModalidad, "Intensivo");
      });
      return;
    }
    if (cat === "Curso intensivo") state.modalidad = "Intensivo";
    askNombre();
  }

  function pickModalidad(m) {
    state.modalidad = m;
    askNombre();
  }

  function askNombre() {
    botMsg("Perfecto. ¿Cómo te llamas?", function () {
      step = "nombre";
      showInput("Escribe tu nombre", "text", "name");
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    var val = els.input.value.trim();
    if (step === "nombre") {
      if (val.length < 2) { showErr("Dime tu nombre, por favor."); return; }
      state.nombre = val;
      userMsg(val);
      hideInput();
      botMsg("¿Y un teléfono para llamarte?", function () {
        step = "telefono";
        showInput("6XX XXX XXX", "tel", "tel");
      });
    } else if (step === "telefono") {
      var digits = val.replace(/\s+/g, "");
      if (!/^[6789]\d{8}$/.test(digits)) {
        showErr("Necesito un teléfono válido de 9 dígitos.");
        return;
      }
      state.telefono = digits;
      userMsg(val);
      hideInput();
      finish();
    }
  }

  function finish() {
    step = "done";
    sendLead();
    botMsg("✅ Tenemos tus datos, te llamamos para informarte sin compromiso. ¡Gracias!", null, true);
  }

  /* ---------- Envío del lead ----------
     fetch con keepalive (sobrevive a que se cierre la pestaña) y, si falla,
     sendBeacon con la apikey en query string como último recurso. */
  function beacon(url, payload) {
    if (!navigator.sendBeacon) return false;
    try {
      var sep = url.indexOf("?") !== -1 ? "&" : "?";
      return navigator.sendBeacon(
        url + sep + "apikey=" + encodeURIComponent(SUPABASE_KEY),
        new Blob([JSON.stringify(payload)], { type: "application/json" })
      );
    } catch (e) { return false; }
  }

  function post(url, payload, extraHeaders) {
    var headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json"
    };
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    }
    try {
      return fetch(url, {
        method: "POST",
        keepalive: true,
        headers: headers,
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (r.ok) return true;
        console.warn("[LEX]", url, r.status);
        return beacon(url, payload);
      }).catch(function (err) {
        console.warn("[LEX] error de red:", err);
        return beacon(url, payload);
      });
    } catch (err) {
      console.warn("[LEX] excepción al enviar el lead:", err);
      return Promise.resolve(beacon(url, payload));
    }
  }

  function sendLead() {
    var interes = state.categoria;
    var mensaje = state.modalidad
      ? state.categoria + " · Modalidad: " + state.modalidad
      : state.categoria;

    /* 1) Lead en leads_web (INSERT permitido por RLS con la publishable key) */
    post(LEADS_URL, {
      nombre: state.nombre,
      telefono: state.telefono,
      sector: SECTOR,
      interes: interes,
      mensaje: mensaje,
      origen: ORIGEN
    }, { "Prefer": "return=minimal" });

    /* 2) Aviso por Telegram vía Edge Function (token solo server-side) */
    post(NOTIFY_URL, {
      nombre: state.nombre,
      telefono: state.telefono,
      sector: SECTOR,
      servicio: interes,
      modalidad: state.modalidad,
      origen: ORIGEN
    });
  }

  /* ---------- Init ---------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
