import "server-only";
import nodemailer from "nodemailer";

type Attachment = { filename: string; content: Buffer; contentType?: string };
type Mail = { to: string; subject: string; text: string; html: string; attachments?: Attachment[] };
type OtpPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD" | "CHANGE_EMAIL";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

/**
 * Sends an email over SMTP. In development without SMTP configured, the email
 * is printed to the server console so the flow can still be tested.
 */
export async function sendEmail(mail: Mail) {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[dev email] To: ${mail.to}\n[dev email] Subject: ${mail.subject}\n[dev email] ${mail.text}\n`);
      return;
    }
    throw new Error("SMTP is not configured (SMTP_HOST is empty).");
  }
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    ...mail,
  });
}

const OTP_COPY: Record<OtpPurpose, { subject: string; title: string; lead: string; ignore: string }> = {
  VERIFY_EMAIL: {
    subject: "is your Spendwise verification code",
    title: "Verify your email",
    lead: "use this code to finish creating your Spendwise account:",
    ignore: "If you didn't sign up, you can ignore this email.",
  },
  RESET_PASSWORD: {
    subject: "is your Spendwise password reset code",
    title: "Reset your password",
    lead: "use this code to choose a new Spendwise password:",
    ignore: "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
  },
  CHANGE_EMAIL: {
    subject: "confirms your new Spendwise email",
    title: "Confirm your new email",
    lead: "use this code to make this address your Spendwise login email:",
    ignore: "If you didn't ask for this, you can ignore this email.",
  },
};

export function otpEmail(
  username: string,
  code: string,
  minutes: number,
  purpose: OtpPurpose = "VERIFY_EMAIL",
): Omit<Mail, "to"> {
  const copy = OTP_COPY[purpose];
  const subject = `${code} ${copy.subject}`;
  const text = `Hi ${username}, ${copy.lead} ${code}. It expires in ${minutes} minutes. ${copy.ignore}`;
  const html = layout(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px">${copy.title}</p>
    <p style="margin:0 0 20px;color:#555a6e">Hi ${escapeHtml(username)}, ${copy.lead}</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 20px;color:#3b4bd8">${code}</p>
    <p style="margin:0;color:#555a6e;font-size:13px">The code expires in ${minutes} minutes. ${copy.ignore}</p>`);
  return { subject, text, html };
}

/** A short notification email: a title and plain-text paragraphs. */
export function noticeEmail(title: string, lines: string[]): Omit<Mail, "to"> {
  const html = layout(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px">${escapeHtml(title)}</p>
    ${lines.map((l) => `<p style="margin:0 0 12px;color:#555a6e">${escapeHtml(l)}</p>`).join("")}`);
  return { subject: title, text: lines.join("\n\n"), html };
}

function layout(inner: string) {
  return `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2133">${inner}</div>`;
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
