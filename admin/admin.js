import { wallToEpoch } from "../shared/time.js";

const $ = (s) => document.querySelector(s);
const SWATCHES = ["#3a2216", "#a9581f", "#cf8a38", "#d9a35f", "#e3bf73", "#e6d8ba", "#8a9468", "#6b7140", "#7a2e3a", "#c9b79a"];
const ZONES = [
  ["Asia/Taipei", "Taipei (UTC+8)"], ["Asia/Hong_Kong", "Hong Kong"], ["Asia/Singapore", "Singapore"], ["Asia/Tokyo", "Tokyo"],
  ["America/Los_Angeles", "Los Angeles / Vancouver"], ["America/Denver", "Denver"], ["America/Chicago", "Chicago"],
  ["America/New_York", "New York / Toronto"], ["Europe/London", "London"], ["Australia/Sydney", "Sydney"],
];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const rid = (p) => p + Math.random().toString(36).slice(2, 8);

let cfg = { v: 2, timezone: "Asia/Taipei", paymentNote: "", weeks: [] };
let pw = sessionStorage.getItem("bc-pw") || "";
let dirty = false;

/* ───────────── helpers ───────────── */

const pad = (n) => String(n).padStart(2, "0");
const toDT = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toD = (d) => toDT(d).slice(0, 10);
const parse = (s) => {
  const [d, t = "00:00"] = s.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, dd, hh, mm);
};
const fmt = (s) => parse(s).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
const money = (n) => (n == null ? "" : `$${Number.isInteger(n) ? n : n.toFixed(2)}`);
const closesAt = (w) => wallToEpoch(w.deadline, cfg.timezone);

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "x-admin-password": pw, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}

function setStatus(text, cls = "") {
  const el = $("#status");
  el.textContent = text;
  el.className = cls;
}
function markDirty(on = true) {
  dirty = on;
  $("#save").disabled = !on;
  if (on) setStatus("Unsaved changes");
}
addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault();
});

/* ───────────── login ───────────── */

async function unlock(password) {
  pw = password;
  await api("/api/auth");
  sessionStorage.setItem("bc-pw", pw);
  const saved = await fetch("/api/weeks", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
  cfg = saved.v === 2 && saved.weeks ? saved : await fetch("/data/weeks.json").then((r) => r.json()).catch(() => cfg);
  cfg.weeks.sort((a, b) => a.deadline.localeCompare(b.deadline));
  $("#gate").hidden = true;
  $("#app").hidden = false;
  initSettings();
  renderMenu();
  pickDefaultWeek();
  loadOrders();
}

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-msg").textContent = "";
  try {
    await unlock($("#pw").value);
  } catch (err) {
    $("#login-msg").textContent = err.status === 401 ? "Wrong password." : err.message;
  }
});
if (pw) unlock(pw).catch(() => sessionStorage.removeItem("bc-pw"));

/* ───────────── tabs ───────────── */

