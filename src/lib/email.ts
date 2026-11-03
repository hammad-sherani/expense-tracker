import "server-only";
import nodemailer from "nodemailer";

type Mail = { to: string; subject: string; text: string; html: string };

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

export function otpEmail(username: string, code: string, minutes: number): Omit<Mail, "to"> {
  const subject = `${code} is your Spendwise verification code`;
  const text = `Hi ${username}, your Spendwise verification code is ${code}. It expires in ${minutes} minutes. If you didn't sign up, you can ignore this email.`;
  const html = `
  <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2133">
    <p style="font-size:18px;font-weight:600;margin:0 0 16px">Verify your email</p>
    <p style="margin:0 0 20px;color:#555a6e">Hi ${escapeHtml(username)}, use this code to finish creating your Spendwise account:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 20px;color:#3b4bd8">${code}</p>
    <p style="margin:0;color:#555a6e;font-size:13px">The code expires in ${minutes} minutes. If you didn't sign up, you can ignore this email.</p>
  </div>`;
  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
