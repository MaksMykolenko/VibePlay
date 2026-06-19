import { loadApiEnv } from '@vibeplay/config';
import { createMailer } from '../lib/mailer.js';

function getRecipient(args: string[]): string {
  const toIndex = args.indexOf('--to');
  const recipient =
    toIndex >= 0 ? args[toIndex + 1] : args.find((arg) => arg.startsWith('--to='))?.slice(5);

  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('Invalid recipient');
  }

  return recipient;
}

async function main() {
  const toEmail = getRecipient(process.argv.slice(2));
  const env = loadApiEnv();

  console.log(`EMAIL_DRIVER=${env.EMAIL_DRIVER}`);
  console.log(`SMTP_HOST=${env.SMTP_HOST ? 'SET' : 'NOT_SET'}`);
  console.log(`SMTP_PORT=${env.SMTP_PORT}`);
  console.log(`SMTP_USER=${env.SMTP_USER ? 'SET' : 'NOT_SET'}`);
  console.log(`SMTP_PASSWORD=${env.SMTP_PASSWORD ? 'REDACTED' : 'NOT_SET'}`);

  if (env.EMAIL_DRIVER !== 'smtp') {
    throw new Error('SMTP driver is not configured');
  }

  const mailer = createMailer(env);
  await mailer.verify();
  console.log('Transport verify: OK');

  await mailer.send({
    to: toEmail,
    subject: 'VibePlay SMTP Test Email',
    text: 'This is a VibePlay SMTP configuration test. If you received it, the production mail transport is working.',
    html: `<!doctype html>
<html>
<body style="font-family:system-ui,sans-serif;background:#f5f6fa;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e1e8ed">
    <h1 style="font-size:20px;margin:0 0 16px;color:#1a202c">VibePlay SMTP Test</h1>
    <p style="color:#4a5568;line-height:1.6">This is a VibePlay SMTP configuration test.</p>
    <p style="color:#4a5568;line-height:1.6">If you received it, the production mail transport is working.</p>
    <p style="color:#888;font-size:12px;margin-top:32px">VibePlay Private Beta</p>
  </div>
</body>
</html>`,
  });

  console.log('Test email sent successfully');
}

main().catch((error: unknown) => {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9_-]{1,64}$/i.test(error.code)
      ? error.code
      : null;

  console.error('Test email failed. Check SMTP configuration and provider logs.');
  if (code) console.error(`Error code: ${code}`);
  process.exitCode = 1;
});
