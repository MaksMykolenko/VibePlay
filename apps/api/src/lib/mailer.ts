import nodemailer from 'nodemailer';
import type { ApiEnv } from '@vibeplay/config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  readonly driver: 'smtp' | 'memory';
  send(message: MailMessage): Promise<void>;
  /** memory driver only — used by tests/E2E harness. */
  readonly outbox: MailMessage[];
  verify(): Promise<void>;
}

export function createMailer(env: ApiEnv): Mailer {
  if (env.EMAIL_DRIVER === 'memory') {
    const outbox: MailMessage[] = [];
    return {
      driver: 'memory',
      outbox,
      async send(message) {
        outbox.push(message);
      },
      async verify() {
        /* always healthy */
      },
    };
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });

  return {
    driver: 'smtp',
    outbox: [],
    async send(message) {
      await transport.sendMail({
        from: env.SMTP_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
    async verify() {
      await transport.verify();
    },
  };
}

// ---------------------------------------------------------------------------
// Templates (no secrets, short-lived one-time links, correct web origin)
// ---------------------------------------------------------------------------

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f5f6fa;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
${bodyHtml}
<p style="color:#888;font-size:12px;margin-top:32px">VibePlay private beta. If you didn't request this, you can safely ignore this email.</p>
</div></body></html>`;
}

export const emailTemplates = {
  verifyEmail(webOrigin: string, token: string): Omit<MailMessage, 'to'> {
    const url = `${webOrigin}/verify-email?token=${encodeURIComponent(token)}`;
    return {
      subject: 'Verify your VibePlay email',
      text: `Welcome to VibePlay! Confirm your email address by opening:\n\n${url}\n\nThis link expires in 24 hours and can be used once.`,
      html: layout(
        'Verify your email',
        `<p>Welcome to VibePlay! Confirm your email address:</p>
         <p><a href="${url}" style="background:#6c5ce7;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify email</a></p>
         <p style="font-size:13px;color:#666">Link expires in 24 hours and can be used once.</p>`,
      ),
    };
  },
  resetPassword(webOrigin: string, token: string): Omit<MailMessage, 'to'> {
    const url = `${webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    return {
      subject: 'Reset your VibePlay password',
      text: `Someone requested a password reset for your VibePlay account.\n\nReset it here (valid 60 minutes, single use):\n${url}\n\nIf this wasn't you, ignore this email — your password is unchanged.`,
      html: layout(
        'Reset your password',
        `<p>Someone requested a password reset for your VibePlay account.</p>
         <p><a href="${url}" style="background:#6c5ce7;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
         <p style="font-size:13px;color:#666">Valid for 60 minutes, single use. If this wasn't you, ignore this email.</p>`,
      ),
    };
  },
  gameApproved(webOrigin: string, title: string, slug: string): Omit<MailMessage, 'to'> {
    const url = `${webOrigin}/game/${slug}`;
    return {
      subject: `“${title}” is live on VibePlay`,
      text: `Good news — your game “${title}” passed review and is now published.\n\n${url}`,
      html: layout(
        'Your game is live 🎉',
        `<p>Good news — <strong>${escapeHtml(title)}</strong> passed review and is now published.</p>
         <p><a href="${url}">Open the game page</a></p>`,
      ),
    };
  },
  gameRejected(webOrigin: string, title: string, reason: string): Omit<MailMessage, 'to'> {
    const url = `${webOrigin}/creator/my-games`;
    return {
      subject: `“${title}” needs changes before it can be published`,
      text: `Your submission “${title}” was not approved.\n\nReason: ${reason}\n\nFix the issues and submit a new version: ${url}`,
      html: layout(
        'Submission rejected',
        `<p>Your submission <strong>${escapeHtml(title)}</strong> was not approved.</p>
         <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
         <p><a href="${url}">Open your creator dashboard</a></p>`,
      ),
    };
  },
  accountSuspended(reason: string): Omit<MailMessage, 'to'> {
    return {
      subject: 'Your VibePlay account has been suspended',
      text: `Your VibePlay account has been suspended.\n\nReason: ${reason}\n\nIf you believe this is a mistake, reply to this email to appeal.`,
      html: layout(
        'Account suspended',
        `<p>Your VibePlay account has been suspended.</p>
         <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
         <p>If you believe this is a mistake, reply to this email to appeal.</p>`,
      ),
    };
  },
};

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
