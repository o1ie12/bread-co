import nodemailer from "nodemailer";

// Sends mail through either Resend (RESEND_API_KEY + EMAIL_FROM) or a Gmail account
// (GMAIL_USER + GMAIL_APP_PASSWORD). If neither is configured, emails are simply skipped.
export const emailEnabled = () => !!(process.env.RESEND_API_KEY || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD));

const withTimeout = (p, ms = 9000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Email timed out")), ms))]);

export async function sendMail({ to, subject, html, text, replyTo }) {
  const fromName = process.env.EMAIL_FROM_NAME || "Bread Co.";
  if (process.env.RESEND_API_KEY) {
    const from = process.env.EMAIL_FROM || `${fromName} <onboarding@resend.dev>`;
    const res = await withTimeout(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      })
    );
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  const user = process.env.GMAIL_USER;
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: process.env.GMAIL_APP_PASSWORD } });
  await withTimeout(transport.sendMail({ from: `"${fromName}" <${user}>`, to, subject, html, text, ...(replyTo ? { replyTo } : {}) }));
}

/* ───────────── message building ───────────── */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => (n == null ? "" : `$${Number.isInteger(n) ? n : n.toFixed(2)}`);
const dayLabel = (s) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dt.toLocaleDateString("en-US", { weekday: "short" })} ${m}/${d}`;
};
export const PAYMENT_LABEL = { cash: ["當面現金", "In-person cash"] };

// Confirmation to the customer (bilingual)
export function confirmationEmail(order, week, paymentNote) {
  const no = `#${String(order.no).padStart(3, "0")}`;
  const when = `${dayLabel(week.delivery)} morning · ${dayLabel(week.delivery)} 早上送貨`;
  const [payZh, payEn] = PAYMENT_LABEL[order.payment] || ["", order.payment];
  const rows = order.items
    .map((i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e2d8c6"><span style="color:#a9581f">${i.qty}×</span>&nbsp; <span style="font-size:17px">${esc(i.zh)}</span><br><span style="color:#8b7a66;font-size:13px">${esc(i.en)}</span></td><td style="padding:10px 0;border-bottom:1px solid #e2d8c6;text-align:right">${i.price != null ? money(i.price * i.qty) : ""}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4eee3;padding:24px 12px;font-family:Georgia,'Noto Serif TC',serif;color:#2b1b12">
  <div style="max-width:520px;margin:0 auto;background:#fbf7ef;padding:32px 28px">
    <p style="margin:0 0 4px;font:600 12px Arial,sans-serif;letter-spacing:2px;color:#8b7a66">BREAD CO. · 訂單確認</p>
    <h1 style="margin:0 0 6px;font-size:28px;font-weight:500">Thank you, ${esc(order.name.split(/\s+/)[0])}.</h1>
    <p style="margin:0 0 22px;color:#8b7a66">Your order ${esc(no)} is confirmed. 您的訂單 ${esc(no)} 已成立。</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}
      ${order.total != null ? `<tr><td style="padding:14px 0 0;color:#8b7a66;font:600 12px Arial,sans-serif;letter-spacing:2px">TOTAL 合計</td><td style="padding:14px 0 0;text-align:right;font-size:22px">${money(order.total)}</td></tr>` : ""}
    </table>
    <p style="margin:24px 0 4px;font:600 12px Arial,sans-serif;letter-spacing:2px;color:#8b7a66">DELIVERY 送貨</p>
    <p style="margin:0 0 16px">${esc(when)}</p>
    <p style="margin:0 0 4px;font:600 12px Arial,sans-serif;letter-spacing:2px;color:#8b7a66">PAYMENT 付款方式</p>
    <p style="margin:0 0 16px">${esc(payZh)} · ${esc(payEn)}${paymentNote ? `<br><span style="color:#8b7a66">${esc(paymentNote)}</span>` : ""}</p>
    ${order.note ? `<p style="margin:0 0 4px;font:600 12px Arial,sans-serif;letter-spacing:2px;color:#8b7a66">YOUR NOTE 備註</p><p style="margin:0 0 16px">${esc(order.note)}</p>` : ""}
    <p style="margin:26px 0 0;color:#8b7a66;font-size:14px">Just reply to this email if anything needs to change. 如需更改請直接回覆此信。</p>
  </div></body></html>`;
  const text = [
    `Thank you, ${order.name}. Your order ${no} is confirmed. 您的訂單 ${no} 已成立。`,
    "",
    ...order.items.map((i) => `${i.qty}x ${i.zh} ${i.en || ""}${i.price != null ? "  " + money(i.price * i.qty) : ""}`),
    order.total != null ? `Total 合計: ${money(order.total)}` : "",
    "",
    `Delivery 送貨: ${when}`,
    `Payment 付款方式: ${payZh} / ${payEn}${paymentNote ? " — " + paymentNote : ""}`,
    order.note ? `Note 備註: ${order.note}` : "",
    "",
    "Reply to this email if anything needs to change. 如需更改請直接回覆此信。",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
  return { subject: `Bread Co. 訂單確認 · Order ${no}`, html, text };
}

// Heads-up to the shop owner
export function ownerEmail(order, week, adminUrl) {
  const no = `#${String(order.no).padStart(3, "0")}`;
  const lines = order.items.map((i) => `${i.qty}× ${i.zh} ${i.en || ""}`.trim());
  const text = [
    `New order ${no}${order.total != null ? " — " + money(order.total) : ""}`,
    `${order.name} <${order.email}>`,
    `Payment: ${(PAYMENT_LABEL[order.payment] || [])[1] || order.payment}`,
    ...lines,
    order.note ? `Note: ${order.note}` : "",
    `Delivery: ${dayLabel(week.delivery)} morning`,
    `Manage orders: ${adminUrl}`,
  ].filter(Boolean).join("\n");
  return { subject: `New order ${no} — ${order.name}`, text, html: `<pre style="font:14px/1.5 Arial,sans-serif">${esc(text)}</pre>` };
}
