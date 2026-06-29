const VAPID_PUBLIC = 'BGP84-v8c6OcNX1TlAYdUskKAgrUByfu70CC94bwrHhJ4mtA9C1-w62QxcLTZn71oUjWv2Y0Uijv062XoIbRQOk';
const VAPID_PRIVATE = 'YDNWOfxwZjRryqy77U5MJ1ZHVzL-DEFDoFZiOVhnJAQ';
const VAPID_SUBJECT = 'mailto:najwaiman226@gmail.com';

export default {
  async fetch(request, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (request.method === 'POST') {
      const { subscriptions, title, body } = await request.json();
      if (!subscriptions || subscriptions.length === 0)
        return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...cors, 'Content-Type': 'application/json' } });

      let sent = 0;
      for (const sub of subscriptions) {
        try { await sendPush(sub, { title, body }); sent++; }
        catch (e) { console.error('Push failed:', e.message); }
      }
      return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response('Achieva Push Worker running', { headers: cors });
  }
};

/* ── VAPID JWT ── */
async function makeVapidJwt(endpoint) {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({ aud, exp: now + 43200, sub: VAPID_SUBJECT }));
  const unsigned = `${header}.${payload}`;

  const rawKey = base64ToBytes(VAPID_PRIVATE);
  const pkcs8 = buildPkcs8(rawKey);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64u(sig)}`;
}

/* ── Web Push (RFC 8291 / aes128gcm) ── */
async function sendPush(sub, payload) {
  const { endpoint, keys: { p256dh, auth } } = sub;
  const jwt = await makeVapidJwt(endpoint);
  const body = await encryptPayload(JSON.stringify(payload), p256dh, auth);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt}`);
  }
}

/* ── aes128gcm encryption (RFC 8291) ── */
async function encryptPayload(plaintext, p256dhB64, authB64) {
  const authSecret = base64ToBytes(authB64);
  const receiverPublicKey = base64ToBytes(p256dhB64);

  // Generate sender EC key pair
  const senderKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const senderPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeys.publicKey));

  // Import receiver public key
  const receiverKey = await crypto.subtle.importKey(
    'raw', receiverPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverKey }, senderKeys.privateKey, 256
  ));

  // Salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF-SHA256: PRK
  const ikm = await hkdfExtract(authSecret, sharedSecret);

  // PRK_key = HKDF-Extract(auth_secret, ECDH output)
  const keyInfo = concat(
    new TextEncoder().encode('WebPush: info\x00'),
    receiverPublicKey,
    senderPublicKeyRaw
  );
  const prk = await hkdfExpand(ikm, keyInfo, 32);

  // CEK + NONCE via HKDF-SHA256 with salt
  const prkSalt = await hkdfExtract(salt, prk);
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\x00');
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\x00');
  const cek = await hkdfExpand(prkSalt, cekInfo, 16);
  const nonce = await hkdfExpand(prkSalt, nonceInfo, 12);

  // Encrypt with AES-GCM
  const plaintextBytes = new TextEncoder().encode(plaintext);
  // Add padding delimiter byte (0x02 = last record)
  const padded = concat(plaintextBytes, new Uint8Array([2]));

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // Build aes128gcm content-encoding header
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false); // record size big-endian
  const header = concat(
    salt,
    rs,
    new Uint8Array([senderPublicKeyRaw.length]),
    senderPublicKeyRaw
  );

  return concat(header, ciphertext);
}

/* ── HKDF helpers ── */
async function hkdfExtract(salt, ikm) {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm));
}

async function hkdfExpand(prk, info, length) {
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const blocks = Math.ceil(length / 32);
  let okm = new Uint8Array(0);
  let prev = new Uint8Array(0);
  for (let i = 1; i <= blocks; i++) {
    const input = concat(prev, info, new Uint8Array([i]));
    prev = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, input));
    okm = concat(okm, prev);
  }
  return okm.slice(0, length);
}

/* ── Misc utils ── */
function concat(...arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function b64u(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToBytes(b64) {
  const s = (b64 + '===').slice(0, b64.length + (4 - b64.length % 4) % 4).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

function buildPkcs8(rawKey) {
  // Wrap a raw 32-byte EC private key in PKCS#8 DER for P-256
  const prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20
  ]);
  return concat(prefix, rawKey).buffer;
}
