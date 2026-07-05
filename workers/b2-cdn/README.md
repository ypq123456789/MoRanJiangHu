# B2 CDN Worker

Standalone Cloudflare Worker for `cdn.bacon159.pp.ua/*`.

## Required secrets

Configure these as Cloudflare Worker secrets before deployment:

- `B2_CDN_SIGNING_SECRET`
- `MORAN_B2_APPLICATION_KEY_ID`
- `MORAN_B2_APPLICATION_KEY`
- `MORAN_B2_BUCKET_ID`
- `MORAN_B2_BUCKET_NAME`

## Route

- `cdn.bacon159.pp.ua/*`

## Local commands

Run from the repo root:

- `npm.cmd run b2-cdn:dev`
- `npm.cmd run b2-cdn:check`
- `npm.cmd run b2-cdn:deploy`

## Path conventions

Public objects do not require a signature:

- URL: `/public/<object-key>`
- Example: `/public/moranjianghu/apk/latest.apk`
- Example: `/public/moranjianghu/images/foo.webp`

Private objects require an expiry timestamp and HMAC signature:

- URL: `/private/<object-key>?e=<unix-seconds>&sig=<hex-hmac>`
- Example: `/private/moranjianghu/saves/save-001.zip?e=1760000000&sig=<signature>`

The `<object-key>` portion maps directly to the B2 object key after the `public/` or `private/` prefix.

## Generating private signatures

Signature payload format:

```text
<path>\n<expires>
```

Where:

- `<path>` is the request path beginning with `/private/`
- `<expires>` is the UNIX timestamp in seconds from the `e` query parameter

Example with Node.js:

```js
import crypto from 'node:crypto';

const secret = process.env.B2_CDN_SIGNING_SECRET;
const path = '/private/moranjianghu/saves/save-001.zip';
const expires = '1760000000';
const payload = `${path}\n${expires}`;
const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

console.log(`${path}?e=${expires}&sig=${sig}`);
```

## Rollout checklist

1. Confirm the worker route is set to `cdn.bacon159.pp.ua/*`.
2. Set the required Worker secrets in the Cloudflare dashboard or via Wrangler.
3. Run `npm.cmd run b2-cdn:check`.
4. Deploy with `npm.cmd run b2-cdn:deploy` or the GitHub Actions workflow.
5. Upload at least one public test object under `public/moranjianghu/...`.
6. Verify a public URL returns `200`.
7. Verify a private URL without `e` and `sig` returns `403`.
8. Generate a signed private URL and verify it returns `200`.
9. Confirm release surfaces that point at B2 CDN use `https://cdn.bacon159.pp.ua`.

## Release notes for operators

- This worker is intended to front B2 public APK/static assets and signed private assets.
- Task 8 can extend this checklist with stricter end-to-end validation steps if rollout requirements grow.
