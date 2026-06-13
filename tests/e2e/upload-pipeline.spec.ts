import { expect, test } from '@playwright/test';
import { adminAgent, registerVerifiedCreator, uniq, uploadVersion } from './helpers.js';

/**
 * Upload pipeline (spec §31): the REAL validation pipeline runs for every
 * archive. Valid builds reach READY_FOR_REVIEW; each class of malicious or
 * broken archive fails with an explicit reason the creator can read.
 */
test.describe('upload pipeline', () => {
  test('valid ZIP reaches READY_FOR_REVIEW with a validation report', async () => {
    const admin = await adminAgent();
    const { agent: creator } = await registerVerifiedCreator(admin);
    const upload = await uploadVersion(creator, 'hello-vibeplay.zip', uniq('Valid '));
    expect(upload.status).toBe('READY_FOR_REVIEW');
    const report = upload.report as { ok: boolean; checks: { name: string; ok: boolean }[] };
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  test('ZIP without a root index.html is rejected with a reason', async () => {
    const admin = await adminAgent();
    const { agent: creator } = await registerVerifiedCreator(admin);
    const upload = await uploadVersion(creator, 'missing-index.zip', uniq('NoIndex '));
    expect(upload.status).toBe('SCAN_FAILED');
    expect(JSON.stringify(upload.report)).toMatch(/index\.html/i);
  });

  test('path traversal entries are rejected', async () => {
    const admin = await adminAgent();
    const { agent: creator } = await registerVerifiedCreator(admin);
    const upload = await uploadVersion(creator, 'traversal.zip', uniq('Traversal '));
    expect(upload.status).toBe('SCAN_FAILED');
    expect(JSON.stringify(upload.report)).toMatch(/traversal|\.\./i);
  });

  test('forbidden executable/server extensions are rejected', async () => {
    const admin = await adminAgent();
    const { agent: creator } = await registerVerifiedCreator(admin);
    const upload = await uploadVersion(creator, 'server-code.zip', uniq('Server '));
    expect(upload.status).toBe('SCAN_FAILED');
    expect(JSON.stringify(upload.report)).toMatch(/forbidden|\.php/i);
  });

  test('corrupt archive is rejected', async () => {
    const admin = await adminAgent();
    const { agent: creator } = await registerVerifiedCreator(admin);
    const upload = await uploadVersion(creator, 'corrupt.zip', uniq('Corrupt '));
    expect(upload.status).toBe('SCAN_FAILED');
  });
});
