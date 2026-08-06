/* =========================================================================
   WhiteMoon · Autoescuela — interacciones
   Sin librerías. Respeta prefers-reduced-motion. Sin overflow horizontal.
   ========================================================================= */
(() => {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ---------- Header scroll ---------- */
  const header = $(".header");
  const onScroll = () => header && header.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Menú móvil ---------- */
  const burger = $(".burger");
  const mnav = $(".mobile-nav");
  const openM = () => mnav && mnav.classList.add("open");
  const closeM = () => mnav && mnav.classList.remove("open");
  burger && burger.addEventListener("click", openM);
  $(".mobile-nav__close") && $(".mobile-nav__close").addEventListener("click", closeM);
  $$(".mobile-nav a, .mobile-nav .btn").forEach((a) => a.addEventListener("click", closeM));

  /* ---------- Palabra rotativa del hero ---------- */
  const rotEl = $(".rotator__word");
  if (rotEl) {
    const words = [
      "Madrid",
      "Majadahonda",
      "Las Rozas",
      "Pozuelo",
    ];
    let i = 0, ch = 0, deleting = false;
    rotEl.textContent = "";
    const tick = () => {
      const w = words[i];
      if (!deleting) {
        rotEl.textContent = w.slice(0, ++ch);
        if (ch === w.length) { deleting = true; return setTimeout(tick, 1600); }
      } else {
        rotEl.textContent = w.slice(0, --ch);
        if (ch === 0) { deleting = false; i = (i + 1) % words.length; }
      }
      setTimeout(tick, deleting ? 40 : 78);
    };
    if (reduced) { rotEl.textContent = words[0]; } else { setTimeout(tick, 600); }
  }

  /* ---------- Scroll reveal con stagger ---------- */
  const reveals = $$(".reveal");
  if (reveals.length && "IntersectionObserver" in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const d = e.target.dataset.delay || 0;
          e.target.style.transitionDelay = d + "ms";
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Cursor personalizado (desktop puntero fino) ---------- */
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (finePointer && !reduced && window.innerWidth > 900) {
    const dot = document.createElement("div"); dot.className = "cursor-dot";
    const ring = document.createElement("div"); ring.className = "cursor-ring";
    document.body.append(dot, ring);
    let rx = 0, ry = 0, dx = 0, dy = 0;
    window.addEventListener("mousemove", (e) => {
      dx = e.clientX; dy = e.clientY;
      dot.style.left = dx + "px"; dot.style.top = dy + "px";
    });
    const loop = () => {
      rx += (dx - rx) * 0.18; ry += (dy - ry) * 0.18;
      ring.style.left = rx + "px"; ring.style.top = ry + "px";
      requestAnimationFrame(loop);
    };
    loop();
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest("a,button,summary,.svc,.zone__chip")) ring.classList.add("hover");
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest("a,button,summary,.svc,.zone__chip")) ring.classList.remove("hover");
    });
  }

  /* ---------- Guardia anti-overflow (dev) ---------- */
  const overflowCheck = () => {
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) {
      console.warn("[layout] overflow horizontal:", document.documentElement.scrollWidth, ">", document.documentElement.clientWidth);
    }
  };
  window.addEventListener("load", overflowCheck);
})();
