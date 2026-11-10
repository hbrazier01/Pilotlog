/**
 * signInPages.mjs — accounts v2 landing / sign-in UI (served ONLY when registerAccountsV2() is enabled).
 *   GET /signin    email magic link (request → sent), passkey sign-in, optional linked-wallet sign-in, SAMPLE mode
 *   GET /account   signed-in: passkeys (add/remove), optional wallet link (no unlink yet), sign out (this device / everywhere).
 *                  There is no email-change flow; the page must not promise one.
 * The magic-link confirm step is the existing GET /api/v2/auth/email/verify page (it does not consume the token).
 * Pages carry no inline script: behaviour lives in /js/signin.js and /js/account.js, all calls go to /api/v2/*.
 */
import { chromeCss, accountCss } from "../cockpit/chrome.mjs";
import { midnightNetwork } from "./walletVerify.mjs";

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const css = `${chromeCss()}
body{margin:0;background:radial-gradient(1200px 600px at 70% -10%,rgba(34,211,238,.12),transparent),var(--bg);color:var(--txt);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh}
.wrap{max-width:460px;margin:0 auto;padding:48px 18px 60px}
.brandrow{display:flex;align-items:center;gap:10px;font:700 13px var(--mono);letter-spacing:.22em;color:var(--cy);margin-bottom:26px}
.brandrow:before{content:"";width:22px;height:22px;background:conic-gradient(from 210deg,var(--cy),var(--mg),var(--am),var(--cy));border-radius:50%;box-shadow:0 0 12px rgba(34,211,238,.5)}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.01em}.lede{color:var(--dim);margin:0 0 22px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:14px}
.card h2{font:700 10px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--cy);margin:0 0 10px}
label{display:block;font-size:13px;color:var(--dim);margin-bottom:6px}
input[type=email],input[type=text]{width:100%;box-sizing:border-box;padding:12px 13px;border-radius:12px;border:1px solid var(--line);background:rgba(0,0,0,.35);color:var(--txt);font:inherit}
input:focus{outline:2px solid rgba(34,211,238,.6);outline-offset:1px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;margin-top:10px;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--txt);font:600 14px system-ui,sans-serif;cursor:pointer;text-decoration:none}
.btn.primary{background:linear-gradient(90deg,var(--cy),#7ff3ff);color:#031018;border:0}
.btn:disabled{opacity:.55;cursor:progress}.btn.small{width:auto;margin:0;padding:7px 11px;font-size:12px}
.or{display:flex;align-items:center;gap:10px;color:var(--dim);font:600 10px var(--mono);letter-spacing:.14em;margin:16px 0}
.or:before,.or:after{content:"";flex:1;height:1px;background:var(--line)}
.msg{display:none;margin-top:10px;padding:10px 12px;border-radius:12px;font-size:13px}
.msg.err{display:block;color:#fecaca;background:rgba(127,29,29,.35);border:1px solid rgba(248,113,113,.4)}
.msg.ok{display:block;color:#bbf7d0;background:rgba(6,78,59,.35);border:1px solid rgba(52,245,160,.4)}
.sent h3{margin:0 0 6px;font-size:17px}.dim{color:var(--dim)}.small{font-size:12.5px}
details summary{cursor:pointer;color:var(--dim);font-size:13px}
ul.list{list-style:none;padding:0;margin:0}ul.list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}
.foot{margin-top:22px;text-align:center;font-size:12.5px;color:var(--dim)}.foot a{color:var(--cy)}
[hidden]{display:none!important}
${accountCss()}
.wallet-list button{margin-top:8px}`;

