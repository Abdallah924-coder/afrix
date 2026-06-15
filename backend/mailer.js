import {
  ADMIN_ALERT_EMAIL,
  APP_URL,
  BREVO_API_KEY,
  BREVO_API_URL,
  BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME,
  SUPPORT_EMAIL,
  logger
} from "./config.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function maskEmail(email = "") {
  const normalized = String(email).trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return normalized;
  return `${local.slice(0, 2)}***@${domain}`;
}

function buildMailHtml({ title, intro, rows = [], actionLabel, actionUrl }) {
  const rowsHtml = rows
    .filter((row) => row?.label && row.value !== undefined && row.value !== null && row.value !== "")
    .map((row) => `
      <tr>
        <td style="padding:10px 0;color:#60716b;border-bottom:1px solid #e8efec;">${escapeHtml(row.label)}</td>
        <td style="padding:10px 0;text-align:right;font-weight:700;color:#14231f;border-bottom:1px solid #e8efec;">${escapeHtml(row.value)}</td>
      </tr>
    `).join("");

  return `
    <div style="margin:0;padding:28px 14px;background:#eef4f1;font-family:Arial,sans-serif;color:#14231f;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dce8e3;">
        <div style="padding:28px;background:#0f5d43;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">AFRIX</div>
          <h1 style="margin:12px 0 8px;font-size:26px;line-height:1.2;">${escapeHtml(title)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:rgba(255,255,255,.88);">${escapeHtml(intro)}</p>
        </div>
        <div style="padding:26px;">
          ${rowsHtml ? `<table style="width:100%;border-collapse:collapse;margin-bottom:22px;">${rowsHtml}</table>` : ""}
          ${actionLabel && actionUrl ? `
            <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0f5d43;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700;">
              ${escapeHtml(actionLabel)}
            </a>
          ` : ""}
          <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#74837e;">
            Support: ${escapeHtml(SUPPORT_EMAIL || "support AFRIX")}
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function sendBrevoMail({ to, subject, title, intro, rows, actionLabel, actionUrl }) {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !to) {
    logger.warn({ to: maskEmail(to), subject }, "Brevo email skipped: provider not configured");
    return { delivered: false };
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        ...(SUPPORT_EMAIL ? { replyTo: { name: "Support AFRIX", email: SUPPORT_EMAIL } } : {}),
        subject,
        htmlContent: buildMailHtml({ title, intro, rows, actionLabel, actionUrl })
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo ${response.status}: ${body.slice(0, 300)}`);
    }

    logger.info({ to: maskEmail(to), subject }, "Brevo email accepted");
    return { delivered: true };
  } catch (error) {
    logger.error({ err: error, to: maskEmail(to), subject }, "Brevo email failed");
    return { delivered: false, error: error.message };
  }
}

export async function notifyAdmin(subject, title, intro, rows = []) {
  if (!ADMIN_ALERT_EMAIL) return;
  await sendBrevoMail({ to: ADMIN_ALERT_EMAIL, subject, title, intro, rows, actionLabel: "Ouvrir AFRIX", actionUrl: `${APP_URL}/admin` });
}