function showTab(name) {
  for (const t of ["orders", "menu"]) {
    $(`#view-${t}`).hidden = t !== name;
    $(`#tab-${t}`).classList.toggle("on", t === name);
  }
  $("#savebar").hidden = name !== "menu";
  if (name === "orders") loadOrders();
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

/* ───────────── MENU: settings ───────────── */

function initSettings() {
  const zones = ZONES.some(([z]) => z === cfg.timezone) ? ZONES : [[cfg.timezone, cfg.timezone], ...ZONES];
  $("#tz").innerHTML = zones.map(([z, n]) => `<option value="${esc(z)}"${z === cfg.timezone ? " selected" : ""}>${esc(n)}</option>`).join("");
  $("#pay").value = cfg.paymentNote || "";
}
$("#tz").addEventListener("change", (e) => {
  cfg.timezone = e.target.value;
  markDirty();
  renderMenu();
});
$("#pay").addEventListener("input", (e) => {
  cfg.paymentNote = e.target.value;
  markDirty();
});

/* ───────────── MENU: render ───────────── */

function badge(i) {
  const now = Date.now();
  const upcoming = cfg.weeks.map((w, n) => [w, n]).filter(([w]) => closesAt(w) > now).map(([, n]) => n);
  if (!upcoming.includes(i)) return ["Past", ""];
  if (upcoming[0] === i) return ["Live now · this week", "live"];
  if (upcoming[1] === i) return ["Next week", ""];
  return ["Later", ""];
}

function itemHTML(it, wi, ii) {
  const thumb = it.img ? `background-image:url('${esc(it.img)}')` : `background:${esc(it.tone)}`;
  return `
    <div class="item" data-w="${wi}" data-i="${ii}">
      <label class="photo"><span class="thumb" style="${thumb}" data-t="${it.img ? "" : "Add photo"}"></span><input type="file" accept="image/*"></label>
      <div class="fields">
        <label>中文名稱<input class="zh" data-f="zh" value="${esc(it.zh)}" placeholder="例如：巧克力麵包"></label>
        <label>English name<input data-f="en" value="${esc(it.en)}" placeholder="e.g. Chocolate Bread"></label>
        <div class="pair">
          <label>Price ($)<input data-f="price" type="number" min="0" step="0.5" inputmode="decimal" value="${it.price ?? ""}" placeholder="40"></label>
          <label>Stock (empty = unlimited)<input data-f="stock" type="number" min="0" step="1" inputmode="numeric" value="${it.stock ?? ""}" placeholder="10"></label>
        </div>
        <div>
          <label style="margin-bottom:8px">Colour (shown until a photo is added)</label>
          <div class="swatches">${SWATCHES.map((c) => `<button type="button" class="sw${c === it.tone ? " on" : ""}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div>
        </div>
      </div>
      <div class="item-end">
        ${it.img ? `<button type="button" class="link-btn" data-act="rm-photo">Remove photo</button>` : "<span></span>"}
        <button type="button" class="x" data-act="rm-item" title="Remove bread" aria-label="Remove bread">×</button>
      </div>
    </div>`;
}

function renderMenu() {
  $("#weeks").innerHTML = cfg.weeks
    .map((w, wi) => {
      const [text, cls] = badge(wi);
      return `
      <article class="week${text === "Past" ? " past" : ""}" data-w="${wi}">
        <div class="wk-head">
          <div><span class="badge ${cls}">${text}</span><h2>Delivery ${esc(fmt(w.delivery))}</h2></div>
          <button type="button" class="link-btn" data-act="del-week">Delete week</button>
        </div>
        <div class="dates">
          <label>Order deadline<input type="datetime-local" data-d="deadline" value="${esc(w.deadline)}"></label>
          <label>Delivery day<input type="date" data-d="delivery" value="${esc(w.delivery)}"></label>
        </div>
        ${w.items.map((it, ii) => itemHTML(it, wi, ii)).join("")}
        <button type="button" class="btn ghost add-bread" data-act="add-item">+ Add a bread</button>
      </article>`;
    })
    .join("");
}

/* ───────────── MENU: editing ───────────── */

const wkOf = (el) => cfg.weeks[+el.closest(".week").dataset.w];
const itOf = (el) => wkOf(el).items[+el.closest(".item").dataset.i];
const numOrNull = (v, int) => (v === "" || v == null ? null : int ? Math.max(0, Math.floor(Number(v))) : Math.max(0, Number(v)));

$("#weeks").addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.f) {
    const f = t.dataset.f;
    itOf(t)[f] = f === "price" ? numOrNull(t.value, false) : f === "stock" ? numOrNull(t.value, true) : t.value;
    markDirty();
  } else if (t.dataset.d) {
    wkOf(t)[t.dataset.d] = t.value;
    markDirty();
  }
});

// re-sort and refresh badges once a date has been chosen
$("#weeks").addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.d) {
    if (!t.value) return;
    cfg.weeks.sort((a, b) => a.deadline.localeCompare(b.deadline));
    renderMenu();
  } else if (t.type === "file" && t.files[0]) {
    await upload(t);
  }
});

$("#weeks").addEventListener("click", (e) => {
  const sw = e.target.closest(".sw");
  if (sw) {
    itOf(sw).tone = sw.dataset.c;
    markDirty();
    return renderMenu();
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "add-item") {
    const w = wkOf(b);
    if (w.items.length >= 8) return;
    w.items.push({ id: rid("i"), zh: "", en: "", tone: SWATCHES[w.items.length % SWATCHES.length], img: "", price: null, stock: null });
  } else if (act === "rm-item") {
    const w = wkOf(b);
    if (w.items.length <= 1) return;
    if (!confirm("Remove this bread? Any orders already placed for it stay in the Orders list.")) return;
    w.items.splice(+b.closest(".item").dataset.i, 1);
  } else if (act === "rm-photo") {
    itOf(b).img = "";
  } else if (act === "del-week") {
    if (!confirm("Delete this whole week? Orders already placed for it stay stored but won't be shown here.")) return;
    cfg.weeks.splice(+b.closest(".week").dataset.w, 1);
  }
  markDirty();
  renderMenu();
});

$("#add-week").addEventListener("click", () => {
  const last = cfg.weeks[cfg.weeks.length - 1];
  const base = last ? parse(last.deadline) : new Date();
  const dl = new Date(base);
  dl.setDate(dl.getDate() + 7);
  if (!last) dl.setHours(17, 0, 0, 0);
  const dv = last ? parse(last.delivery) : new Date(dl);
  dv.setDate(dv.getDate() + (last ? 7 : 2));
  cfg.weeks.push({
    id: rid("w"),
    deadline: toDT(dl),
    delivery: toD(dv),
    items: [0, 1, 2].map((n) => ({ id: rid("i"), zh: "", en: "", tone: SWATCHES[(n * 3) % SWATCHES.length], img: "", price: null, stock: null })),
  });
  markDirty();
  renderMenu();
  document.querySelector(".week:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

/* ───────────── photos ───────────── */

// Shrink to max 1400px and re-encode as JPEG so uploads stay small and fast on a phone
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image"))), "image/jpeg", 0.86);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = URL.createObjectURL(file);
  });
}

async function upload(input) {
  const it = itOf(input);
  try {
    setStatus("Uploading photo…");
    const blob = await shrink(input.files[0]);
    const { url } = await api("/api/photo", { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
    it.img = url;
    markDirty();
    renderMenu();
  } catch (err) {
    setStatus(err.message, "err");
  }
}

/* ───────────── MENU: save ───────────── */

$("#save").addEventListener("click", async () => {
  for (const w of cfg.weeks) {
    if (!w.deadline || !w.delivery) return setStatus("Every week needs a deadline and delivery day", "err");
    if (w.items.some((it) => !it.zh.trim())) return setStatus("Every bread needs a Chinese name", "err");
  }
  cfg.weeks.sort((a, b) => a.deadline.localeCompare(b.deadline));
  try {
    setStatus("Saving…");
    $("#save").disabled = true;
    await api("/api/weeks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cfg) });
    markDirty(false);
    setStatus("Saved — the site is updated", "ok");
    renderMenu();
    fillWeekSelect();
  } catch (err) {
    $("#save").disabled = false;
    setStatus(err.status === 401 ? "Password no longer valid — reload" : err.message, "err");
  }
});

/* ───────────── ORDERS ───────────── */

let orders = [];
let sold = {};
let weekId = "";

function fillWeekSelect() {
  const sel = $("#ord-week");
  sel.innerHTML = cfg.weeks
    .map((w) => `<option value="${esc(w.id)}">${esc(fmt(w.delivery))} delivery · ${esc(w.items.map((i) => i.zh).join("、"))}</option>`)
    .join("");
  sel.value = weekId || cfg.weeks[0]?.id || "";
}

function pickDefaultWeek() {
  const now = Date.now();
  const live = cfg.weeks.find((w) => closesAt(w) > now) || cfg.weeks[cfg.weeks.length - 1];
  weekId = live?.id || "";
  fillWeekSelect();
}

$("#ord-week").addEventListener("change", (e) => {
  weekId = e.target.value;
  loadOrders();
});
$("#ord-refresh").addEventListener("click", loadOrders);

async function loadOrders() {
  if (!weekId) {
    $("#ord-summary").innerHTML = "";
    $("#ord-list").innerHTML = `<p class="empty">No weeks yet. Add one in the Menu tab.</p>`;
    return;
  }
  try {
    const out = await api(`/api/admin/orders?week=${encodeURIComponent(weekId)}`);
    orders = out.orders;
    sold = out.sold;
    renderOrders();
  } catch (err) {
    $("#ord-list").innerHTML = `<p class="empty err">${esc(err.message)}</p>`;
  }
}
setInterval(() => {
  if (!document.hidden && !$("#app").hidden && !$("#view-orders").hidden) loadOrders();
}, 30000);

function renderOrders() {
  const week = cfg.weeks.find((w) => w.id === weekId);
  const live = orders.filter((o) => o.status !== "cancelled");
  const revenue = live.reduce((s, o) => s + (o.total || 0), 0);

  // what to bake: per bread, taken vs stock
  const rows = (week?.items || []).map((it) => {
    const n = sold[it.id] || 0;
    const pct = it.stock ? Math.min(100, Math.round((n / it.stock) * 100)) : 0;
    return `<div class="sum-row"><span class="s-n">${esc(it.zh)}<small>${esc(it.en)}</small></span>
      <span class="s-bar"><i style="width:${it.stock ? pct : 0}%"></i></span>
      <span class="s-c"><b>${n}</b>${it.stock != null ? ` / ${it.stock}` : ""}</span></div>`;
  });
  $("#ord-summary").innerHTML = `
    <div class="week summary">
      <div class="sum-head"><div><p class="label">To bake</p></div>
        <div class="sum-tot"><b>${live.length}</b> orders${revenue ? ` · <b>${money(revenue)}</b>` : ""}</div></div>
      ${rows.join("")}
    </div>`;

  if (!orders.length) {
    $("#ord-list").innerHTML = `<p class="empty">No orders yet for this week.</p>`;
    return;
  }
  $("#ord-list").innerHTML = [...orders]
    .reverse()
    .map(
      (o) => `
    <article class="order${o.status === "cancelled" ? " cancelled" : ""}" data-no="${o.no}">
      <div class="o-top">
        <div><span class="o-no">#${String(o.no).padStart(3, "0")}</span><span class="o-time">${esc(new Date(o.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }))}</span></div>
        <select class="o-status" aria-label="Status">
          ${["new", "paid", "delivered", "cancelled"].map((s) => `<option value="${s}"${s === o.status ? " selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}
        </select>
      </div>
      <div class="o-body">
        <div class="o-who"><b>${esc(o.name)}</b><span>${esc(o.contact)}</span><span>${esc(o.address)}</span>${o.note ? `<em>“${esc(o.note)}”</em>` : ""}</div>
        <ul class="o-items">${o.items.map((i) => `<li><b>${i.qty}×</b> ${esc(i.zh)}${i.en ? ` <small>${esc(i.en)}</small>` : ""}</li>`).join("")}</ul>
        <div class="o-total">${o.total != null ? money(o.total) : ""}</div>
      </div>
    </article>`
    )
    .join("");
}

$("#ord-list").addEventListener("change", async (e) => {
  const sel = e.target.closest(".o-status");
  if (!sel) return;
  const card = sel.closest(".order");
  const no = Number(card.dataset.no);
  const prev = orders.find((o) => o.no === no).status;
  if (sel.value === "cancelled" && !confirm("Cancel this order? Its loaves go back on sale.")) {
    sel.value = prev;
    return;
  }
  try {
    await api("/api/admin/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ week: weekId, no, status: sel.value }) });
    await loadOrders();
  } catch (err) {
    alert(err.message);
    sel.value = prev;
  }
});

$("#ord-csv").addEventListener("click", () => {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Order", "Time", "Name", "Contact", "Address", "Items", "Total", "Status", "Note"];
  const lines = orders.map((o) =>
    [o.no, new Date(o.at).toLocaleString("en-US"), o.name, o.contact, o.address, o.items.map((i) => `${i.qty}x ${i.zh} ${i.en || ""}`.trim()).join("; "), o.total ?? "", o.status, o.note].map(q).join(",")
  );
  const blob = new Blob(["﻿" + [head.map(q).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bread-co-orders-${weekId}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