function shell(esc, title, body, script, attrs = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#03060f">
<title>${esc(title)} — PilotLog</title><style>${css}</style></head>
<body${attrs}><main class="wrap"><div class="brandrow">PILOTLOG</div>
${body}
</main><script type="module" src="${esc(script)}"></script></body></html>`;
}

export function renderSignInPage(esc, { network = "preprod" } = {}) {
  return shell(esc, "Sign in", `
<h1>Sign in</h1>
<p class="lede">Your logbook, checkride prep, replays and radio practice — private to you.</p>

<section class="card" id="emailCard" aria-labelledby="emailH">
  <h2 id="emailH">Email</h2>
  <form id="emailForm" novalidate>
    <label for="email">We'll email you a one-time sign-in link. New here? The same link creates your account.</label>
    <input id="email" name="email" type="email" autocomplete="email webauthn" inputmode="email" required placeholder="you@example.com">
    <button class="btn primary" id="emailBtn" type="submit">Email me a sign-in link</button>
    <div class="msg" id="emailMsg" role="alert"></div>
  </form>
  <div class="sent" id="emailSent" hidden role="status" aria-live="polite">
    <h3>Check your inbox</h3>
    <p class="dim small">If <b id="sentTo"></b> can sign in, a link is on its way. It works once and expires in 15 minutes.
      Open it on this device, then press <b>Sign in</b> to finish.</p>
    <button class="btn" id="resendBtn" type="button">Send another link</button>
    <button class="btn" id="changeBtn" type="button">Use a different email</button>
  </div>
</section>

<div class="or">OR</div>
<section class="card" id="passkeyCard" aria-labelledby="pkH">
  <h2 id="pkH">Passkey</h2>
  <p class="dim small" id="pkHelp">Use Face ID, Touch ID, Windows Hello or a security key you've added to PilotLog.</p>
  <button class="btn" id="passkeyBtn" type="button">Sign in with a passkey</button>
  <p class="dim small" id="pkUnsupported" hidden>This browser doesn't support passkeys. Use the email link instead.</p>
  <div class="msg" id="pkMsg" role="alert"></div>
</section>

<section class="card" aria-labelledby="wH">
  <details id="walletDetails"><summary id="wH">Linked a Midnight wallet? Sign in with it (optional)</summary>
    <p class="dim small">Wallets are optional. Link one from <b>Account</b> after you sign in. Signing is free and sends no transaction.</p>
    <div class="wallet-list" id="walletList"></div>
    <div class="msg" id="wMsg" role="alert"></div>
  </details>
</section>

<a class="btn" href="/cockpit?demo=1" id="demoBtn">Explore with sample data — no account needed</a>
<p class="foot">Signed in already? <a href="/account">Account</a> · <a href="/cockpit">Cockpit</a></p>`,
  "/js/signin.js", ` data-network="${esc(network)}"`);
}

export function renderAccountPage(esc, { network = "preprod" } = {}) {
  return shell(esc, "Account", `
<h1>Account</h1>
<p class="lede" id="who">Signed in.</p>
<section class="card" aria-labelledby="pkH">
  <h2 id="pkH">Passkeys</h2>
  <ul class="list" id="pkList"><li class="dim">Loading…</li></ul>
  <button class="btn primary" id="addPk" type="button">Add a passkey on this device</button>
  <p class="dim small" id="pkUnsupported" hidden>This browser doesn't support passkeys.</p>
  <div class="msg" id="pkMsg" role="alert"></div>
</section>
<section class="card" aria-labelledby="wH">
  <h2 id="wH">Midnight wallet (optional)</h2>
  <p class="dim small">Link a 1AM or Lace wallet to sign in with it later and to keep on-chain features. The wallet signs a
    one-time message (free, no transaction). One wallet can belong to only one PilotLog account, and a linked
    wallet can't be removed from this page yet, so link only a wallet you plan to keep.</p>
  <div class="wallet-list" id="walletList"></div>
  <div class="msg" id="wMsg" role="alert"></div>
</section>
<section class="card" aria-labelledby="sH">
  <h2 id="sH">Sessions</h2>
  <button class="btn" id="signOut" type="button">Sign out on this device</button>
  <button class="btn" id="signOutAll" type="button">Sign out everywhere</button>
</section>
<p class="foot"><a href="/cockpit">Back to the cockpit</a></p>`, "/js/account.js", ` data-network="${esc(network)}"`);
}

export function registerSignInPages(app, { escapeHtml, env = process.env }) {
  const send = (res, html) => res.set("Cache-Control", "no-store").set("Content-Security-Policy", CSP)
    .set("Referrer-Policy", "same-origin").set("X-Frame-Options", "DENY").type("html").send(html);
  app.get("/signin", (req, res) => send(res, renderSignInPage(escapeHtml, { network: midnightNetwork(env) })));
  app.get("/account", (req, res) => {
    if (!req.accountV2) return res.redirect(303, "/signin");
    send(res, renderAccountPage(escapeHtml, { network: midnightNetwork(env) }));
  });
}
