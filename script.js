import { wallToEpoch } from "./shared/time.js";

/* ───────────── Config ───────────── */

// Weekly breads (names, prices, stock) come from the admin page (/admin) via /api/weeks.
// If that isn't available (e.g. running locally) the site falls back to data/weeks.json.
// The first week whose order deadline hasn't passed is "this week"; the next one is "next week".

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const textOn = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? "#2b1b12" : "#f4eee3";
};

async function loadMenu() {
  const get = async (url) => {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };
  let raw = await get("/api/weeks").catch(() => null);
  if (!raw?.weeks?.length) raw = await get("data/weeks.json").catch(() => ({ weeks: [] }));
  const tz = raw.timezone || "Asia/Taipei";
  const weeks = (raw.weeks || [])
    .map((w) => ({
      id: String(w.id),
      deadline: w.deadline,
      delivery: w.delivery,
      closesAt: wallToEpoch(w.deadline, tz),
      items: w.items.map((it) => {
        const tone = /^#[0-9a-f]{6}$/i.test(it.tone) ? it.tone : "#d9a35f";
        const img = /^(\/api\/photo\/[a-z0-9-]+|images\/[\w./-]+)$/i.test(it.img || "") ? it.img : "";
        return {
          id: String(it.id),
          zh: esc(it.zh),
          en: esc(it.en),
          tone,
          fg: textOn(tone),
          img,
          price: Number.isFinite(it.price) ? it.price : null,
          stock: Number.isFinite(it.stock) ? it.stock : null,
        };
      }),
    }))
    .sort((a, b) => a.closesAt - b.closesAt);
  return { tz, weeks, paymentNote: String(raw.paymentNote || "") };
}

const { weeks: WEEKS, paymentNote } = await loadMenu();

// ?now=2026-11-05 previews the site as of another date
const nowParam = new URLSearchParams(location.search).get("now");
const t0 = nowParam ? new Date(nowParam + "T09:00:00").getTime() : Date.now();
const loadedAt = Date.now();
const nowMs = () => t0 + (Date.now() - loadedAt);

const idx = WEEKS.findIndex((w) => w.closesAt > nowMs());
const cur = WEEKS[idx];
const next = idx >= 0 ? WEEKS[idx + 1] : undefined;
const after = idx >= 0 ? WEEKS[idx + 2] : undefined;

/* ───────────── Formatting ───────────── */

const ymd = (s) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const wk = (s) => ymd(s).toLocaleDateString("en-US", { weekday: "short" });
const md = (s) => `${ymd(s).getMonth() + 1}/${ymd(s).getDate()}`;
const day = (s) => `${wk(s)} ${md(s)}`;
const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const hour12 = (s) => {
  const [h, m] = s.split("T")[1].split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h >= 12 ? "PM" : "AM"}`;
};

function remaining() {
  const ms = cur.closesAt - nowMs();
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m % 60}m`;
}

const dateRows = (w) => `
  <div><dt>訂單截止 · Order by</dt><dd>${day(w.deadline)}, ${hour12(w.deadline)}</dd></div>
  <div><dt>早上送貨 · Delivered</dt><dd>${day(w.delivery)} morning</dd></div>`;

/* ───────────── Order page ───────────── */

const cart = {}; // bread id -> quantity
let sold = {}; // bread id -> already taken (from the server)
let closed = !cur;

const left = (it) => (it.stock == null ? Infinity : Math.max(0, it.stock - (sold[it.id] || 0)));
const qtyOf = (it) => cart[it.id] || 0;
const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
const priceable = () => cur.items.filter((it) => qtyOf(it)).every((it) => it.price != null);
const total = () => cur.items.reduce((s, it) => s + (it.price || 0) * qtyOf(it), 0);

const layerFor = (it) =>
  it.img
    ? `<img src="${it.img}" alt="${it.zh}">`
    : `<span class="ph" style="background:linear-gradient(160deg, color-mix(in srgb, ${it.tone} 82%, #fff), ${it.tone})"></span>`;

function buildCards() {
  $("#cards").innerHTML = cur.items
    .map(
      (it, i) => `
      <li class="card" data-id="${esc(it.id)}">
        <button class="c-arch" type="button" aria-label="Add ${it.en || it.zh}">
          ${layerFor(it)}
          <span class="c-no">0${i + 1}</span>
          <span class="c-sold"><b>售完</b><em>Sold out</em></span>
        </button>
        <div class="c-body">
          <div class="c-head">
            <div><h3>${it.zh}</h3><p>${it.en}</p></div>
            ${it.price != null ? `<span class="c-price">${money(it.price)}</span>` : ""}
          </div>
          ${it.stock != null ? `<div class="c-stock"><span class="dots" aria-hidden="true">${"<i></i>".repeat(Math.min(it.stock, 24))}</span><em class="left"></em></div>` : `<div class="c-stock"><em class="left">Made to order · 現做</em></div>`}
          <div class="stepper">
            <button type="button" class="sm" aria-label="Remove one ${it.en || it.zh}">−</button>
            <output>0</output>
            <button type="button" class="sp" aria-label="Add one ${it.en || it.zh}">+</button>
          </div>
        </div>
      </li>`
    )
    .join("");
}

