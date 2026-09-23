// RFC 6238 TOTP, the same algorithm Google Authenticator, 1Password and Authy use.
// Runs in the browser with WebCrypto, so the code you scan in onboarding is real.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function randomSecret(bytes = 20): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error("bad base32");
    bits += v.toString(2).padStart(5, "0");
  }
  const out = new Uint8Array(new ArrayBuffer(Math.floor(bits.length / 8)));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

export async function totp(secret: string, at = Date.now(), step = 30): Promise<string> {
  const counter = Math.floor(at / 1000 / step);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0xf;
  const code =
    (((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

// accepts the previous and next 30s window too, for clock drift
export async function verifyTotp(secret: string, code: string, at = Date.now()): Promise<boolean> {
  for (const drift of [-1, 0, 1]) {
    if ((await totp(secret, at + drift * 30_000)) === code) return true;
  }
  return false;
}

export function otpauthUri(secret: string, account: string): string {
  return `otpauth://totp/Fin:${encodeURIComponent(account)}?secret=${secret}&issuer=Fin&algorithm=SHA1&digits=6&period=30`;
}
