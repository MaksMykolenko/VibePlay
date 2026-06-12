import React from 'react';
import { Link } from 'react-router-dom';

/**
 * VibePlay beta legal & policy pages (spec §35).
 *
 * Every document is a real beta draft (no placeholders) and is clearly marked
 * as requiring professional legal review before any public (non-invite) launch.
 * Contact addresses use the vibeplay.example placeholder domain on purpose:
 * they are rewritten per deployment via the support email constant below.
 */

const SUPPORT_EMAIL = 'support@vibeplay.example';
const ABUSE_EMAIL = 'abuse@vibeplay.example';
const COPYRIGHT_EMAIL = 'copyright@vibeplay.example';
const PRIVACY_EMAIL = 'privacy@vibeplay.example';
const LAST_UPDATED = 'June 12, 2026';

const BetaNotice: React.FC = () => (
  <div style={betaNoticeStyle} role="note">
    <strong>Beta draft — requires legal review before public launch.</strong> VibePlay is an
    invite-only private beta. These documents describe how the beta actually works today and will be
    replaced by reviewed versions before any general availability.
  </div>
);

const LegalShell: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={pageStyle} className="container">
    <article style={articleStyle}>
      <h1 style={h1Style}>{title}</h1>
      <p style={updatedStyle}>Last updated: {LAST_UPDATED}</p>
      <BetaNotice />
      {children}
      <hr style={hrStyle} />
      <p style={footerNavStyle}>
        Related: <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link> ·{' '}
        <Link to="/community-guidelines">Community Guidelines</Link> ·{' '}
        <Link to="/content-guidelines">Content Guidelines</Link> ·{' '}
        <Link to="/copyright">Copyright</Link> · <Link to="/report-abuse">Report Abuse</Link> ·{' '}
        <Link to="/contact">Contact</Link>
      </p>
    </article>
  </div>
);

// ---------------------------------------------------------------------------
// /terms
// ---------------------------------------------------------------------------
export const TermsPage: React.FC = () => (
  <LegalShell title="Terms of Service (Beta)">
    <h2 style={h2Style}>1. The service and its beta status</h2>
    <p style={pStyle}>
      VibePlay is a platform for publishing and playing browser games created by independent
      developers. The service is currently an <strong>invite-only private beta</strong>. Features
      may change, break, or be removed without notice; data created during the beta (games,
      comments, play statistics) may be reset before a public launch, although we will try to give
      reasonable notice. The service is provided “as is” and “as available”,{' '}
      <strong>without any service-level agreement, uptime commitment or warranty</strong>.
    </p>

    <h2 style={h2Style}>2. Accounts and invites</h2>
    <p style={pStyle}>
      Registration requires a personal invite code. You must provide a valid email address and
      verify it. You are responsible for keeping your password secret and for all activity under
      your account. You must be at least 16 years old (or older where local law requires) to use the
      beta. Invite codes are personal: selling or publicly sharing them is not allowed.
    </p>

    <h2 style={h2Style}>3. Creator content and responsibility</h2>
    <p style={pStyle}>
      Creators upload game builds (ZIP archives of static browser content). Each uploaded version is
      scanned and reviewed before publication, but{' '}
      <strong>the Creator remains fully responsible for the content they upload</strong>, including
      its legality, its licensing, and the behaviour of its code within the sandbox. Moderation
      review is a safety screen, not an endorsement and not a transfer of responsibility.
    </p>

    <h2 style={h2Style}>4. Ownership and license to host</h2>
    <p style={pStyle}>
      Creators keep all ownership of their games. By uploading, a Creator grants VibePlay a
      non-exclusive, worldwide, revocable license to store, reproduce, adapt for technical delivery
      (e.g. extraction, compression, caching), publicly display and distribute the uploaded build
      through the platform, including showing the game title, cover art and metadata in the catalog
      and in beta-related communication. This license ends for new plays when the game is deleted or
      the account closes, except for copies that exist in backups and moderation/audit records,
      which we keep according to the <Link to="/privacy">Privacy Policy</Link>.
    </p>

    <h2 style={h2Style}>5. Prohibited use</h2>
    <p style={pStyle}>
      You may not: upload content that violates the{' '}
      <Link to="/content-guidelines">Content Guidelines</Link> (including malware, cryptominers,
      phishing pages or stolen games); attempt to escape the game sandbox or access other users'
      data; probe, scan or overload the service; use the platform to send spam; impersonate other
      people or VibePlay staff; scrape the catalog at abusive rates; share one account between
      multiple people; or use the beta for any unlawful purpose. Security research is welcome only
      against your own account and games — see <Link to="/contact">Contact</Link> for responsible
      disclosure.
    </p>

    <h2 style={h2Style}>6. Moderation, suspension and termination</h2>
    <p style={pStyle}>
      We may reject any uploaded version, hide or remove published games, remove comments, restrict
      features, suspend or ban accounts, and revoke invites — with or without prior notice — when we
      believe the Terms, the Guidelines or applicable law are being violated, or when needed to
      protect users or the service. During the beta we may also remove content for purely technical
      reasons. Repeated or serious violations lead to permanent bans. You can contest moderation
      decisions via <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>

    <h2 style={h2Style}>7. Limitation of liability</h2>
    <p style={pStyle}>
      To the maximum extent permitted by law: VibePlay is not liable for indirect, incidental,
      special or consequential damages, lost profits, lost data, or the conduct or content of any
      user or Creator. Our total aggregate liability for any claim related to the beta is limited to
      EUR 50. Nothing in these Terms excludes liability that cannot be excluded by law (e.g. for
      intent or gross negligence where applicable).
    </p>

    <h2 style={h2Style}>8. Changes and contact</h2>
    <p style={pStyle}>
      We may update these Terms during the beta; material changes will be announced in the product
      and by email. Continuing to use the service after a change takes effect means you accept the
      updated Terms. Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  </LegalShell>
);