function paint() {
  cur.items.forEach((it) => {
    const el = $(`.card[data-id="${CSS.escape(it.id)}"]`);
    if (!el) return;
    const l = left(it);
    const q = qtyOf(it);
    const out = l === 0;
    el.classList.toggle("soldout", out);
    el.classList.toggle("picked", q > 0);
    el.querySelector("output").textContent = q;
    el.querySelector(".sm").disabled = q === 0 || closed;
    el.querySelector(".sp").disabled = out || q >= l || closed;
    el.querySelector(".c-arch").disabled = out || closed;
    if (it.stock != null) {
      const text = out ? "Sold out · 售完" : l === 1 ? "Last one · 最後一個" : `${l} left · 剩 ${l}`;
      el.querySelector(".left").textContent = text;
      const dots = el.querySelectorAll(".dots i");
      const takenFromEnd = Math.min(sold[it.id] || 0, dots.length);
      dots.forEach((d, n) => {
        const remainingIdx = dots.length - takenFromEnd; // first N dots are still available
        d.className = n >= remainingIdx ? "t" : n < q ? "m" : "";
      });
    }
  });

  const n = count();
  const bar = $("#cartbar");
  bar.hidden = n === 0 || closed;
  $("#cb-count").textContent = `${n} ${n === 1 ? "bread" : "breads"}`;
  $("#cb-total").textContent = n && priceable() ? money(total()) : "";
  document.body.classList.toggle("has-cart", n > 0 && !closed);
}

function clampCart() {
  cur.items.forEach((it) => {
    const l = left(it);
    if (qtyOf(it) > l) {
      if (l === 0) delete cart[it.id];
      else cart[it.id] = l;
    }
  });
}

function setClosed() {
  closed = true;
  const note = $("#closed-note");
  note.hidden = false;
  note.textContent = "Orders for this week are closed. 本週訂單已截止，下週見！";
  $("#nav-count").textContent = "Orders closed";
  if ($("#sheet").open) closeSheet();
  paint();
}

if (cur) {
  buildCards();
  $("#shop-meta").innerHTML = `
    <div><dt>訂單截止 · Order by</dt><dd>${day(cur.deadline)}, ${hour12(cur.deadline)}</dd><em id="m-count"></em></div>
    <div><dt>早上送貨 · Delivered</dt><dd>${day(cur.delivery)} morning</dd></div>`;

  const tick = () => {
    const r = remaining();
    if (r == null) return closed || setClosed();
    $("#m-count").textContent = `${r} left`;
    $("#nav-count").textContent = `Orders close in ${r}`;
  };
  tick();
  setInterval(tick, 30000);

  $("#cards").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const it = cur.items.find((x) => x.id === card.dataset.id);
    const add = e.target.closest(".sp, .c-arch");
    const sub = e.target.closest(".sm");
    if (add && !add.disabled && qtyOf(it) < left(it)) cart[it.id] = qtyOf(it) + 1;
    else if (sub && !sub.disabled) {
      cart[it.id] = qtyOf(it) - 1;
      if (!cart[it.id]) delete cart[it.id];
    } else return;
    paint();
  });

  // live stock: fetch now, then every 20s while the tab is visible
  const refreshStock = async () => {
    if (closed || document.hidden) return;
    try {
      const r = await fetch(`/api/stock?week=${encodeURIComponent(cur.id)}`, { cache: "no-store" });
      if (!r.ok) return;
      sold = (await r.json()).sold || {};
      clampCart();
      paint();
    } catch {}
  };
  paint();
  refreshStock();
  setInterval(refreshStock, 20000);
  document.addEventListener("visibilitychange", refreshStock);
} else {
  $("#cards").hidden = true;
  $("#shop-meta").hidden = true;
  const note = $("#closed-note");
  note.hidden = false;
  note.textContent = "New breads are coming soon. 新麵包準備中，敬請期待！";
  $("#nav-count").textContent = "Orders closed";
  closed = true;
}

/* ───────────── Checkout drawer ───────────── */

const sheet = $("#sheet");
const form = $("#order-form");
let lenis;

const KEY = "bread-co-customer";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
})();

const lineHTML = (it, q) =>
  `<li><span class="l-q">${q}×</span><span class="l-n">${it.zh}<small>${it.en}</small></span><span class="l-p">${it.price != null ? money(it.price * q) : ""}</span></li>`;

