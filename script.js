/* ───────────── Config ───────────── */

// Tally order form (embedded in the Order section).
// Tip: add a hidden field named "bread" in Tally and the bread picked on the site gets prefilled.
const TALLY_FORM_URL = "https://tally.so/r/M1e6AY";

// Each week: order deadline (Mon 5pm) and delivery morning. The site shows the first week whose
// deadline hasn't passed as "this week", then previews the next two.
// Item = [中文, English, tile background, tile text, photo]. Put a photo path (e.g. "images/choc.jpg") in the
// last slot and it replaces the colour tile.
const WEEKS = [
  {
    deadline: new Date(2026, 10, 2, 17, 0),
    delivery: new Date(2026, 10, 4),
    items: [
      ["巧克力麵包", "Chocolate Bread", "#3a2216", "#f1e8d8", ""],
      ["奶酥麵包", "Milk Crumble Bun", "#f0b93f", "#1f1511", ""],
      ["蔥麵包", "Scallion Bread", "#5f6b34", "#f1e8d8", ""],
    ],
  },
  {
    deadline: new Date(2026, 10, 9, 17, 0),
    delivery: new Date(2026, 10, 11),
    items: [
      ["抹茶紅豆麵包", "Matcha Red Bean Bread", "#8f9c5c", "#1f1511", ""],
      ["菠蘿麵包", "Pineapple Bun", "#e0902c", "#1f1511", ""],
      ["鹽可頌", "Salt Croissant", "#e6d8ba", "#b5301e", ""],
    ],
  },
  {
    deadline: new Date(2026, 10, 16, 17, 0),
    delivery: new Date(2026, 10, 18),
    items: [
      ["布丁麵包", "Custard Pudding Bread", "#efc96a", "#1f1511", ""],
      ["蔓越莓貝果", "Cranberry Bagel", "#8f2a3a", "#f1e8d8", ""],
      ["巧克力麵包", "Chocolate Bread", "#3a2216", "#f1e8d8", ""],
    ],
  },
];

/* ───────────── Data → DOM ───────────── */

const $ = (s) => document.querySelector(s);
const wk = (d) => d.toLocaleDateString("en-US", { weekday: "short" });
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const day = (d) => `${wk(d)} ${md(d)}`;

// ?now=2026-11-05 previews the site as of another date
const nowParam = new URLSearchParams(location.search).get("now");
const now = nowParam ? new Date(nowParam + "T09:00:00") : new Date();
const idx = WEEKS.findIndex((w) => w.deadline > now);
const cur = WEEKS[idx];
const next = idx >= 0 ? WEEKS[idx + 1] : undefined;
const after = idx >= 0 ? WEEKS[idx + 2] : undefined;

const dateRows = (w) => `
  <div><dt>訂單截止 · Order by</dt><dd>${day(w.deadline)}, 5 PM</dd></div>
  <div><dt>早上送貨 · Delivered</dt><dd>${day(w.delivery)} morning</dd></div>`;

const photo = ([zh, , bg, fg, img]) =>
  img
    ? `<img src="${img}" alt="${zh}" loading="lazy">`
    : `<span class="ph" style="background:${bg};color:${fg}"><b>${[...zh][0]}</b></span>`;

if (cur) {
  $("#hero-deadline").innerHTML = `<dt>訂單截止 · Order by</dt><dd>${day(cur.deadline)}, 5 PM</dd>`;
  $("#week-dates").innerHTML = dateRows(cur);
  $("#tiles").innerHTML = cur.items
    .map(
      (it, i) => `
      <li class="tile rv">
        <a href="#order" class="tile-photo" data-bread="${it[0]} ${it[1]}" aria-label="Order ${it[1]}">${photo(it)}<span class="tile-no">0${i + 1}</span></a>
        <div class="tile-info">
          <div><h3>${it[0]}</h3><p>${it[1]}</p></div>
          <a class="btn btn-red" href="#order" data-bread="${it[0]} ${it[1]}" aria-label="Order ${it[1]}">Order <i>→</i></a>
        </div>
      </li>`
    )
    .join("");
  $("#marquee").innerHTML = Array(2)
    .fill(
      `<span class="mq">${cur.items.map((it) => `<b>${it[0]}</b><i>✺</i><em>${it[1]}</em><i>✺</i>`).join("")}<b>${day(cur.deadline)} 5PM</b><i>✺</i></span>`
    )
    .join("");
  $("#order-note").textContent = `Order by ${day(cur.deadline)}, 5 PM — delivered ${day(cur.delivery)} morning.`;
} else {
  $("#week").hidden = true;
  $("#order-note").textContent = "New breads are coming — check back soon.";
}

if (next) {
  $("#next").hidden = false;
  $("#next-dates").innerHTML = dateRows(next);
  $("#rows").innerHTML = next.items
    .map(
      (it, i) => `
      <li class="row rv" style="--bg:${it[2]};--fg:${it[3]}">
        <span class="row-no">0${i + 1}</span>
        <strong>${it[0]}</strong>
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

// "Order this bread" buttons jump to the form and prefill the bread (needs a hidden field "bread" in Tally)
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-bread]");
  if (!a || !frame) return;
  frame.src = `${frame.dataset.tallySrc}&bread=${encodeURIComponent(a.dataset.bread)}`;
});

/* ───────────── Type fitting, nav theme, reveals ───────────── */

// Scale a word so it spans its container edge to edge
function fit(el) {
  const span = el.firstElementChild;
  el.style.fontSize = "100px";
  const w = span.getBoundingClientRect().width;
  el.style.fontSize = `${(100 * el.clientWidth) / w}px`;
}
const fits = [...document.querySelectorAll(".fit")];
const refit = () => fits.forEach(fit);
refit();
document.fonts?.ready.then(refit);
addEventListener("resize", refit);

// Nav colour follows the section under it
const nav = $("#nav");
const themes = [...document.querySelectorAll("[data-theme]")].filter((s) => !s.hidden);
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
  const lenis = new Lenis({ duration: 1.15, anchors: true });  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