// ---------------------------------------------------------------------------
// /privacy
// ---------------------------------------------------------------------------
export const PrivacyPage: React.FC = () => (
  <LegalShell title="Privacy Policy (Beta)">
    <h2 style={h2Style}>1. What we collect</h2>
    <ul style={ulStyle}>
      <li style={liStyle}>
        <strong>Account data:</strong> email address, username, display name, optional bio and
        avatar URL, hashed password (Argon2id; we never store plain passwords), role and account
        status.
      </li>
      <li style={liStyle}>
        <strong>Security data:</strong> session records with a hashed token, a hashed IP address and
        browser user-agent string; audit-log entries for security-relevant actions (login, password
        reset, moderation decisions, account changes).
      </li>
      <li style={liStyle}>
        <strong>Game activity:</strong> play sessions (which game, when started/ended, duration),
        likes, favorites and recently-played history.
      </li>
      <li style={liStyle}>
        <strong>Content you submit:</strong> comments, reports (including the reason text),
        feedback, and — for Creators — uploaded game archives, extracted game files, metadata,
        validation and malware-scan reports.
      </li>
      <li style={liStyle}>
        <strong>Email delivery data:</strong> messages we send for verification, password reset and
        moderation notifications.
      </li>
    </ul>
    <p style={pStyle}>
      We do not run third-party advertising or cross-site tracking in the beta. We collect no
      payment data (there are no payments in the beta).
    </p>

    <h2 style={h2Style}>2. How we use data</h2>
    <p style={pStyle}>
      To operate the platform (accounts, catalog, game hosting), to keep it safe (abuse prevention,
      rate limiting, malware scanning, moderation, audit), to communicate with you about the beta,
      and to debug problems using structured server logs. Logs never contain passwords, session
      tokens, reset tokens or full cookies; they may contain your user id and a request id.
    </p>

    <h2 style={h2Style}>3. Processors and infrastructure</h2>
    <p style={pStyle}>
      The beta runs on self-hosted infrastructure: PostgreSQL (accounts, games, sessions,
      moderation), Redis (queues, rate limiting), S3-compatible object storage (uploaded and
      published game files), ClamAV (malware scanning) and an SMTP provider for transactional email.
      When the staging/production deployment uses a hosting or email provider, that provider acts as
      a processor; the current list is available on request via{' '}
      <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. We do not sell personal data.
    </p>

    <h2 style={h2Style}>4. Retention</h2>
    <ul style={ulStyle}>
      <li style={liStyle}>Account data: kept while the account exists.</li>
      <li style={liStyle}>
        Sessions: expire automatically (default 14 days) and are purged after expiry/revocation.
      </li>
      <li style={liStyle}>
        Security and moderation audit logs: kept up to 12 months, then deleted or anonymized.
      </li>
      <li style={liStyle}>
        Quarantined (unprocessed) uploads: deleted automatically after 7 days.
      </li>
      <li style={liStyle}>
        Backups: encrypted, rotated; daily backups kept 14 days, weekly 8 weeks (see the public
        operations docs).
      </li>
    </ul>

    <h2 style={h2Style}>5. Account deletion</h2>
    <p style={pStyle}>
      You can request deletion in <strong>Settings → Account → Request account deletion</strong> or
      by email. We process requests within 30 days: sessions are revoked, the public profile is
      removed, comments are anonymized (shown as “deleted user”), and published games are
      unpublished and removed unless legal obligations require otherwise. We keep a minimal
      moderation/audit record (e.g. that a banned account requested deletion) where we have a
      legitimate interest in preventing ban evasion, and backup copies cycle out on the schedule
      above.
    </p>

    <h2 style={h2Style}>6. Data export</h2>
    <p style={pStyle}>
      You can request an export of your data (account fields, games metadata, comments, play
      history) in <strong>Settings → Account → Request data export</strong> or via{' '}
      <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. During the beta exports are prepared
      manually and delivered to your verified email within 30 days.
    </p>

    <h2 style={h2Style}>7. Your rights and contact</h2>
    <p style={pStyle}>
      Depending on your jurisdiction you may have rights to access, rectify, delete, export and
      object to processing of your personal data. Contact{' '}
      <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> for any privacy request; we answer
      within 30 days.
    </p>
  </LegalShell>
);

