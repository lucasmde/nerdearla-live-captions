// E-mail delivery for transcript exports. Provider is picked from the environment:
//   SMTP_URL=smtps://user:pass@smtp.gmail.com:465   (any SMTP; Gmail needs an "app password")
//   RESEND_API_KEY=re_...                             (https://resend.com, no SMTP needed)
// MAIL_FROM="Live Captions <captions@example.org>"
import nodemailer from 'nodemailer';

export function makeMailer(cfg, log) {
  const from = cfg.mailFrom || 'Live Captions <no-reply@localhost>';
  if (cfg.resendApiKey) {
    return {
      enabled: true, provider: 'resend',
      async send({ to, subject, text, attachments }) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { authorization: `Bearer ${cfg.resendApiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text, attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) }),
        });
        if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
      },
    };
  }
  if (cfg.smtpUrl) {
    const transport = nodemailer.createTransport(cfg.smtpUrl);
    return {
      enabled: true, provider: 'smtp',
      async send({ to, subject, text, attachments }) { await transport.sendMail({ from, to, subject, text, attachments }); },
    };
  }
  log?.('mail', 'no mail provider configured (set SMTP_URL or RESEND_API_KEY)');
  return { enabled: false, provider: null, async send() { throw new Error('mail not configured'); } };
}
