import { describe, expect, it } from 'vitest';

import {
  createPrivateSignature,
  verifyPrivateSignature,
} from '../workers/b2-cdn/src/signing';

describe('b2 cdn private signing', () => {
  const secret = 'test-secret';
  const pathname = '/private/moranjianghu/saves/demo.zip';
  const method = 'GET';

  it('accepts a valid signature', async () => {
    const nowMs = Date.now();
    const expiresAt = String(Math.floor(nowMs / 1000) + 600);
    const sig = await createPrivateSignature({ method, pathname, expiresAt, secret });

    await expect(
      verifyPrivateSignature({ method, pathname, expiresAt, sig: sig.toUpperCase(), secret, nowMs }),
    ).resolves.toBeUndefined();
  });

  it('rejects expired links', async () => {
    const nowMs = Date.now();
    const expiresAt = String(Math.floor(nowMs / 1000) - 1);
    const sig = await createPrivateSignature({ method, pathname, expiresAt, secret });

    await expect(
      verifyPrivateSignature({ method, pathname, expiresAt, sig, secret, nowMs }),
    ).rejects.toThrow('签名已过期');
  });

  it('rejects tampered signatures', async () => {
    const nowMs = Date.now();
    const expiresAt = String(Math.floor(nowMs / 1000) + 600);
    const sig = await createPrivateSignature({ method, pathname, expiresAt, secret });
    const tamperedSig = `${sig.slice(0, -1)}${sig.endsWith('0') ? '1' : '0'}`;

    await expect(
      verifyPrivateSignature({
        method,
        pathname,
        expiresAt,
        sig: tamperedSig,
        secret,
        nowMs,
      }),
    ).rejects.toThrow('签名无效');
  });

  it('rejects missing signatures', async () => {
    const nowMs = Date.now();
    const expiresAt = String(Math.floor(nowMs / 1000) + 600);

    await expect(
      verifyPrivateSignature({ method, pathname, expiresAt, secret, nowMs }),
    ).rejects.toThrow('缺少签名参数');
  });

  it('rejects invalid expiresAt values', async () => {
    const nowMs = Date.now();

    await expect(
      verifyPrivateSignature({
        method,
        pathname,
        expiresAt: 'not-a-number',
        sig: 'deadbeef',
        secret,
        nowMs,
      }),
    ).rejects.toThrow('签名过期时间无效');
  });
});
