const $ = (s) => document.querySelector(s);
const SWATCHES = ["#3a2216", "#a9581f", "#cf8a38", "#d9a35f", "#e3bf73", "#e6d8ba", "#8a9468", "#6b7140", "#7a2e3a", "#c9b79a"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let weeks = [];
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
  weeks = saved.weeks || (await fetch("/data/weeks.json").then((r) => r.json()).then((d) => d.weeks).catch(() => []));
  weeks.sort((a, b) => a.deadline.localeCompare(b.deadline));
  $("#gate").hidden = true;
  $("#app").hidden = false;
  render();
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

/* ───────────── render ───────────── */

function badge(i) {
  const now = new Date();
  const upcoming = weeks.map((w, n) => [w, n]).filter(([w]) => parse(w.deadline) > now).map(([, n]) => n);
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

function render() {
  $("#weeks").innerHTML = weeks
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

/* ───────────── editing ───────────── */

const wkOf = (el) => weeks[+el.closest(".week").dataset.w];
const itOf = (el) => wkOf(el).items[+el.closest(".item").dataset.i];

$("#weeks").addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.f) {
    itOf(t)[t.dataset.f] = t.value;
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
    weeks.sort((a, b) => a.deadline.localeCompare(b.deadline));
    render();
  } else if (t.type === "file" && t.files[0]) {
    await upload(t);
  }
});

$("#weeks").addEventListener("click", (e) => {
  const sw = e.target.closest(".sw");
  if (sw) {
    itOf(sw).tone = sw.dataset.c;
    markDirty();
    return render();
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "add-item") {
    const w = wkOf(b);
    if (w.items.length >= 8) return;
    w.items.push({ zh: "", en: "", tone: SWATCHES[w.items.length % SWATCHES.length], img: "" });
  } else if (act === "rm-item") {
    const w = wkOf(b);
    if (w.items.length <= 1) return;
    w.items.splice(+b.closest(".item").dataset.i, 1);
  } else if (act === "rm-photo") {
    itOf(b).img = "";
  } else if (act === "del-week") {
    if (!confirm("Delete this whole week?")) return;
    weeks.splice(+b.closest(".week").dataset.w, 1);
  }
  markDirty();
  render();
});

$("#add-week").addEventListener("click", () => {
  const last = weeks[weeks.length - 1];
  const base = last ? parse(last.deadline) : new Date();
  const dl = new Date(base);
  dl.setDate(dl.getDate() + 7);
  if (!last) dl.setHours(17, 0, 0, 0);
  const dv = last ? parse(last.delivery) : new Date(dl);
  dv.setDate(dv.getDate() + (last ? 7 : 2));
  weeks.push({
    deadline: toDT(dl),
    delivery: toD(dv),
    items: [0, 1, 2].map((n) => ({ zh: "", en: "", tone: SWATCHES[n * 3 % SWATCHES.length], img: "" })),
  });
  markDirty();
  render();
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
    render();
  } catch (err) {
    setStatus(err.message, "err");
  }
}

/* ───────────── save ───────────── */

$("#save").addEventListener("click", async () => {
  for (const w of weeks) {
    if (!w.deadline || !w.delivery) return setStatus("Every week needs a deadline and delivery day", "err");
    if (w.items.some((it) => !it.zh.trim())) return setStatus("Every bread needs a Chinese name", "err");
  }
  weeks.sort((a, b) => a.deadline.localeCompare(b.deadline));
  try {
    setStatus("Saving…");
    $("#save").disabled = true;
    await api("/api/weeks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ weeks }) });
    markDirty(false);
    setStatus("Saved — the site is updated", "ok");
    render();
  } catch (err) {
    $("#save").disabled = false;
    setStatus(err.status === 401 ? "Password no longer valid — reload" : err.message, "err");
  }
});
