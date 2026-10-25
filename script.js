/* ───────────── Config ───────────── */

// Tally order form (embedded in the Order section).
// Tip: add a hidden field named "bread" in Tally and the bread picked on the site gets prefilled.
const TALLY_FORM_URL = "https://tally.so/r/M1e6AY";

// Weekly breads come from the admin page (/admin), stored on Netlify and served at /api/weeks.
// If that isn't available (e.g. running locally) the site falls back to data/weeks.json.
// The site shows the first week whose deadline hasn't passed as "this week", then previews the next two.

const parseLocal = (s) => {
  const [d, t = "00:00"] = s.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, dd, hh, mm);
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const textOn = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? "#2b1b12" : "#f4eee3";
};

async function loadWeeks() {
  const get = async (url) => {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };
  let raw = await get("/api/weeks").catch(() => null);
  if (!raw?.weeks?.length) raw = await get("data/weeks.json").catch(() => ({ weeks: [] }));
  return raw.weeks
    .map((w) => ({
      deadline: parseLocal(w.deadline),
      delivery: parseLocal(w.delivery),
      // Item = [中文, English, tone, tone text, photo]. Values are escaped because they end up in innerHTML.
      items: w.items.map((it) => {
        const tone = /^#[0-9a-f]{6}$/i.test(it.tone) ? it.tone : "#d9a35f";
        const img = /^(\/api\/photo\/[a-z0-9-]+|images\/[\w./-]+)$/i.test(it.img || "") ? it.img : "";
        return [esc(it.zh), esc(it.en), tone, textOn(tone), img];
      }),
    }))
    .sort((a, b) => a.deadline - b.deadline);
}
const WEEKS = await loadWeeks();

/* ───────────── Data → DOM ───────────── */

const $ = (s) => document.querySelector(s);
const wk = (d) => d.toLocaleDateString("en-US", { weekday: "short" });
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const day = (d) => `${wk(d)} ${md(d)}`;

// ?now=2026-11-05 previews the site as of another date
const nowParam = new URLSearchParams(location.search).get("now");
const t0 = nowParam ? new Date(nowParam + "T09:00:00").getTime() : Date.now();
const loadedAt = Date.now();
const nowMs = () => t0 + (Date.now() - loadedAt);
const idx = WEEKS.findIndex((w) => w.deadline > nowMs());
const cur = WEEKS[idx];
const next = idx >= 0 ? WEEKS[idx + 1] : undefined;
const after = idx >= 0 ? WEEKS[idx + 2] : undefined;

const dateRows = (w) => `
  <div><dt>訂單截止 · Order by</dt><dd>${day(w.deadline)}, 5 PM</dd></div>
  <div><dt>早上送貨 · Delivered</dt><dd>${day(w.delivery)} morning</dd></div>`;

// Tonal placeholder (or a real photo) for an arch window
const layer = (it, on) =>
  it[4]
    ? `<span class="ph${on ? " on" : ""}"><img src="${it[4]}" alt="${it[0]}"></span>`
    : `<span class="ph${on ? " on" : ""}" style="background:linear-gradient(160deg, color-mix(in srgb, ${it[2]} 82%, #fff), ${it[2]})"></span>`;

function remaining(deadline) {
  const ms = deadline - nowMs();
  if (ms <= 0) return "Orders closed";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d ${h}h left` : `${h}h ${m % 60}m left`;
}

if (cur) {
  $("#m-deadline").textContent = `${day(cur.deadline)}, 5 PM`;
  $("#m-delivery").textContent = `${day(cur.delivery)} morning`;
  const tick = () => {
    const r = remaining(cur.deadline);
    $("#m-count").textContent = r;
    $("#nav-count").textContent = r === "Orders closed" ? r : `Orders close in ${r.replace(" left", "")}`;
  };
  tick();
  setInterval(tick, 30000);

  $("#week-dates").innerHTML = dateRows(cur);
  $("#week-arch").innerHTML = cur.items.map((it, i) => layer(it, i === 0)).join("");
  $("#week-arch").dataset.bread = `${cur.items[0][0]} ${cur.items[0][1]}`;
  $("#week-list").innerHTML = cur.items
    .map(
      (it, i) => `
      <li class="wrow rv" data-i="${i}">
        <span class="n">0${i + 1}</span>
        <span class="thumb" style="--bg:${it[2]}">${it[4] ? `<img src="${it[4]}" alt="">` : ""}</span>
        <div><h3>${it[0]}</h3><p>${it[1]}</p></div>
        <a class="link" href="#order" data-bread="${it[0]} ${it[1]}" aria-label="Order ${it[1]}">Order</a>
      </li>`
    )
    .join("");

  // Hover (or focus) a bread to swap the arch window
  const arch = $("#week-arch");
  const layers = [...arch.children];
  const setActive = (i) => {
    layers.forEach((l, n) => l.classList.toggle("on", n === i));
    arch.dataset.bread = `${cur.items[i][0]} ${cur.items[i][1]}`;
    arch.setAttribute("aria-label", `Order ${cur.items[i][1]}`);
  };
  document.querySelectorAll(".wrow").forEach((r) => {
    const i = +r.dataset.i;
    r.addEventListener("mouseenter", () => setActive(i));
    r.addEventListener("focusin", () => setActive(i));
  });

  $("#order-note").textContent = `Order by ${day(cur.deadline)}, 5 PM — delivered ${day(cur.delivery)} morning.`;
} else {
  $("#week").hidden = true;
  $("#m-deadline").textContent = "—";
  $("#nav-count").textContent = "New breads soon";
  $("#order-note").textContent = "New breads are coming — check back soon.";
}

if (next) {
  $("#next").hidden = false;
  $("#next-dates").innerHTML = dateRows(next);
  $("#rows").innerHTML = next.items
    .map(
      (it, i) => `
      <li class="row rv">
        <span class="row-no">0${i + 1}</span>
        <strong>${it[0]}</strong>
        <i></i>
        <em>${it[1]}</em>
      </li>`
    )
    .join("");
  if (after) {
    const a = $("#after");
    a.hidden = false;
    a.innerHTML = `
      <p class="label">The week after · ${md(after.delivery)}</p>
      <p class="names">${after.items.map((it) => `<span>${it[0]}<small>${it[1]}</small></span>`).join("")}</p>`;
  }
}

/* ───────────── Tally form ───────────── */

function tallyEmbedUrl(raw) {
  const id = raw.trim().replace(/^https?:\/\/tally\.so\/(r|embed)\//, "").split(/[?#]/)[0];
  return `https://tally.so/embed/${id}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`;
}

