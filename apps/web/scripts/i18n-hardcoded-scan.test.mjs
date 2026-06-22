import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanHardcoded, findingKey } from './i18n-hardcoded-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(HERE, 'i18n-hardcoded-baseline.json'), 'utf8'));
const baselineKeys = new Set(baseline.map(findingKey));

// Regression ratchet for the full-site i18n migration.
//
// `i18n-hardcoded-baseline.json` records the known-remaining hardcoded UI
// strings (tracked as follow-ups in FULL_SITE_I18N_REPORT.md). This test fails
// only when a NEW hardcoded string appears that is not in the baseline — so the
// suite stays green as files are migrated, while preventing fresh regressions.
//
// Fix a string → it simply drops out. Add a new one → this fails until you wrap
// it in t('...') or (rarely) add `// i18n-ignore` with a justification and
// regenerate the baseline: `npm run i18n:scan -- --json > scripts/i18n-hardcoded-baseline.json`.
describe('no NEW hardcoded UI text (i18n ratchet)', () => {
  const findings = scanHardcoded();

  it('introduces no hardcoded strings beyond the tracked baseline', () => {
    const introduced = findings.filter((f) => !baselineKeys.has(findingKey(f)));
    const report = introduced.map(
      (f) => `  ${f.file}:${f.line} [${f.kind}] ${JSON.stringify(f.text)}`,
    );
    expect(introduced, `New hardcoded UI strings:\n${report.join('\n')}\n`).toHaveLength(0);
  });

  it('keeps shrinking — current findings never exceed the baseline', () => {
    expect(findings.length).toBeLessThanOrEqual(baseline.length);
  });
});
