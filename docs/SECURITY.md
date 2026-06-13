# Security Model

Threat-model summary and the controls implemented for the private beta.
Related: `GAME_SANDBOX.md` (hostile game code), `AUTH_AND_RBAC.md` (identity).

## Assets & adversaries

- **Assets**: user accounts/emails, session integrity, platform reputation,
  player browsers (the thing a malicious game attacks), moderation
  integrity, uploaded IP.
- **Adversaries**: malicious creators (hostile ZIPs), account attackers
  (credential stuffing, token theft), abusive users (spam/harassment), and
  curious players poking the API.

## Controls by surface

### API

- Session cookies HttpOnly + host-only + SameSite=Lax (+Secure in prod);
  CSRF double-submit bound to the session; CORS allowlist = exactly
  `WEB_ORIGIN`; 1 MiB JSON body cap; zod `.strict()` validation everywhere;
  unified error envelope that never leaks internals; request ids on every
  response.
- Redis-backed per-endpoint rate limits (see `AUTH_AND_RBAC.md`).
- Audit log for security-relevant actions (auth events, moderation, account
  requests, admin actions).

### Uploads (hostile ZIPs)

Checksum verification, signature/structure validation, path-traversal and
forbidden-extension rejection, size/count/zip-bomb budgets, ClamAV scan,
safe extraction, immutable publication — `GAME_UPLOAD_PIPELINE.md`.

### Game execution (hostile JS)

Four layers: separate registrable domain, one origin per published version,
iframe sandbox + launch URL validation, strict game CSP with no external
network — `GAME_SANDBOX.md`. SDK messages validated both sides with exact
origin/source checks.

### Web app

- Real bundle contains zero demo/mock code (CI-enforced bundle scan).
- SPA CSP: `default-src 'self'`, `frame-ancestors 'none'` (not embeddable),
  `frame-src` limited to the game-host wildcard; COOP `same-origin`;
  nosniff; strict referrer policy; HSTS at the proxy.

### Secrets & logs

- All secrets via environment; `.env*` git-ignored; CI runs gitleaks +
  forbidden-pattern scan; example/compose files use obvious placeholders.
- Logs are structured JSON with service/requestId/userId and REDACT
  authorization, cookies, set-cookie, password/token fields. Presigned URLs
  and SMTP credentials are never logged.

## Reporting & disclosure

Email `abuse@…` with subject "SECURITY" (see `/contact` in-product).
Responsible disclosure: own-account testing only, 14-day response window.

## Known gaps (tracked for post-beta)

- ClamAV catches commodity malware only; obfuscated malicious JS relies on
  CSP containment + human review + abuse reports.
- No WAF/anti-bot layer beyond rate limits.
- `'unsafe-inline'/'unsafe-eval'` in the GAME CSP (engine compatibility) —
  acceptable inside per-version origins, revisit with nonces post-beta.
- Legal documents are drafts pending professional review.