const wrap = $("#form-wrap");
let frame = null;
if (TALLY_FORM_URL) {
  frame = document.createElement("iframe");
  frame.title = "Order form";
  frame.loading = "lazy";
  frame.width = "100%";
  frame.height = "560";
  frame.frameBorder = "0";
  frame.dataset.tallySrc = tallyEmbedUrl(TALLY_FORM_URL);
  wrap.appendChild(frame);
  const alt = document.createElement("a");
  alt.className = "form-alt";
  alt.href = TALLY_FORM_URL;
  alt.target = "_blank";
  alt.rel = "noopener";
  alt.textContent = "Form not loading? Open it in a new tab →";
  wrap.appendChild(alt);
  const load = () => (window.Tally ? Tally.loadEmbeds() : (frame.src = frame.dataset.tallySrc));
  const s = document.createElement("script");
  s.src = "https://tally.so/widgets/embed.js";
  s.onload = load;
  s.onerror = load;
  document.body.appendChild(s);
}

// "Order this bread" links jump to the form and prefill the bread (needs a hidden field "bread" in Tally)
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-bread]");
  if (!a || !frame) return;
  frame.src = `${frame.dataset.tallySrc}&bread=${encodeURIComponent(a.dataset.bread)}`;
});

/* ───────────── Wordmark, nav theme, reveals ───────────── */

// Scale a wordmark so it spans its container edge to edge
function fit(el) {
  const span = el.firstElementChild;
  el.style.fontSize = "100px";
  const w = span.getBoundingClientRect().width;
  el.style.fontSize = `${(100 * el.clientWidth) / w}px`;
}

// Hero wordmark rises letter by letter
const mark = $("#mark");
const word = mark.textContent.trim();
mark.firstElementChild.innerHTML = [...word]
  .map((c, i) => `<span class="ch" style="--i:${i}">${c === " " ? "&nbsp;" : c}</span>`)
  .join("");

const fits = [mark, $("#foot-mark")];
const refit = () => fits.forEach(fit);
refit();
addEventListener("resize", refit);
document.fonts?.ready.then(() => {
  refit();
  requestAnimationFrame(() => mark.classList.add("in"));
});
setTimeout(() => mark.classList.add("in"), 2500); // never leave it hidden

// Nav colour follows the section under it
const nav = $("#nav");
const themes = [...document.querySelectorAll("[data-theme]")].filter((s) => !s.hidden && s !== nav);
function navTheme() {
  const y = 28;
  const s = themes.find((t) => {
    const r = t.getBoundingClientRect();
    return r.top <= y && r.bottom > y;
  });
  if (s) nav.dataset.theme = s.dataset.theme;
}
addEventListener("scroll", navTheme, { passive: true });
navTheme();

// Reveal on scroll
const io = new IntersectionObserver(
  (en) =>
    en.forEach((x) => {
      if (x.isIntersecting) {
        x.target.classList.add("in");
        io.unobserve(x.target);
      }
    }),
  { threshold: 0.12 }
);
document.querySelectorAll(".rv").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 90}ms`;
  io.observe(el);
});

// Statement: words light up as you scroll
const st = $("#statement");
const words = st.textContent.trim().split(/\s+/);
st.innerHTML = words.map((w) => `<span>${w}</span>`).join(" ");
const spans = [...st.children];
function lightWords() {
  const r = st.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.3)));
  const n = Math.round(p * spans.length);
  spans.forEach((s, i) => s.classList.toggle("on", i < n));
}
addEventListener("scroll", lightWords, { passive: true });
lightWords();

$("#year").textContent = new Date().getFullYear();

/* ───────────── Smooth scroll (Lenis) ───────────── */

if (window.Lenis && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const lenis = new Lenis({ duration: 1.15, anchors: true });
  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
