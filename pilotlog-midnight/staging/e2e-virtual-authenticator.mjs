// Headless real-browser check of the staging WebAuthn ceremonies with a Chrome CDP *virtual authenticator*
// (internal/platform transport, user verification supported). Not part of CI (needs Chrome + playwright-core).
//   PLAYWRIGHT_CORE=/path/to/playwright-core CHROME=/usr/bin/google-chrome \
//   node staging/e2e-virtual-authenticator.mjs https://cfi-passkey-staging-staging.up.railway.app [--sign]
// Without --sign: registration only. With --sign: also waits for the on-chain enrollment, then reviews,
// certifies and signs a synthetic entry, waits for the Preview tx, and makes + checks a superseding version.
// With --restore (needs CFI_WORKER_TOKEN_FILE; operator only): after the enrollment, makes the server forget this
// headless profile (simulating lost server state), reloads, checks the saved profile is kept and "Use my existing
// passkey" is offered, restores via a discoverable get() (empty allowCredentials), then signs (if --sign) and checks
// the profile survives a page reload. --reload-only <cfiId-file>: skip registration; reuse a saved profile id.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const url = process.argv[2]; const doSign = process.argv.includes('--sign'); const doRestore = process.argv.includes('--restore');
const { readFileSync } = await import('node:fs');
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true });
const page = await (await browser.newContext()).newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const out = { url };
page.on('dialog', async (d) => { out.dialog = d.message(); await d.dismiss(); });
await page.goto(url);
await page.waitForSelector('#btnSetup:not(.hidden)', { state: 'visible' });
out.notice = (await page.textContent('.banner')).slice(0, 60);
await page.fill('#name', 'Synthetic Headless Tester'); await page.fill('#cert', '7654321');
await page.click('#btnSetup');
await page.waitForSelector('#me:not(.hidden)', { timeout: 30_000 });
out.registered = (await page.textContent('#me')).replace(/\s+/g, ' ').slice(0, 300);
out.credentialFacts = (await page.textContent('#me .facts')).replace(/\s+/g, ' ').trim();
out.credentials = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length;
const wait = async (fn, ms, label) => { const t = Date.now(); for (;;) { if (await fn()) return Date.now() - t; if (Date.now() - t > ms) throw new Error('timeout: ' + label); await page.waitForTimeout(3000); } };
if (doSign || doRestore) out.enrollMs = await wait(async () => /Enrolled on Preview/.test(await page.textContent('#me')), 15 * 60_000, 'enrollment');
if (doRestore) {
  const token = readFileSync(process.env.CFI_WORKER_TOKEN_FILE, 'utf8').trim();
  const cfiId = await page.evaluate(() => JSON.parse(localStorage.getItem('cfiStaging')).cfiId);
  out.keyIdBefore = (await (await page.request.get(new URL('/api/cfi?id=' + cfiId, url).href)).json()).keyId;
  const f = await page.request.post(new URL('/api/worker/test-forget', url).href, { headers: { authorization: `Bearer ${token}` }, data: { cfiId } });
  out.forget = f.status();
  await page.reload();
  await page.waitForSelector('#btnRestore', { state: 'visible' });
  out.afterWipe = { localStorageKept: await page.evaluate(() => !!localStorage.getItem('cfiStaging')), restoreMsg: (await page.textContent('#restoreMsg')).replace(/\s+/g, ' ').trim() };
  await page.click('#btnRestore');
  await page.waitForSelector('#me:not(.hidden)', { timeout: 60_000 });
  const me = (await page.textContent('#me')).replace(/\s+/g, ' ');
  const newId = await page.evaluate(() => JSON.parse(localStorage.getItem('cfiStaging')).cfiId);
  const prof = await (await page.request.get(new URL('/api/cfi?id=' + newId, url).href)).json();
  out.restored = { enrolled: /Enrolled on Preview/.test(me), restoredRow: /Restored from your existing passkey/.test(me), sameKeyId: prof.keyId === out.keyIdBefore, keyId: prof.keyId };
  if (!out.restored.enrolled || !out.restored.sameKeyId) throw new Error('restore failed: ' + JSON.stringify(out.restored));
}
if (doSign) {
  await page.click('#btnNew');
  await page.waitForSelector('#certify');
  out.signDisabledBeforeCertify = await page.isDisabled('#btnSign');
  await page.check('#certify'); await page.click('#btnSign');
  await page.waitForSelector('#signMsg .ok', { timeout: 60_000 });
  out.signed = (await page.textContent('#signMsg')).replace(/\s+/g, ' ').slice(0, 300);
  out.chainMs = await wait(async () => /recorded on Midnight Preview/.test(await page.textContent('#entries')), 15 * 60_000, 'endorse tx');
  out.entries1 = (await page.textContent('#entries')).replace(/\s+/g, ' ').slice(0, 400);
  await page.click('[data-correct]');
  await page.waitForSelector('#certify');
  await page.waitForTimeout(1500);
  out.entries2 = (await page.textContent('#entries')).replace(/\s+/g, ' ').slice(0, 500);
  // the QR target: /verify/<entryHash of v1>
  const v1 = (await (await page.request.get(new URL('/api/entries?cfiId=' + (await page.evaluate(() => JSON.parse(localStorage.getItem('cfiStaging')).cfiId)), url).href)).json()).find((e) => e.version === 1);
  const vp = await (await page.request.get(new URL('/verify/' + v1.entryHash, url).href)).text();
  out.verifyPage = /signature valid for this exact version/.test(vp) ? 'verifies' : 'DOES NOT VERIFY';
}
if (doRestore) { await page.reload(); await page.waitForSelector('#me:not(.hidden)', { timeout: 30_000 }); out.afterReload = { profileShown: /Enrolled on Preview/.test(await page.textContent('#me')), entries: (await page.textContent('#entries')).replace(/\s+/g, ' ').slice(0, 200) }; }
console.log(JSON.stringify(out, null, 2));
await browser.close();
