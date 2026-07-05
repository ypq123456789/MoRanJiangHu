const encoder = new TextEncoder();

export interface PrivateSignaturePayload {
  method: string;
  pathname: string;
  expiresAt: string;
  secret: string;
}

export interface VerifyPrivateSignaturePayload extends PrivateSignaturePayload {
  sig?: string;
  nowMs?: number;
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export function buildPayload(method: string, pathname: string, expiresAt: string): string {
  return `${method.toUpperCase()}\n${pathname}\n${expiresAt}`;
}

export async function createPrivateSignature({
  method,
  pathname,
  expiresAt,
  secret,
}: PrivateSignaturePayload): Promise<string> {
  const key = await importKey(secret);
  const payload = buildPayload(method, pathname, expiresAt);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toHex(signature);
}

export async function verifyPrivateSignature({
  method,
  pathname,
  expiresAt,
  sig,
  secret,
  nowMs = Date.now(),
}: VerifyPrivateSignaturePayload): Promise<void> {
  if (!sig) {
    throw new Error('缺少签名参数');
  }

  const expireNumber = Number(expiresAt);
  if (!Number.isFinite(expireNumber)) {
    throw new Error('签名过期时间无效');
  }

  if (nowMs >= expireNumber * 1000) {
    throw new Error('签名已过期');
  }

  const expected = await createPrivateSignature({ method, pathname, expiresAt, secret });
  if (expected !== sig) {
    throw new Error('签名无效');
  }
}
