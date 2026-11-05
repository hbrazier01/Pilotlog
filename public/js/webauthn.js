// Minimal WebAuthn browser glue for @simplewebauthn/server JSON options (no extra dependency).
const b64uToBuf = (s) => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer; };
const bufToB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const passkeysSupported = () => typeof window.PublicKeyCredential === 'function' && !!navigator.credentials?.create;

export async function createPasskey(opts) {
  const publicKey = { ...opts, challenge: b64uToBuf(opts.challenge), user: { ...opts.user, id: b64uToBuf(opts.user.id) },
    excludeCredentials: (opts.excludeCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
  const cred = await navigator.credentials.create({ publicKey });
  if (!cred) throw new Error('Passkey creation was cancelled');
  const r = cred.response;
  return { id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    response: { clientDataJSON: bufToB64u(r.clientDataJSON), attestationObject: bufToB64u(r.attestationObject),
      transports: typeof r.getTransports === 'function' ? r.getTransports() : undefined } };
}

export async function getPasskey(opts) {
  const publicKey = { ...opts, challenge: b64uToBuf(opts.challenge),
    allowCredentials: (opts.allowCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
  const cred = await navigator.credentials.get({ publicKey });
  if (!cred) throw new Error('Passkey sign-in was cancelled');
  const r = cred.response;
  return { id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    response: { clientDataJSON: bufToB64u(r.clientDataJSON), authenticatorData: bufToB64u(r.authenticatorData),
      signature: bufToB64u(r.signature), userHandle: r.userHandle ? bufToB64u(r.userHandle) : undefined } };
}

export const cancelled = (e) => e?.name === 'NotAllowedError' || e?.name === 'AbortError';