function openSheet() {
  if (!count() || closed) return;
  $("#sheet-form").hidden = false;
  $("#sheet-done").hidden = true;
  $("#form-err").textContent = "";
  $("#lines").innerHTML = cur.items.filter(qtyOf).map((it) => lineHTML(it, qtyOf(it))).join("");
  $("#total").textContent = priceable() ? money(total()) : "—";
  for (const k of ["name", "contact", "address"]) if (saved[k] && !form.elements[k].value) form.elements[k].value = saved[k];
  const pn = $("#pay-note");
  pn.hidden = !paymentNote;
  pn.textContent = paymentNote;
  $("#place").disabled = false;
  $("#place").textContent = "Place order";
  if (!sheet.open) sheet.showModal();
  lenis?.stop();
}
function closeSheet() {
  if (sheet.open) sheet.close();
  lenis?.start();
}
sheet.addEventListener("close", () => lenis?.start());
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeSheet(); // click on the backdrop
});
$("#sheet-x").addEventListener("click", closeSheet);
$("#done-close").addEventListener("click", closeSheet);
$("#cb-go").addEventListener("click", openSheet);
$("#nav-order").addEventListener("click", () => {
  if (count() && !closed) openSheet();
  else lenis ? lenis.scrollTo("#order") : $("#order").scrollIntoView({ behavior: "smooth" });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#form-err");
  err.textContent = "";
  const data = Object.fromEntries(new FormData(form));
  if (!data.name.trim() || !data.contact.trim() || !data.address.trim()) {
    err.textContent = "Please fill in your name, contact and delivery address. 請填寫姓名、聯絡方式與地址。";
    return;
  }
  const btn = $("#place");
  btn.disabled = true;
  btn.textContent = "Placing order…";
  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        week: cur.id,
        items: Object.entries(cart).map(([id, qty]) => ({ id, qty })),
        name: data.name, contact: data.contact, address: data.address, note: data.note, hp: data.hp,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) return showDone(out, data);
    if (out.sold) sold = out.sold;
    if (res.status === 410) setClosed();
    clampCart();
    paint();
    // keep the drawer open so they can adjust; refresh its lines
    $("#lines").innerHTML = cur.items.filter(qtyOf).map((it) => lineHTML(it, qtyOf(it))).join("");
    $("#total").textContent = count() && priceable() ? money(total()) : "—";
    err.textContent = out.error || "Something went wrong. Please try again.";
    if (!count()) closeSheet();
  } catch {
    err.textContent = "Couldn't reach the server. Please check your connection and try again.";
  }
  btn.disabled = false;
  btn.textContent = "Place order";
});

function showDone(out, data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: data.name, contact: data.contact, address: data.address }));
  } catch {}
  const items = cur.items.filter(qtyOf);
  $("#done-name").textContent = data.name.trim() ? `, ${data.name.trim().split(/\s+/)[0]}` : "";
  $("#done-no").textContent = out.no ? `#${String(out.no).padStart(3, "0")}` : "";
  $("#done-lines").innerHTML = items.map((it) => lineHTML(it, qtyOf(it))).join("");
  $("#done-total").textContent = out.total != null ? money(out.total) : "—";
  $("#done-contact").textContent = data.contact.trim();
  $("#done-when").textContent = `${day(cur.delivery)} morning`;
  const dp = $("#done-pay");
  dp.hidden = !paymentNote;
  dp.textContent = paymentNote;
  if (out.sold) sold = out.sold;
  for (const k of Object.keys(cart)) delete cart[k];
  form.elements.note.value = "";
  paint();
  $("#sheet-form").hidden = true;
  $("#sheet-done").hidden = false;
  sheet.querySelector(".sheet-in").scrollTop = 0;
}

/* ───────────── Next week ───────────── */

if (next) {
  $("#next").hidden = false;
  $("#next-dates").innerHTML = dateRows(next);
  $("#rows").innerHTML = next.items
    .map(
      (it, i) => `
      <li class="row rv">
        <span class="row-no">0${i + 1}</span>
        <strong>${it.zh}</strong>
        <i></i>
        <em>${it.en}${it.price != null ? ` · ${money(it.price)}` : ""}</em>
      </li>`
    )
    .join("");
  if (after) {
    const a = $("#after");
    a.hidden = false;
    a.innerHTML = `
      <p class="label">The week after · ${md(after.delivery)}</p>
      <p class="names">${after.items.map((it) => `<span>${it.zh}<small>${it.en}</small></span>`).join("")}</p>`;
  }
}

/* ───────────── Wordmark, nav theme, reveals ───────────── */

// Scale the footer wordmark so it spans edge to edge
function fit(el) {
  const span = el.firstElementChild;
  el.style.fontSize = "100px";
  const w = span.getBoundingClientRect().width;
  el.style.fontSize = `${(100 * el.clientWidth) / w}px`;
}
const foot = $("#foot-mark");
fit(foot);
addEventListener("resize", () => fit(foot));
document.fonts?.ready.then(() => fit(foot));

// Hero wordmark rises letter by letter
const mark = $("#mark");
mark.firstElementChild.innerHTML = [...mark.textContent.trim()]
  .map((c, i) => `<span class="ch" style="--i:${i}">${c === " " ? "&nbsp;" : c}</span>`)
  .join("");
document.fonts?.ready.then(() => requestAnimationFrame(() => mark.classList.add("in")));
setTimeout(() => mark.classList.add("in"), 2000); // never leave it hidden

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
st.innerHTML = st.textContent.trim().split(/\s+/).map((w) => `<span>${w}</span>`).join(" ");
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
  lenis = new Lenis({ duration: 1.15, anchors: true });
  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