// ---------------------------------------------------------------------------
// /community-guidelines
// ---------------------------------------------------------------------------
export const CommunityGuidelinesPage: React.FC = () => (
  <LegalShell title="Community Guidelines (Beta)">
    <p style={pStyle}>
      VibePlay is a small invite-only community of players and game creators. These rules apply to
      everything you do on the platform: comments, profiles, game metadata, reports and feedback.
    </p>
    <h2 style={h2Style}>Be decent</h2>
    <ul style={ulStyle}>
      <li style={liStyle}>No harassment, bullying, threats or hate speech of any kind.</li>
      <li style={liStyle}>
        No sexualized content involving minors — zero tolerance; offending accounts are banned and
        reported to authorities where required by law.
      </li>
      <li style={liStyle}>No doxxing or sharing other people's private information.</li>
      <li style={liStyle}>No impersonation of other users, creators or VibePlay staff.</li>
    </ul>
    <h2 style={h2Style}>Keep it useful</h2>
    <ul style={ulStyle}>
      <li style={liStyle}>No spam, repetitive self-promotion or link schemes in comments.</li>
      <li style={liStyle}>
        Use reports for real problems; intentionally false reports are themselves a violation.
      </li>
      <li style={liStyle}>Review feedback should be about the game, not the person who made it.</li>
    </ul>
    <h2 style={h2Style}>Consequences</h2>
    <p style={pStyle}>
      Moderators may remove content, restrict features, suspend or ban accounts depending on
      severity and repetition. Serious violations (malware, CSAM, credible threats) result in an
      immediate permanent ban. You can appeal any decision via{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  </LegalShell>
);

// ---------------------------------------------------------------------------
// /content-guidelines
// ---------------------------------------------------------------------------
export const ContentGuidelinesPage: React.FC = () => (
  <LegalShell title="Content Guidelines for Games (Beta)">
    <p style={pStyle}>
      Every uploaded version is automatically validated (archive structure, file types, size
      limits), scanned for malware and manually reviewed before publication. Passing review does not
      transfer responsibility — the Creator remains responsible for the build. The following content
      is <strong>prohibited</strong>:
    </p>
    <ul style={ulStyle}>
      <li style={liStyle}>
        <strong>Malware of any kind</strong> — viruses, trojans, spyware, keyloggers, or any code
        that attempts to escape the sandbox, exploit the browser, or access data of other users or
        other games.
      </li>
      <li style={liStyle}>
        <strong>Cryptomining</strong> — any use of player devices to mine cryptocurrency or perform
        hidden distributed computation.
      </li>
      <li style={liStyle}>
        <strong>Phishing and deception</strong> — fake login forms, imitations of VibePlay UI or
        other services, requests for passwords or payment data.
      </li>
      <li style={liStyle}>
        <strong>Stolen games and copyright infringement</strong> — uploading games, art, audio or
        code you have no right to distribute, including re-uploads of other creators' games. See{' '}
        <Link to="/copyright">Copyright</Link> for the takedown process.
      </li>
      <li style={liStyle}>
        <strong>Adult sexual content</strong> — pornography or sexually explicit games are not
        allowed in the beta (the platform has no age-gating yet).
      </li>
      <li style={liStyle}>
        <strong>Hate content</strong> — content that promotes hatred or violence against people
        based on protected characteristics.
      </li>
      <li style={liStyle}>
        <strong>Harassment</strong> — games targeting and demeaning real private individuals.
      </li>
      <li style={liStyle}>
        <strong>Gambling mechanics</strong> — real-money gambling, or simulated gambling that sells
        chances, is not allowed without a separate written policy exception.
      </li>
      <li style={liStyle}>
        <strong>Impersonation</strong> — pretending the game is made by another studio or person.
      </li>
      <li style={liStyle}>
        <strong>Spam and mass low-quality uploads</strong> — flooding the catalog with
        near-identical or placeholder games.
      </li>
      <li style={liStyle}>
        <strong>Malicious external requests</strong> — the sandbox CSP blocks external network
        calls; attempting to circumvent this (e.g. via redirects or DNS tricks) is prohibited.
      </li>
    </ul>
    <h2 style={h2Style}>Technical requirements</h2>
    <p style={pStyle}>
      Builds must be ZIP archives of static browser content with an <code>index.html</code> at the
      root, within the published size and file-count limits shown on the upload screen. Server code,
      native executables and forbidden file types are rejected automatically. Games must remain
      playable without external network access.
    </p>
  </LegalShell>
);

// ---------------------------------------------------------------------------
// /copyright
// ---------------------------------------------------------------------------
export const CopyrightPage: React.FC = () => (
  <LegalShell title="Copyright & Takedown Policy (Beta)">
    <h2 style={h2Style}>Reporting infringement</h2>
    <p style={pStyle}>
      If you believe a game or other content on VibePlay infringes your copyright, send a takedown
      notice to <a href={`mailto:${COPYRIGHT_EMAIL}`}>{COPYRIGHT_EMAIL}</a> (or use the in-app
      report with category “Copyright”). A valid notice must include:
    </p>
    <ul style={ulStyle}>
      <li style={liStyle}>identification of the copyrighted work you claim is infringed;</li>
      <li style={liStyle}>
        the URL (or game title and creator name) of the allegedly infringing content on VibePlay;
      </li>
      <li style={liStyle}>
        evidence of your rights — e.g. a link to the original publication, store page, repository or
        registration;
      </li>
      <li style={liStyle}>your name, email address, and (for companies) who you represent;</li>
      <li style={liStyle}>
        a statement that you believe in good faith that the use is not authorized, and that the
        information in the notice is accurate.
      </li>
    </ul>
    <p style={pStyle}>
      We confirm receipt, review the evidence, and — when the notice is valid — hide or remove the
      content, notifying the Creator with a copy of the claim (minus your contact details unless
      legally required).
    </p>

    <h2 style={h2Style}>Counter-notice</h2>
    <p style={pStyle}>
      A Creator whose content was removed can send a counter-notice to the same address explaining
      why the removal was mistaken (e.g. they own the rights or have a license), with supporting
      evidence. We forward the counter-notice to the original claimant; if the claimant does not
      provide evidence of court action within 14 business days, we may restore the content.
    </p>

    <h2 style={h2Style}>Repeat infringers</h2>
    <p style={pStyle}>
      We track validated takedowns per account. Two validated takedowns within 12 months trigger a
      warning and review of the account's catalog; a third results in termination of the Creator
      account. Obvious wholesale piracy (uploading someone else's complete game) results in
      immediate termination on the first validated claim.
    </p>
  </LegalShell>
);

// ---------------------------------------------------------------------------
// /report-abuse
// ---------------------------------------------------------------------------
export const ReportAbusePage: React.FC = () => (
  <LegalShell title="Report Abuse">
    <p style={pStyle}>
      Seen something dangerous, illegal or against the rules? Report it — reports go straight to the
      moderation queue and are reviewed by an admin.
    </p>
    <h2 style={h2Style}>In the product (fastest)</h2>
    <ul style={ulStyle}>
      <li style={liStyle}>
        <strong>A game:</strong> open the game page and use the <em>Report</em> button. Choose
        “Malicious code” for anything that looks like malware, cryptomining, phishing or a sandbox
        escape — these reports are prioritized.
      </li>
      <li style={liStyle}>
        <strong>A comment or a user:</strong> use the <em>Report</em> action next to the comment or
        on the profile page.
      </li>
    </ul>
    <h2 style={h2Style}>By email</h2>
    <p style={pStyle}>
      Write to <a href={`mailto:${ABUSE_EMAIL}`}>{ABUSE_EMAIL}</a> with a link to the content, a
      short description, and screenshots if relevant. For suspected <strong>malicious games</strong>
      , please do not keep playing the game; include what behaviour you observed (popups, redirects,
      fan spin-up, etc.).
    </p>
    <p style={pStyle}>
      Urgent child-safety issues are handled with the highest priority — mark the subject line
      “CSAM” or “child safety”. Security vulnerabilities in the platform itself should go to the
      security contact listed on the <Link to="/contact">Contact</Link> page.
    </p>
  </LegalShell>
);

// ---------------------------------------------------------------------------
// /contact
// ---------------------------------------------------------------------------
export const ContactPage: React.FC = () => (
  <LegalShell title="Contact">
    <ul style={ulStyle}>
      <li style={liStyle}>
        <strong>General support & beta feedback:</strong>{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — account problems, invite
        questions, bug reports, appeals against moderation decisions.
      </li>
      <li style={liStyle}>
        <strong>Abuse & malicious content:</strong>{' '}
        <a href={`mailto:${ABUSE_EMAIL}`}>{ABUSE_EMAIL}</a> — see{' '}
        <Link to="/report-abuse">Report Abuse</Link>.
      </li>
      <li style={liStyle}>
        <strong>Copyright:</strong> <a href={`mailto:${COPYRIGHT_EMAIL}`}>{COPYRIGHT_EMAIL}</a> —
        see <Link to="/copyright">Copyright & Takedown</Link>.
      </li>
      <li style={liStyle}>
        <strong>Privacy:</strong> <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> —
        deletion, export and other data requests.
      </li>
      <li style={liStyle}>
        <strong>Security disclosures:</strong> <a href={`mailto:${ABUSE_EMAIL}`}>{ABUSE_EMAIL}</a>{' '}
        with subject “SECURITY”. Please practice responsible disclosure: no testing against other
        users' accounts or data, give us 14 days to respond before publishing.
      </li>
    </ul>
    <p style={pStyle}>
      During the private beta we usually answer within 2 business days. The addresses above use the
      beta placeholder domain and are replaced per deployment.
    </p>
  </LegalShell>
);

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------
const pageStyle: React.CSSProperties = { padding: '2rem 1rem 4rem' };
const articleStyle: React.CSSProperties = { maxWidth: '760px', margin: '0 auto' };
const h1Style: React.CSSProperties = {
  fontSize: '1.9rem',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  marginBottom: '0.25rem',
};
const updatedStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
  marginBottom: '1rem',
};
const betaNoticeStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '10px',
  marginBottom: '1.5rem',
  fontSize: '0.85rem',
  backgroundColor: 'rgba(255,184,0,0.10)',
  border: '1px solid rgba(255,184,0,0.35)',
  color: 'var(--text-primary)',
  lineHeight: 1.5,
};
const h2Style: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 700,
  margin: '1.5rem 0 0.5rem',
};
const pStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  lineHeight: 1.7,
  margin: '0.5rem 0',
  fontSize: '0.95rem',
};
const ulStyle: React.CSSProperties = {
  paddingLeft: '1.25rem',
  margin: '0.5rem 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
};
const liStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
  fontSize: '0.95rem',
};
const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '2rem 0 1rem',
};
const footerNavStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.8,
};
