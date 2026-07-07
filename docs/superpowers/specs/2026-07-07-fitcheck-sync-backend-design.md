# FitCheck Sync — cross-device clothing library

**Date:** 2026-07-07
**Status:** Approved design, pending spec review

## Problem

FitCheck's clothing library — the browsed **catalogue** and the **wardrobe
items** picked from it — lives only in the browser's IndexedDB, so it's
different on every device and lost if browser data clears. Andy wants his
clothing library the same on his phone and laptop.

## Goal

A tiny personal backend that stores the clothing **library as metadata** (not
image files) so any device with Andy's secret sees the same catalogue and
wardrobe items. Pictures keep loading from their source (Yupoo/shop) through the
existing image proxy — no image bytes are stored on the backend.

Non-goals (explicitly out):

- Storing image files on the backend (Andy chose "just the library, cross-
  device" — pictures stay hosted at Yupoo/shop). ~Kilobytes of storage total.
- Syncing his **photos of himself** or **generated looks** — those are images we
  aren't storing, so they stay device-local. (Can revisit later.)
- Syncing **manually uploaded clothing files** (a picture off his camera roll
  with no source URL) — nothing to re-load it from, so it stays local.
- Multi-user accounts, real-time collab, CRDTs. One user, one secret,
  last-write-wins with tombstones.

## Approach

One gated JSON document (`fitcheck/library.json`) in **Cloudflare R2 — the same
bucket the afilmory blog already uses** (`afilmory-photos`), read/written by a
single `api/sync.js` function behind a shared secret. The client keeps IndexedDB
as its working copy and adds a push/pull layer that mirrors only the library
metadata. Wardrobe items carry the URL their picture came from, so another
device re-loads the picture through the existing proxy instead of us storing it.

R2 is S3-compatible. Rather than the blog's heavy `@aws-sdk/client-s3`, FitCheck
signs the two requests it needs with **`aws4fetch`** (~4 KB, SigV4 over `fetch`,
runs in the Edge runtime) — keeping the project lean. It touches exactly one
hardcoded key, `fitcheck/library.json`; it never lists or reads any other object,
so sharing the blog's bucket can't disturb blog photos even though the R2
credential is bucket-wide.

## What syncs, and how the picture comes back

| Data | Synced fields | Picture on another device |
|------|---------------|---------------------------|
| Catalogue entry | `{id,name,image,albumUrl,category,host,createdAt}` | already a remote Yupoo URL — thumbnail via proxy, unchanged |
| Wardrobe item (from catalogue/import) | `{id,cat,name,imageUrl,source,createdAt}` | re-materialised on pull: `GET /api/import?img=<imageUrl>` → resize → IndexedDB |
| Wardrobe item (manual file upload) | — not synced (no `imageUrl`) | stays on the device it was added |

The item record gains an optional **`imageUrl`** (the direct source image) set
when it's created from a catalogue tap or a URL import. Only items with an
`imageUrl` sync.

## Setup Andy must do (Vercel dashboard — cannot be automated)

Add these env vars to the **fitcheck** Vercel project (copy the R2 values from the
afilmory/andypandy project — same bucket):

1. `R2_ENDPOINT` — e.g. `https://<account>.r2.cloudflarestorage.com`
2. `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
3. `R2_BUCKET_NAME` — `afilmory-photos` (the default in code if unset)
4. `SYNC_SECRET` — a passphrase Andy picks (gates the client → server calls)

Then redeploy (the deploy step after implementation picks it up). Adds the
project's first dependency, `aws4fetch`.

## Architecture

### Backend: `api/sync.js` (Edge function, `aws4fetch` → R2)

Every request needs `Authorization: Bearer <SYNC_SECRET>`, compared with a
constant-time equality → else `401`. No other auth surface. Signs R2 requests
with `aws4fetch` (`new AwsClient({ accessKeyId, secretAccessKey })`, region
`auto`, service `s3`) against `${R2_ENDPOINT}/${R2_BUCKET_NAME}/fitcheck/library.json`.

- **`GET /api/sync`** → R2 GET the library object, return its JSON; on 404 return
  `{ v: 1, empty: true }`.
- **`PUT /api/sync`** (body = library JSON) → validate shape, R2 PUT it (overwrite),
  return `{ ok: true, updatedAt }`.

That's the whole backend — two methods, one small JSON object at one hardcoded
key. No image endpoints (nothing image-bearing is stored). R2 credentials stay
server-side (env vars); the object key is fixed in code so the function can't be
coaxed into touching other bucket contents. If R2 env vars are missing, both
methods return `500` "Sync storage not configured".

### Library schema (`fitcheck/library.json`)

```json
{
  "v": 1,
  "updatedAt": 0,
  "catalog": [ { "id","name","image","albumUrl","category","host","createdAt" } ],
  "items":   [ { "id","cat","name","imageUrl","source","createdAt" } ],
  "deleted": [ "id","…" ]
}
```

`deleted` is a tombstone list so a delete on one device doesn't resurrect on the
next pull.

### Client sync layer (`app.js`)

- New Settings field **Sync secret** (localStorage, like the API key).
  `syncEnabled()` = secret set AND `proxyAvailable()`.
- **`push()`** (debounced ~2 s after a catalogue/wardrobe change, and on demand):
  build `{catalog, items(with imageUrl only), deleted}` from state → `PUT`.
- **`pull()`** (on load if enabled, and on demand):
  1. `GET` library.
  2. Drop any local catalog/item whose id ∈ `deleted`.
  3. Upsert catalogue entries by id (metadata only — no fetch).
  4. Upsert items by id; for a synced item not already local, re-materialise its
     picture: `GET /api/import?img=<imageUrl>` → resize → store the item in
     IndexedDB.
  5. Re-render.
- **On load:** `push()` local-unsynced first, then `pull()`.
- **Deletions:** removing a catalogue/item adds its id to a tombstone set carried
  in the next push.
- Failures are non-fatal (toast; app keeps working locally).

### Tombstones + merge — the one pure function to unit-test

`mergeLibrary(local, remote)` → `{catalog, items, deleted}`:
- start from `remote`; drop ids in `remote.deleted`;
- keep `local` records absent from `remote` and not tombstoned (local-only, not
  yet pushed);
- union of tombstone lists.

### Settings UI

Settings modal gains a **Sync secret** field, a **Sync now** button, and a status
line ("Synced · just now" / "Sync off" / "Secret rejected").

## Migration

Existing catalogue + URL-backed items already have everything needed except
`imageUrl` on older items — set it lazily (items imported after this ship carry
it; older ones simply don't sync until re-added, which is rare). First `push()`
writes the initial library; no user action beyond entering the secret once.

## Error handling & edge cases

- **No secret / localhost:** sync off; app behaves exactly as today.
- **401:** wrong secret → toast, sync disabled until fixed.
- **R2 not configured (missing env vars):** function returns `500` "Sync storage
  not configured"; client shows a one-time hint.
- **Item without `imageUrl`:** silently not synced (documented).
- **Concurrent two-device edit:** last pushed library wins; tombstones prevent
  delete-resurrection. Single-user limitation, documented.

## Security

- `api/sync` requires `Authorization: Bearer <SYNC_SECRET>`, constant-time
  compared — the one endpoint that must never be open (unlike `/api/generate`
  and `/api/import`, which stay as-is).
- R2 credentials (`R2_*`) live only in the server env, never in the client bundle.
- **Shared bucket blast radius:** the R2 credential is bucket-wide, but the
  function only ever GET/PUTs the single hardcoded key `fitcheck/library.json` —
  no list, no other keys, no user-supplied key — so it cannot read or overwrite
  afilmory blog photos. `R2_ENDPOINT`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`
  are `envTrim`-style trimmed (Vercel dashboard pastes can carry stray newlines
  that break SigV4 header signing).
- Secret in `localStorage`, sent only to same-origin `/api/sync` over HTTPS.
- Library is metadata only — no personal image ever touches the backend.

## Testing

- **Auth:** missing/wrong Bearer → 401; correct → 200.
- **Round-trip (live, post-deploy):** PUT a library, GET returns it byte-equal.
- **`mergeLibrary` (pure unit test):** remote adds upserted; tombstoned id
  dropped; local-only unsynced record kept; tombstone lists unioned.
- **End-to-end (manual):** enter secret in browser A, catalogue a store + tap an
  item, Sync; browser B with the same secret, Sync → same catalogue + item.

## Files touched

- `package.json` — add `aws4fetch`.
- `api/sync.js` — new Edge function (auth, R2 GET/PUT of `fitcheck/library.json`).
- `app.js` — sync layer (`push`/`pull`/`mergeLibrary`), `imageUrl` on URL-backed
  items, settings secret + Sync button, debounced push, pull on load.
- `index.html` — Settings: sync secret field, Sync button, status.
- `style.css` — minor sync-row styling.
- `test/` — auth + `mergeLibrary` unit tests.
- `README.md` — document optional sync; note the metadata-only privacy story.
