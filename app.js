/* FitCheck — virtual try-on. Vanilla JS, zero deps.
   Data: IndexedDB (photos / items / looks), settings in localStorage.
   Generation: swappable provider module (Gemini "Nano Banana" family for now). */

'use strict';

/* ============================== config ============================== */

const CATS = [
  { key: 'wholeset', label: 'Whole set',      icon: '🧍', verb: 'Dress the person in the COMPLETE outfit shown in this image — every garment, layer and accessory visible in it, reproduced exactly. If another person is shown wearing it, copy ONLY their clothing and accessories, never their face, body or identity' },
  { key: 'top',      label: 'Tops',           icon: '👕', verb: 'Completely remove the subject\'s original top and dress them in this exact garment instead — none of the old top (collar, sleeves, hem) may remain visible' },
  { key: 'bottom',   label: 'Bottoms',        icon: '👖', verb: 'Completely remove the subject\'s original bottoms and dress them in these exact bottoms instead — none of the old pair may remain visible' },
  { key: 'outer',    label: 'Outerwear',      icon: '🧥', verb: 'Layer this exact jacket/outerwear naturally over their top' },
  { key: 'hat',      label: 'Hats & Beanies', icon: '🧢', verb: 'Place this exact hat/beanie naturally on their head' },
  { key: 'shoes',    label: 'Shoes',          icon: '👟', verb: 'Remove the subject\'s original footwear entirely and put them in this exact pair instead' },
  { key: 'necklace', label: 'Necklaces',      icon: '📿', verb: 'Add this exact necklace around their neck, resting naturally' },
  { key: 'watch',    label: 'Watches',        icon: '⌚', verb: 'Place this exact watch on their wrist' },
  { key: 'bracelet', label: 'Bracelets',      icon: '🔗', verb: 'Add this exact bracelet on their wrist' },
  { key: 'other',    label: 'Other',          icon: '✨', verb: 'Incorporate this exact item into the outfit naturally' },
  { key: 'hair',     label: 'Hair',           icon: '💇', verb: 'Restyle the subject\'s hair to exactly match the hairstyle and hair colour in this reference image — take ONLY the hair from it, never its face or the person shown, keeping the subject\'s own face and identity unchanged' },
];
const catByKey = k => CATS.find(c => c.key === k) || CATS[CATS.length - 1];

// Hairstyle try-on: pick a preset (text) OR upload a reference photo of a cut. Rendered in its own section.
const HAIR_PRESETS = [
  { id: 'buzz',     label: 'Buzz cut',       desc: 'a very short, uniform buzz cut — evenly clipped short hair over the whole scalp, with a clean and natural hairline, keeping the head shape realistic' },
  { id: 'crew',     label: 'Crew cut',       desc: 'a classic short crew cut, tapered at the sides' },
  { id: 'ivy',      label: 'Ivy League',     desc: 'a neat Ivy League cut with a clean side part and short tapered sides' },
  { id: 'slick',    label: 'Slicked back',   desc: 'hair slicked straight back, glossy and refined' },
  { id: 'crop',     label: 'Textured crop',  desc: 'a modern textured crop with a soft fringe' },
  { id: 'curtains', label: 'Curtains',       desc: 'medium-length curtain hair parted in the middle' },
  { id: 'quiff',    label: 'Quiff',          desc: 'a voluminous quiff swept up and back' },
  { id: 'manbun',   label: 'Man bun',        desc: 'longer hair tied up into a neat man bun' },
  { id: 'waves',    label: 'Shoulder waves', desc: 'shoulder-length loose wavy hair' },
  { id: 'bob',      label: 'Classic bob',    desc: 'a sleek chin-length bob' },
  { id: 'long',     label: 'Long & sleek',   desc: 'long, straight, sleek hair past the shoulders' },
  { id: 'curls',    label: 'Natural curls',  desc: 'natural, voluminous curly hair' },
];
const hairPresetById = id => HAIR_PRESETS.find(p => p.id === id);

// Backdrop / setting: single-select. null = keep the original background.
const BACKDROPS = [
  { id: 'studio', label: 'Studio', desc: 'a clean seamless studio backdrop with soft, even lighting' },
  { id: 'street', label: 'Street', desc: 'a stylish city street, softly blurred behind them' },
  { id: 'cafe',   label: 'Café',   desc: 'a cosy café interior, softly blurred behind them' },
  { id: 'beach',  label: 'Beach',  desc: 'a sunny beach with the sea and sky behind them' },
  { id: 'runway', label: 'Runway', desc: 'a fashion-show runway with subtle stage lighting' },
  { id: 'park',   label: 'Park',   desc: 'a green park in soft natural daylight' },
];
const backdropById = id => BACKDROPS.find(b => b.id === id);

const MODEL_NAMES = {
  'gemini-3.1-flash-image': 'Nano Banana 2',
  'gemini-3-pro-image': 'Nano Banana Pro',
};
// Always use the best model + highest resolution available (no in-app selection).
const BEST_MODEL = 'gemini-3-pro-image';   // Nano Banana Pro — strongest identity preservation for try-on
const BEST_IMAGE_SIZE = '1K';              // ~1080p — faster, cheaper, and lighter on mobile (was 4K)
const CLASSIFY_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];   // cheap vision model to categorise a garment by photo; 2nd is fallback if the 1st is busy
const DEFAULT_SETTINGS = {
  provider: 'gemini',
  apiKey: '',
  syncSecret: '',
};

const PERSON_MAX_DIM = 2048;   // keep the face at high resolution to help identity preservation
const ITEM_MAX_DIM = 1280;

/* ============================== state ============================== */

const state = {
  photos: [],
  items: [],
  looks: [],
  activePhotoId: localStorage.getItem('fitcheck.activePhoto') || null,
  sel: new Map(),          // category key -> Set of selected item ids (multi-select for mix & match)
  hairPresets: new Set(),  // selected hairstyle preset ids (multi-select; each becomes its own combination)
  backdrop: null,          // backdrop/setting id, or null to keep the original background
  notes: '',
  generating: false,
  genProgress: null,       // { i, total } while a batch is running
  abort: null,
  uploadCat: null,         // null => uploading a photo of you
  currentLookId: null,     // look open in viewer
  importMeta: null,        // { pageUrl, source, images:[{url,kind}], cat, chosen:Set<idx> } while the import modal is open
  catalog: [],             // lightweight store entries { id, name, image, albumUrl, category, drawer, host, createdAt } — no image data
  catalogFilter: '',       // name filter for the Catalogue grid
  catalogDrawer: null,     // selected drawer tab: null = All; '' = Unsorted; a name = that drawer
  pendingDeleted: new Set(),   // ids deleted locally since last sync (tombstones to push)
};

function getSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('fitcheck.settings')) || {}; } catch { /* corrupt -> defaults */ }
  const cfg = (typeof window !== 'undefined' && window.FITCHECK_CONFIG) || {};
  return { ...DEFAULT_SETTINGS, ...cfg, ...saved };
}
function saveSettings(s) {
  localStorage.setItem('fitcheck.settings', JSON.stringify(s));
}

/* On a deployed (non-localhost) origin, generation goes through the /api/generate
   proxy that holds the key server-side, so no client key is needed. Locally, the
   baked-in config.js / Settings key is used and requests go straight to Google. */
function proxyAvailable() {
  return location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname);
}
function canGenerate() { return !!getSettings().apiKey || proxyAvailable(); }

/* ============================== selection (mix & match) ============================== */

const MAX_LOOKS_PER_RUN = 20;   // safety cap on a single mix-and-match batch
const COST_PER_LOOK = 0.14;     // Nano Banana Pro @ ~1080p

const selSet = cat => state.sel.get(cat) || new Set();
function toggleSel(cat, id) {
  const s = state.sel.get(cat) || new Set();
  s.has(id) ? s.delete(id) : s.add(id);
  if (s.size) state.sel.set(cat, s); else state.sel.delete(cat);
}
function selectedItems() {   // flat list of every selected wardrobe item
  const out = [];
  for (const [, set] of state.sel) for (const id of set) { const it = state.items.find(i => i.id === id); if (it) out.push(it); }
  return out;
}
function anySelection() {
  return selectedItems().length > 0 || state.hairPresets.size > 0 || !!state.backdrop;
}
/* Cartesian product across every category (and the hairstyle dimension) that has a
   selection → one outfit per combination. Each combo is { items, hairPreset }.
   The hairstyle dimension = selected presets + selected hair-reference images, so
   picking several haircuts multiplies the looks just like several tops would. */
function buildCombos() {
  const dims = [];
  for (const c of CATS) {
    if (c.key === 'hair') continue;                          // hair is its own dimension, below
    const set = state.sel.get(c.key);
    if (set?.size) dims.push([...set].map(id => state.items.find(i => i.id === id)).filter(Boolean).map(it => ({ item: it })));
  }
  const hairOpts = [
    ...[...state.hairPresets].map(id => ({ hairPreset: id })),
    ...[...selSet('hair')].map(id => state.items.find(i => i.id === id)).filter(Boolean).map(it => ({ item: it })),
  ];
  if (hairOpts.length) dims.push(hairOpts);

  let combos = [{ items: [], hairPreset: null }];
  for (const dim of dims) {
    combos = combos.flatMap(base => dim.map(opt => ({
      items: opt.item ? [...base.items, opt.item] : base.items,
      hairPreset: opt.hairPreset ?? base.hairPreset,
    })));
  }
  return combos;
}
function comboCount() {
  if (!anySelection()) return 0;
  return buildCombos().length;   // hairstyle-only => number of chosen haircuts
}

/* ============================== IndexedDB ============================== */

let _db;
function db() {
  _db ??= new Promise((res, rej) => {
    const req = indexedDB.open('fitcheck', 2);
    req.onupgradeneeded = () => {
      for (const store of ['photos', 'items', 'looks', 'catalog']) {
        if (!req.result.objectStoreNames.contains(store)) {
          req.result.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => {
      const d = req.result;
      // mobile browsers force-close the connection when the tab is backgrounded;
      // drop our cached handle so the next op transparently reopens it.
      d.onclose = () => { _db = null; };
      d.onversionchange = () => { try { d.close(); } catch {} _db = null; };
      res(d);
    };
    req.onerror = () => { _db = null; rej(req.error); };
  });
  return _db;
}
/* Runs one transaction; if the connection was closed (backgrounded tab) it reopens and retries once. */
async function dbTxn(store, mode, fn, retry = true) {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('idb transaction aborted'));
    });
  } catch (e) {
    _db = null;   // discard the possibly-closed connection
    if (retry && /clos|invalidstate|abort|not allowed|unknown/i.test(String(e?.name) + String(e?.message))) {
      return dbTxn(store, mode, fn, false);
    }
    throw e;
  }
}
const dbPut = (store, val) => dbTxn(store, 'readwrite', s => s.put(val)).then(() => val);
const dbDel = (store, id) => dbTxn(store, 'readwrite', s => s.delete(id));
const dbAll = (store) => dbTxn(store, 'readonly', s => s.getAll()).then(r => r || []);

/* ============================== utils ============================== */

const $ = sel => document.querySelector(sel);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 8000 : 4500);
}

let _heic2any;
function loadHeic2any() {
  _heic2any ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload = () => res(window.heic2any);
    s.onerror = () => { _heic2any = null; rej(new Error('heic2any failed to load')); };
    document.head.appendChild(s);
  });
  return _heic2any;
}

async function fileToImage(file) {
  // iPhone photos are often HEIC — convert to JPEG first (heic2any pulled from CDN on demand)
  const isHeic = /hei[cf]/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
  if (isHeic) {
    try {
      const heic2any = await loadHeic2any();
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      return await createImageBitmap(Array.isArray(out) ? out[0] : out);
    } catch (e) { console.warn('FitCheck: HEIC convert failed, trying native decode', e); }
  }
  try {
    return await createImageBitmap(file);
  } catch {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('unreadable image')); };
      img.src = url;
    });
  }
}

/* Resize to max dimension, flatten transparency onto white, return JPEG data URL. */
async function resizeFile(file, maxDim) {
  const img = await fileToImage(file);
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  if (img.close) img.close();
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.86), w: cw, h: ch };
}

function dataUrlToInlinePart(dataUrl) {
  const [head, data] = dataUrl.split(',');
  const mimeType = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
  return { inlineData: { mimeType, data } };
}

const ASPECTS = [['1:1', 1], ['2:3', 2 / 3], ['3:2', 1.5], ['3:4', 0.75], ['4:3', 4 / 3], ['4:5', 0.8], ['5:4', 1.25], ['9:16', 9 / 16], ['16:9', 16 / 9], ['21:9', 21 / 9]];
function nearestAspect(w, h) {
  const target = Math.log(w / h);
  let best = ASPECTS[0];
  for (const a of ASPECTS) if (Math.abs(Math.log(a[1]) - target) < Math.abs(Math.log(best[1]) - target)) best = a;
  return best[0];
}

/* ============================== prompt ============================== */

function buildPrompt(items, notes, hairPreset, backdrop) {
  // individual garments (not the whole-set reference, not hair) override their piece of a whole set
  const overrideLabels = [...new Set(items.filter(i => i.cat !== 'wholeset' && i.cat !== 'hair').map(i => catByKey(i.cat).label.toLowerCase()))];
  const listPhrase = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const scene = backdrop ? backdropById(backdrop) : null;

  const changes = items.map((it, i) => {
    let verb = catByKey(it.cat).verb;
    if (it.cat === 'wholeset' && overrideLabels.length) {
      verb += `. Use this outfit as the base, BUT the ${listPhrase(overrideLabels)} given separately below REPLACE those pieces of it — use the separate item(s) for those and keep everything else from this outfit`;
    }
    return `- Image ${i + 2} (${catByKey(it.cat).label.toLowerCase()}): ${verb}.`;
  });
  const preset = hairPreset ? hairPresetById(hairPreset) : null;
  if (preset) changes.push(`- Hairstyle: restyle the subject's hair to ${preset.desc}, adapting it naturally to their head and hairline, while keeping their face, ears and head shape unchanged.`);
  if (scene) changes.push(`- Setting: place the subject in ${scene.desc}. Keep the subject's face, body and pose exactly the same; relight them naturally to match the new scene.`);
  const hairChanging = preset || items.some(it => it.cat === 'hair');

  const locked = ['face', 'facial features', 'bone structure', 'jawline', 'eyes', 'nose', 'mouth',
    'skin tone and complexion', ...(hairChanging ? [] : ['hair']), 'body shape', 'height and proportions',
    'exact pose', 'camera angle', ...(scene ? [] : ['background'])].join(', ');

  let p = `You are performing a precise virtual try-on photo edit. Image 1 is a real photograph of one specific real person — the subject.

CRITICAL — preserve the subject's identity EXACTLY. The person in the result must be unmistakably the SAME person as in Image 1: keep their ${locked} 100% identical to Image 1. Do NOT beautify, slim, smooth, restyle, age or de-age the person${scene ? '' : ', and do NOT change their surroundings'}. This identity match matters more than anything else in the image.

Change ONLY the following, nothing else:

${changes.join('\n')}

Where a garment is replaced, FULLY REMOVE the subject's original piece first — none of the original clothing being replaced may remain visible, peek out at the collar, cuffs, sleeves, hem or waist, or show through underneath the new item. Each new garment or accessory must keep its exact design, colour, pattern, texture and material from its reference image. Anything not listed above stays exactly as in Image 1. Blend every change in photorealistically — natural fit, draping, wrinkles, contact shadows and lighting consistent with Image 1. Output only the final edited photograph of the subject.`;
  if (notes && notes.trim()) p += `\n\nStyling notes: ${notes.trim()}`;
  return p;
}

/* ============================== providers ============================== */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function geminiHttpError(status, json) {
  const msg = json?.error?.message || '';
  if (status === 400 && /api key not valid|api_key_invalid/i.test(msg)) return new Error('API key not valid — double-check it in Settings.');
  if (status === 401 || status === 403) {
    if (/leaked/i.test(msg)) return new Error('Google flagged this API key as leaked — create a fresh one.');
    return new Error('Permission denied (' + status + '). Is billing enabled for this key? Image models have no free tier.');
  }
  if (status === 429) {
    if (/credit|billing|depleted|prepay/i.test(msg)) return new Error('Your Google API credits are depleted — top up billing at ai.studio/projects, then try again.');
    return new Error('Rate limit hit (429) — wait a moment and try again.');
  }
  if (status === 404) return new Error('Model not found (404) — it may have been renamed; check Settings.');
  if (status >= 500) return new Error('Google-side error (' + status + ') — try again in a moment.');
  return new Error('API error ' + status + (msg ? ': ' + msg.slice(0, 180) : ''));
}

const FINISH_MESSAGES = {
  IMAGE_SAFETY: "Google's safety filter blocked this generation — try a different photo, crop, or item.",
  IMAGE_PROHIBITED_CONTENT: "Google's safety filter blocked this generation — try a different photo or item.",
  PROHIBITED_CONTENT: 'Request was flagged as prohibited content — try different images.',
  SAFETY: 'Blocked by the safety filter — try a different photo or crop.',
  NO_IMAGE: 'The model returned no image — hit Generate again (or tweak the notes).',
  IMAGE_OTHER: 'Image generation failed on Google\'s side — try again.',
  IMAGE_RECITATION: 'Blocked for resembling existing content too closely — try a different item photo.',
};

const PROVIDERS = {
  gemini: {
    label: 'Gemini (Nano Banana)',
    /* Returns { dataUrl }. Throws Error with a human-readable message. */
    async generate({ apiKey, model, imageSize, person, items, notes, hairPreset, backdrop, signal }) {
      const parts = [
        { text: buildPrompt(items, notes, hairPreset, backdrop) },
        dataUrlToInlinePart(person.dataUrl),
        ...items.map(it => dataUrlToInlinePart(it.dataUrl)),
      ];
      const makeBody = withImageConfig => ({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(withImageConfig ? { imageConfig: { aspectRatio: nearestAspect(person.w, person.h), imageSize } } : {}),
        },
      });
      const useProxy = !apiKey;   // no client key => route through the server-side /api/generate proxy
      const call = bodyObj => useProxy
        ? fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, body: bodyObj }), signal })
        : fetch(`${GEMINI_BASE}/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj), signal });

      let res = await call(makeBody(true));
      let json = await res.json().catch(() => ({}));
      // imageConfig schema was in flux mid-2026; retry once without it if it's what 400'd
      if (res.status === 400 && /imageconfig|image_config|aspect_ratio|aspectratio|image_size|imagesize/i.test(json?.error?.message || '')) {
        console.warn('FitCheck: retrying without imageConfig —', json?.error?.message);
        res = await call(makeBody(false));
        json = await res.json().catch(() => ({}));
      }
      if (!res.ok) throw geminiHttpError(res.status, json);

      const block = json.promptFeedback?.blockReason;
      if (block) throw new Error(FINISH_MESSAGES[block] || `Request blocked (${block}) — try a different photo or crop.`);

      const cand = json.candidates?.[0];
      const images = (cand?.content?.parts || []).filter(p => p.inlineData?.data);
      if (!images.length) {
        const fr = cand?.finishReason;
        throw new Error(FINISH_MESSAGES[fr] || `No image returned${fr ? ' (' + fr + ')' : ''} — try again.`);
      }
      // last image part = final render (earlier ones can be Pro's interim "thinking" images)
      const img = images[images.length - 1].inlineData;
      return { dataUrl: `data:${img.mimeType || 'image/png'};base64,${img.data}` };
    },
    async testKey(apiKey) {
      const res = await fetch(`${GEMINI_BASE}/models?pageSize=1`, { headers: { 'x-goog-api-key': apiKey } });
      if (res.ok) return true;
      const json = await res.json().catch(() => ({}));
      throw geminiHttpError(res.status, json);
    },
  },
};

/* ============================== rendering ============================== */

function tileHtml(rec, { selected, kind }) {
  return `<div class="tile selectable ${selected ? 'selected' : ''}" data-action="select-${kind}" data-id="${rec.id}" role="button" tabindex="0">
    <img src="${rec.dataUrl}" alt="${esc(rec.name || kind)}" loading="lazy">
    <span class="check">✓</span>
    <button class="del" data-action="del-${kind}" data-id="${rec.id}" title="Delete">✕</button>
    ${rec.source?.url ? `<a class="shop" href="${esc(rec.source.url)}" target="_blank" rel="noopener" title="View at ${esc(rec.source.host || 'shop')}">↗</a>` : ''}
    ${rec.name ? `<span class="name">${esc(rec.name)}</span>` : ''}
  </div>`;
}

function renderPhotos() {
  const g = $('#photos-grid');
  g.innerHTML = state.photos.map(p => tileHtml(p, { selected: p.id === state.activePhotoId, kind: 'photo' })).join('') +
    `<button class="tile add" data-action="add-photo"><span class="plus">＋</span><span>Add photo of you</span></button>`;
}

function renderCats() {
  $('#categories').innerHTML = CATS.filter(c => c.key !== 'hair').map(cat => {
    const items = state.items.filter(i => i.cat === cat.key);
    const set = selSet(cat.key);
    return `<div class="cat" data-cat="${cat.key}">
      <div class="cat-head">
        <h3>${cat.icon} ${cat.label}</h3>
        <span class="count">${items.length ? items.length + ' item' + (items.length > 1 ? 's' : '') : ''}</span>
        ${set.size ? `<span class="picked">${set.size} selected</span>` : ''}
      </div>
      <div class="grid">
        ${items.map(i => tileHtml(i, { selected: set.has(i.id), kind: 'item' })).join('')}
        <button class="tile add" data-action="add-item" data-cat="${cat.key}"><span class="plus">＋</span><span>Add ${cat.label.toLowerCase()}</span></button>
      </div>
    </div>`;
  }).join('');
}

function renderHair() {
  const imgs = state.items.filter(i => i.cat === 'hair');
  const sel = selSet('hair');
  $('#hair-presets').innerHTML = HAIR_PRESETS.map(p =>
    `<button class="hair-preset ${state.hairPresets.has(p.id) ? 'selected' : ''}" data-action="select-hairpreset" data-preset="${p.id}">${esc(p.label)}</button>`
  ).join('');
  $('#hair-grid').innerHTML =
    imgs.map(i => tileHtml(i, { selected: sel.has(i.id), kind: 'item' })).join('') +
    `<button class="tile add" data-action="add-item" data-cat="hair"><span class="plus">＋</span><span>Upload a cut</span></button>`;
}

function renderScene() {
  const el = $('#scene-chips');
  if (!el) return;
  el.innerHTML = BACKDROPS.map(b =>
    `<button class="hair-preset ${state.backdrop === b.id ? 'selected' : ''}" data-action="select-backdrop" data-scene="${b.id}">${esc(b.label)}</button>`
  ).join('');
}

const drawerOf = c => c.drawer || '';
const drawerLabel = d => d || 'Unsorted';

function renderDrawers() {
  const el = $('#catalog-drawers');
  if (!el) return;
  // distinct drawers in insertion order, each with a count
  const counts = new Map();
  for (const c of state.catalog) { const d = drawerOf(c); counts.set(d, (counts.get(d) || 0) + 1); }
  const drawers = [...counts.keys()];
  if (state.catalogDrawer !== null && !counts.has(state.catalogDrawer)) state.catalogDrawer = null;   // drawer emptied
  const tab = (val, label, n) =>
    `<button class="hair-preset ${state.catalogDrawer === val ? 'selected' : ''}" data-action="select-drawer" data-drawer="${val === null ? '' : esc(val)}" data-all="${val === null}">${esc(label)}${n != null ? ` · ${n}` : ''}</button>`;
  el.innerHTML = tab(null, 'All', state.catalog.length) +
    drawers.map(d => tab(d, drawerLabel(d), counts.get(d))).join('');
}

function renderCatalog() {
  const sec = $('#catalog-section');
  if (!sec) return;
  if (!state.catalog.length) { sec.hidden = true; return; }
  sec.hidden = false;
  renderDrawers();
  const f = (state.catalogFilter || '').trim().toLowerCase();
  const list = state.catalog.filter(c =>
    (state.catalogDrawer === null || drawerOf(c) === state.catalogDrawer) &&
    (!f || (c.name || '').toLowerCase().includes(f)));
  const added = new Set(state.items.filter(i => i.source?.url).map(i => i.source.url));
  const count = $('#catalog-count');
  const scope = state.catalogDrawer === null ? state.catalog.length : state.catalog.filter(c => drawerOf(c) === state.catalogDrawer).length;
  if (count) count.textContent = `${list.length}${list.length !== scope ? ' of ' + scope : ''} item${list.length !== 1 ? 's' : ''}`;
  $('#catalog-grid').innerHTML = list.map(c => {
    const isAdded = added.has(c.albumUrl);
    return `<div class="tile catalog-tile ${isAdded ? 'added' : ''}" data-action="add-catalog" data-id="${c.id}" role="button" tabindex="0" title="${isAdded ? 'Already in your wardrobe' : 'Add to wardrobe'}">
      <img src="/api/import?img=${encodeURIComponent(c.image)}" alt="${esc(c.name || 'item')}" loading="lazy">
      <button class="del" data-action="del-catalog" data-id="${c.id}" title="Remove">✕</button>
      ${c.albumUrl ? `<a class="shop" href="${esc(c.albumUrl)}" target="_blank" rel="noopener" title="View at ${esc(c.host || 'store')}">↗</a>` : ''}
      <span class="name">${isAdded ? '✓ ' : ''}${esc(c.name || catByKey(c.category).label)}</span>
    </div>`;
  }).join('');
}

function renderLooks() {
  const g = $('#looks-grid');
  if (!state.looks.length) {
    g.innerHTML = `<div class="empty">Nothing here yet — pick a fit below and hit Generate.</div>`;
    return;
  }
  g.innerHTML = state.looks.map(l => `
    <div class="tile look-tile" data-action="open-look" data-id="${l.id}" role="button" tabindex="0">
      <img src="${l.dataUrl}" alt="Generated look" loading="lazy">
      <span class="name">${(l.hairPreset ? '💇 ' : '') + l.items.map(i => catByKey(i.cat).icon).join(' ')} · ${new Date(l.createdAt).toLocaleDateString()}</span>
    </div>`).join('');
}

function renderOutfitBar() {
  const chipEls = selectedItems().map(i => `<span class="chip">${catByKey(i.cat).icon} ${esc(i.name || catByKey(i.cat).label)} <span class="x" data-action="unselect-chip" data-cat="${i.cat}" data-id="${i.id}">✕</span></span>`);
  for (const pid of state.hairPresets) {
    const p = hairPresetById(pid);
    chipEls.unshift(`<span class="chip">💇 ${esc(p?.label || 'Hairstyle')} <span class="x" data-action="unselect-hairpreset" data-preset="${pid}">✕</span></span>`);
  }
  if (state.backdrop) {
    const b = backdropById(state.backdrop);
    chipEls.push(`<span class="chip">🖼️ ${esc(b?.label || 'Setting')} <span class="x" data-action="unselect-backdrop">✕</span></span>`);
  }
  const chips = chipEls.length
    ? chipEls.join('')
    : `<span class="chip placeholder">nothing selected yet — pick items or a hairstyle</span>`;
  const raw = comboCount();
  const n = Math.min(raw, MAX_LOOKS_PER_RUN);
  const label = n <= 1 ? '✨ Generate fit' : `✨ Generate ${n} looks · ~$${(n * COST_PER_LOOK).toFixed(2)}`;
  const capNote = raw > MAX_LOOKS_PER_RUN ? `<span class="cap-note">${raw} combinations — will render the first ${MAX_LOOKS_PER_RUN}</span>` : '';
  $('#outfit-bar').innerHTML = `<div class="outfit-inner">
    <div class="chips">${chips}${capNote}</div>
    <input class="notes" id="notes-input" placeholder="style notes, e.g. tuck the shirt in" value="${esc(state.notes)}">
    <span class="model-badge" title="Always generates on the best model available">✨ Nano Banana Pro · 1080p</span>
    ${state.generating
      ? `<span class="gen-status"><span class="spinner"></span> ${state.genProgress ? `Rendering look ${state.genProgress.i} of ${state.genProgress.total}…` : 'Rendering…'}</span>
         <button class="btn" data-action="cancel-generate">Cancel</button>`
      : `<button class="btn primary" id="generate-btn" data-action="generate"${n === 0 ? ' disabled' : ''}>${label}</button>`}
  </div>`;
}

function renderBanner() {
  $('#key-banner').classList.toggle('hidden', canGenerate());
}

function renderAll() {
  renderPhotos();
  renderCats();
  renderHair();
  renderScene();
  renderCatalog();
  renderLooks();
  renderOutfitBar();
  renderBanner();
  const note = $('#import-note'); if (note) note.classList.toggle('hidden', proxyAvailable());
}

/* ============================== viewer / settings modals ============================== */

function openViewer(lookId) {
  const look = state.looks.find(l => l.id === lookId);
  if (!look) return;
  state.currentLookId = lookId;
  $('#viewer-img').src = look.dataUrl;
  $('#viewer-meta').innerHTML =
    look.items.map(i => `<span class="chip">${catByKey(i.cat).icon} ${esc(i.name || catByKey(i.cat).label)}</span>`).join('') +
    (look.hairPreset ? `<span class="chip">💇 ${esc(hairPresetById(look.hairPreset)?.label || 'Hairstyle')}</span>` : '') +
    (look.backdrop ? `<span class="chip">🖼️ ${esc(backdropById(look.backdrop)?.label || 'Setting')}</span>` : '') +
    (look.notes ? `<span class="chip">📝 ${esc(look.notes)}</span>` : '') +
    `<span class="when">${new Date(look.createdAt).toLocaleString()} · ${esc(MODEL_NAMES[look.model] || look.model)} · ${esc(look.size || '')}${look.ms ? ' · ' + Math.round(look.ms / 1000) + 's' : ''}</span>`;
  const shops = look.items.map(li => state.items.find(x => x.id === li.id)).filter(x => x?.source?.url)
    .map(x => `<a class="chip shop-chip" href="${esc(x.source.url)}" target="_blank" rel="noopener">↗ ${esc(x.source.host || 'shop')}</a>`).join('');
  if (shops) $('#viewer-meta').innerHTML += shops;
  $('#viewer-modal').classList.add('open');
}

function openSettings() {
  const s = getSettings();
  $('#set-key').value = s.apiKey;
  $('#test-key-result').textContent = '';
  $('#test-key-result').className = 'test-result';
  const sync = $('#sync-secret'); if (sync) sync.value = s.syncSecret || '';
  setSyncStatus(syncEnabled() ? 'Sync on' : (proxyAvailable() ? 'Sync off — add a secret' : 'Sync runs on the hosted site'));
  $('#settings-modal').classList.add('open');
}

function closeModals() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  state.currentLookId = null;
  state.importMeta = null;
}

/* ============================== actions ============================== */

async function handleFiles(files) {
  const cat = state.uploadCat;
  let ok = 0;
  for (const file of files) {
    try {
      if (cat === null) {
        const { dataUrl, w, h } = await resizeFile(file, PERSON_MAX_DIM);
        const rec = { id: uid(), dataUrl, w, h, createdAt: Date.now() };
        await dbPut('photos', rec);
        state.photos.push(rec);
        state.activePhotoId = rec.id;
        localStorage.setItem('fitcheck.activePhoto', rec.id);
      } else {
        const { dataUrl } = await resizeFile(file, ITEM_MAX_DIM);
        const rec = { id: uid(), cat, dataUrl, createdAt: Date.now() };   // no filename kept
        await dbPut('items', rec);
        state.items.push(rec);
      }
      ok++;
    } catch (e) {
      console.warn('FitCheck upload failed:', e);
      toast("Couldn't read that image — try a JPEG or PNG.", 'err');
    }
  }
  if (ok) toast(cat === null ? `Added ${ok} photo${ok > 1 ? 's' : ''} of you` : `Added ${ok} item${ok > 1 ? 's' : ''}`);
  renderAll();
}

/* ============================== import from a shop URL ============================== */

async function importFromUrl() {
  if (!proxyAvailable()) { toast('Import runs on the hosted site (fitcheck.andypandy.org), not locally.', 'err'); return; }
  const raw = ($('#import-url')?.value || '').trim();
  if (!/^https?:\/\//i.test(raw)) { toast('Paste a full product link (starting with http).', 'err'); return; }
  if (/yupoo\.com\/categories\//i.test(raw)) return importStoreFromUrl(raw);   // whole-store bulk import
  const btn = $('#import-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
  try {
    const res = await fetch('/api/import?url=' + encodeURIComponent(raw));
    const meta = await res.json().catch(() => ({ ok: false }));
    if (!meta.ok || !meta.images?.length) { toast("Couldn't read that link — try the image upload instead.", 'err'); return; }
    state.importMeta = {
      pageUrl: raw,
      source: meta.source || {},
      images: meta.images,
      cat: meta.suggestedCategory || 'other',
      chosen: new Set([0]),          // first (packshot) selected by default
    };
    renderImportModal();
    $('#import-modal').classList.add('open');
  } catch (e) {
    console.warn('FitCheck import failed:', e);
    toast('Import failed — check the link or try again.', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
  }
}

function renderImportModal() {
  const m = state.importMeta;
  if (!m) return;
  const price = m.source.price != null ? `${m.source.currency ? m.source.currency + ' ' : ''}${m.source.price}` : '';
  $('#import-title').textContent = m.source.name || 'Imported item';
  $('#import-sub').textContent = [m.source.host, price].filter(Boolean).join('  ·  ');
  $('#import-thumbs').innerHTML = m.images.map((img, i) =>
    `<div class="tile selectable ${m.chosen.has(i) ? 'selected' : ''}" data-action="toggle-import-img" data-idx="${i}" role="button" tabindex="0">
       <img src="${esc(img.url)}" alt="option ${i + 1}" loading="lazy" referrerpolicy="no-referrer">
       <span class="check">✓</span>
     </div>`).join('');
  $('#import-cat').innerHTML = CATS.map(c =>
    `<option value="${c.key}"${c.key === m.cat ? ' selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('');
}

async function addImported() {
  const m = state.importMeta;
  if (!m) return;
  const idxs = [...m.chosen];
  if (!idxs.length) { toast('Pick at least one image.', 'err'); return; }
  const btn = $('#import-add-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  let ok = 0;
  for (const i of idxs) {
    const url = m.images[i]?.url;
    if (!url) continue;
    try {
      const res = await fetch('/api/import?img=' + encodeURIComponent(url));
      if (!res.ok) throw new Error('proxy ' + res.status);
      const blob = await res.blob();
      const { dataUrl } = await resizeFile(blob, ITEM_MAX_DIM);
      const rec = {
        id: uid(), cat: m.cat, dataUrl,
        name: m.source.name || '',
        imageUrl: url,   // direct source image, so other devices can re-load it on sync
        source: { name: m.source.name || '', price: m.source.price ?? null, currency: m.source.currency || '', host: m.source.host || '', url: m.pageUrl },
        createdAt: Date.now(),
      };
      await dbPut('items', rec);
      state.items.push(rec);
      ok++;
    } catch (e) { console.warn('FitCheck import add failed:', e); }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Add to wardrobe'; }
  const host = m.source.host || 'the shop';
  state.importMeta = null;
  closeModals();
  renderAll();
  if (ok) scheduleSync();
  toast(ok ? `Added ${ok} item${ok > 1 ? 's' : ''} from ${host}.` : "Couldn't fetch that image — try again.", ok ? '' : 'err');
}

/* Catalogue a whole Yupoo store/category: paginate its album cards and store only the
   lightweight entry (title, cover URL, album link, guessed category) — no image download.
   Browse them in the Catalogue section; each piece materialises into a real wardrobe item
   only when tapped. Dedupes by album URL so re-running a store adds only what's new. */
async function importStoreFromUrl(raw) {
  // name a drawer for this batch (blank => Unsorted); existing names shown as a hint so they merge
  const existing = [...new Set(state.catalog.map(c => c.drawer).filter(Boolean))];
  const hint = existing.length ? `\n\nExisting drawers: ${existing.slice(0, 8).join(', ')}` : '';
  const answer = prompt(`Name a drawer for these items (leave blank for Unsorted):${hint}`, '');
  if (answer === null) return;                 // cancelled the whole import
  const drawer = answer.trim();
  const btn = $('#import-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Reading store…'; }
  const found = [];
  const seenAlbum = new Set(state.catalog.map(c => c.albumUrl));   // skip anything already catalogued
  let host = '';
  try {
    for (let page = 1; page <= 40; page++) {
      const u = new URL(raw); u.searchParams.set('page', String(page));
      const res = await fetch('/api/import?store=' + encodeURIComponent(u.href));
      const meta = await res.json().catch(() => ({ ok: false }));
      if (!meta.ok || !meta.items?.length) break;
      host = meta.store?.host || host;
      let anyNew = false;
      for (const it of meta.items) {
        if (seenAlbum.has(it.albumUrl)) continue;
        seenAlbum.add(it.albumUrl); anyNew = true;
        found.push({ id: uid(), name: it.name || '', image: it.image, albumUrl: it.albumUrl, category: it.category || 'other', drawer, host, createdAt: Date.now() });
      }
      if (!anyNew) break;                       // page repeated a prior one => past the end
      if (btn) btn.textContent = `Reading store… ${found.length}`;
      if (state.catalog.length + found.length >= 3000) break;   // safety cap
    }
  } catch { /* keep whatever we gathered */ }
  if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
  if (!found.length) {
    toast(state.catalog.length ? 'No new items — that store is already catalogued.' : "Couldn't read that store page.", state.catalog.length ? '' : 'err');
    return;
  }
  for (const c of found) { try { await dbPut('catalog', c); } catch {} }
  state.catalog.push(...found);
  state.catalogDrawer = drawer;                 // focus the drawer we just filled
  renderCatalog();
  scheduleSync();
  $('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast(`Catalogued ${found.length} item${found.length !== 1 ? 's' : ''} into “${drawer || 'Unsorted'}” — tap any to add.`);
}

/* Ask the vision model which category a garment photo is — titles (Yupoo SKU codes)
   rarely say. Returns a category key, or null to fall back to the title guess.
   Routes through /api/generate (deployed) or direct with a local key, like generate. */
const CLASSIFY_CATS = CATS.filter(c => c.key !== 'hair').map(c => c.key);
async function classifyGarment(dataUrl) {
  if (!canGenerate()) return null;
  const s = getSettings();
  const prompt = `Look at this clothing product photo. Which ONE category best fits the main garment or accessory? Reply with EXACTLY one of these words, nothing else: ${CLASSIFY_CATS.join(', ')}. A complete outfit or set worn together => wholeset. If truly unclear => other.`;
  const body = { contents: [{ parts: [{ text: prompt }, dataUrlToInlinePart(dataUrl)] }], generationConfig: { temperature: 0, maxOutputTokens: 10 } };
  for (const model of CLASSIFY_MODELS) {
    try {
      const res = s.apiKey
        ? await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': s.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, body }) });
      if (!res.ok) continue;   // busy/unavailable (e.g. 503) => try the fallback model
      const json = await res.json();
      const txt = (json.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').toLowerCase();
      return CLASSIFY_CATS.find(k => new RegExp(`\\b${k}\\b`).test(txt)) || null;
    } catch { /* network error => try next model */ }
  }
  return null;
}

/* Pull one catalogued item's cover through the proxy, resize, classify it by image,
   and store it as a real wardrobe item (the only point an image is downloaded). */
async function materializeCatalog(id) {
  const c = state.catalog.find(x => x.id === id);
  if (!c) return;
  if (state.items.some(i => i.source?.url === c.albumUrl)) { toast('Already in your wardrobe.'); return; }
  const tile = document.querySelector(`.catalog-tile[data-id="${id}"]`);
  tile?.classList.add('busy');
  try {
    const res = await fetch('/api/import?img=' + encodeURIComponent(c.image));
    if (!res.ok) throw new Error('proxy ' + res.status);
    const { dataUrl } = await resizeFile(await res.blob(), ITEM_MAX_DIM);
    const cat = (await classifyGarment(dataUrl)) || c.category || 'other';   // image beats the coded title
    const rec = {
      id: uid(), cat, dataUrl, name: c.name || '',
      imageUrl: c.image,   // lets other devices re-load the picture on sync
      source: { name: c.name || '', price: null, currency: '', host: c.host || '', url: c.albumUrl },
      createdAt: Date.now(),
    };
    await dbPut('items', rec);
    state.items.push(rec);
    renderCats(); renderCatalog();
    scheduleSync();
    toast(`Added “${c.name || 'item'}” to ${catByKey(cat).label}.`);
  } catch (e) {
    console.warn('FitCheck materialize failed:', e);
    toast("Couldn't fetch that image — try again.", 'err');
  }
  tile?.classList.remove('busy');
}

/* ============================== cross-device sync (clothing library) ============================== */

function syncEnabled() { return !!getSettings().syncSecret && proxyAvailable(); }

function setSyncStatus(msg) { const el = $('#sync-status'); if (el) el.textContent = msg; }

const itemImageUrl = it => it.imageUrl || it.source?.imageUrl || '';

/* Sent up: the catalogue + only URL-backed wardrobe items (re-loadable elsewhere) + tombstones. */
function buildLocalLibrary() {
  return {
    v: 1,
    catalog: state.catalog.map(c => ({ id: c.id, name: c.name, image: c.image, albumUrl: c.albumUrl, category: c.category, drawer: c.drawer || '', host: c.host, createdAt: c.createdAt })),
    items: state.items.filter(itemImageUrl).map(i => ({ id: i.id, cat: i.cat, name: i.name || '', imageUrl: itemImageUrl(i), source: i.source || {}, createdAt: i.createdAt })),
    deleted: [...state.pendingDeleted],
  };
}

let _syncTimer;
function scheduleSync() { if (!syncEnabled()) return; clearTimeout(_syncTimer); _syncTimer = setTimeout(() => syncNow(true), 2500); }

async function syncNow(silent) {
  if (!syncEnabled()) { if (!silent) toast('Add a sync secret in Settings first (and it needs the hosted site).', 'err'); return; }
  setSyncStatus('Syncing…');
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getSettings().syncSecret },
      body: JSON.stringify(buildLocalLibrary()),
    });
    if (res.status === 401) { setSyncStatus('Secret rejected'); if (!silent) toast('Sync secret rejected — check Settings.', 'err'); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) { setSyncStatus('Sync unavailable'); if (!silent) toast(data.error ? 'Sync: ' + data.error : 'Sync failed.', 'err'); return; }
    await applyMergedLibrary(data.library);
    state.pendingDeleted.clear();
    setSyncStatus('Synced · just now');
    if (!silent) toast('Synced.');
  } catch (e) {
    console.warn('FitCheck sync failed:', e);
    setSyncStatus('Sync failed');
    if (!silent) toast('Sync failed — try again.', 'err');
  }
}

/* Bring local state in line with the merged library the server returned. */
async function applyMergedLibrary(lib) {
  const cat = Array.isArray(lib?.catalog) ? lib.catalog : [];
  const items = Array.isArray(lib?.items) ? lib.items : [];
  // catalogue: replace local set with the merged one
  const mergedCatIds = new Set(cat.map(c => c.id));
  for (const c of state.catalog) if (!mergedCatIds.has(c.id)) { try { await dbDel('catalog', c.id); } catch {} }
  const localCatIds = new Set(state.catalog.map(c => c.id));
  for (const c of cat) if (!localCatIds.has(c.id)) { try { await dbPut('catalog', c); } catch {} }
  state.catalog = cat.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  // items: drop synced-but-now-gone (deleted elsewhere); re-materialise new ones
  const mergedItemIds = new Set(items.map(i => i.id));
  for (const it of state.items.slice()) {
    if (itemImageUrl(it) && !mergedItemIds.has(it.id)) {
      try { await dbDel('items', it.id); } catch {}
      state.items = state.items.filter(x => x.id !== it.id);
    }
  }
  const localItemIds = new Set(state.items.map(i => i.id));
  for (const meta of items) {
    if (localItemIds.has(meta.id) || !meta.imageUrl) continue;
    try {
      const r = await fetch('/api/import?img=' + encodeURIComponent(meta.imageUrl));
      if (!r.ok) throw new Error('proxy ' + r.status);
      const { dataUrl } = await resizeFile(await r.blob(), ITEM_MAX_DIM);
      const rec = { id: meta.id, cat: meta.cat || 'other', dataUrl, name: meta.name || '', imageUrl: meta.imageUrl, source: meta.source || {}, createdAt: meta.createdAt || Date.now() };
      await dbPut('items', rec);
      state.items.push(rec);
    } catch (e) { console.warn('FitCheck sync re-materialise failed:', meta.id, e); }
  }
  state.items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  renderAll();
}

async function generate() {
  if (state.generating) return;
  const s = getSettings();
  if (!canGenerate()) { openSettings(); toast('Add your Gemini API key first (billing enabled — image models have no free tier).', 'err'); return; }
  const person = state.photos.find(p => p.id === state.activePhotoId);
  if (!person) { toast('Add a photo of yourself first (section 1).', 'err'); return; }
  if (!anySelection()) { toast('Pick at least one item or a hairstyle to try on.', 'err'); return; }

  let combos = buildCombos();                       // array of { items, hairPreset }
  const capped = combos.length > MAX_LOOKS_PER_RUN;
  if (capped) combos = combos.slice(0, MAX_LOOKS_PER_RUN);
  const total = combos.length;

  state.generating = true;
  state.abort = new AbortController();
  let done = 0, failed = 0, aborted = false, firstId = null;
  for (let idx = 0; idx < combos.length; idx++) {
    if (state.abort.signal.aborted) { aborted = true; break; }
    state.genProgress = { i: idx + 1, total };
    renderOutfitBar();
    const combo = combos[idx];
    const t0 = Date.now();
    try {
      const out = await PROVIDERS[s.provider].generate({
        apiKey: s.apiKey, model: BEST_MODEL, imageSize: BEST_IMAGE_SIZE,
        person, items: combo.items, notes: state.notes, hairPreset: combo.hairPreset, backdrop: state.backdrop, signal: state.abort.signal,
      });
      const look = {
        id: uid(), dataUrl: out.dataUrl,
        items: combo.items.map(i => ({ id: i.id, cat: i.cat })),
        hairPreset: combo.hairPreset, backdrop: state.backdrop, notes: state.notes, model: BEST_MODEL, size: BEST_IMAGE_SIZE,
        ms: Date.now() - t0, createdAt: Date.now(),
      };
      await dbPut('looks', look);
      state.looks.unshift(look);
      firstId ||= look.id;
      renderLooks();
      done++;
    } catch (e) {
      if (e.name === 'AbortError') { aborted = true; break; }
      console.error('FitCheck generate failed:', e);
      toast(total > 1 ? `Look ${idx + 1}/${total}: ${e.message || 'failed'}` : (e.message || 'Generation failed.'), 'err');
      failed++;
    }
  }
  state.generating = false; state.abort = null; state.genProgress = null;
  renderOutfitBar();

  if (aborted) toast(`Stopped after ${done} look${done === 1 ? '' : 's'}.`);
  else if (total === 1 && done === 1) openViewer(firstId);
  else if (done) toast(`Rendered ${done} look${done === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}${capped ? ` (capped at ${MAX_LOOKS_PER_RUN})` : ''} — see the Lookbook.`);
}

function regenerateFromLook(lookId) {
  const look = state.looks.find(l => l.id === lookId);
  if (!look) return;
  state.sel.clear();
  let missing = 0;
  for (const it of look.items) {
    if (state.items.some(i => i.id === it.id)) { const s = state.sel.get(it.cat) || new Set(); s.add(it.id); state.sel.set(it.cat, s); }
    else missing++;
  }
  state.hairPresets = new Set(look.hairPreset ? [look.hairPreset] : []);
  state.backdrop = look.backdrop || null;
  state.notes = look.notes || '';
  closeModals();
  renderAll();
  if (!state.sel.size && !state.hairPresets.size) { toast('The items from this look were deleted from your wardrobe — can\'t regenerate.', 'err'); return; }
  if (missing) toast(`${missing} item${missing > 1 ? 's were' : ' was'} deleted since — regenerating with the rest.`);
  generate();
}

function downloadLook(lookId) {
  const look = state.looks.find(l => l.id === lookId);
  if (!look) return;
  const a = document.createElement('a');
  a.href = look.dataUrl;
  const ext = (look.dataUrl.match(/^data:image\/(\w+)/) || [, 'png'])[1];
  a.download = `fitcheck-${new Date(look.createdAt).toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;
  a.click();
}

/* Two-tap delete: first tap arms the button, second within 2.5s executes. */
function armThen(btn, fn) {
  if (btn.classList.contains('armed')) { fn(); return; }
  btn.classList.add('armed');
  btn.textContent = 'Sure?';
  setTimeout(() => { btn.classList.remove('armed'); btn.textContent = '✕'; }, 2500);
}

async function testKey() {
  const key = $('#set-key').value.trim();
  const out = $('#test-key-result');
  if (!key) { out.textContent = 'Paste a key first'; out.className = 'test-result err'; return; }
  out.textContent = 'Testing…'; out.className = 'test-result';
  try {
    await PROVIDERS.gemini.testKey(key);
    out.textContent = '✓ Key works'; out.className = 'test-result ok';
  } catch (e) {
    out.textContent = e.message; out.className = 'test-result err';
  }
}

/* ============================== events ============================== */

document.addEventListener('click', e => {
  if (e.target.closest('a.shop')) return;   // let the shop link open its tab, don't select/deselect the tile
  const el = e.target.closest('[data-action]');
  if (!el) {
    if (e.target.classList && e.target.classList.contains('modal')) closeModals(); // click outside card
    return;
  }
  const { action, id, cat } = el.dataset;
  switch (action) {
    case 'add-photo': state.uploadCat = null; $('#file-input').click(); break;
    case 'add-item': state.uploadCat = cat; $('#file-input').click(); break;
    case 'select-photo':
      state.activePhotoId = id;
      localStorage.setItem('fitcheck.activePhoto', id);
      renderPhotos();
      break;
    case 'select-item': {
      const item = state.items.find(i => i.id === id);
      if (!item) break;
      toggleSel(item.cat, id);
      renderCats(); renderHair(); renderOutfitBar();
      break;
    }
    case 'unselect-chip': {
      const set = state.sel.get(cat);
      if (set) { set.delete(id); if (!set.size) state.sel.delete(cat); }
      renderCats(); renderHair(); renderOutfitBar();
      break;
    }
    case 'select-hairpreset': {
      const p = el.dataset.preset;
      state.hairPresets.has(p) ? state.hairPresets.delete(p) : state.hairPresets.add(p);
      renderHair(); renderOutfitBar();
      break;
    }
    case 'unselect-hairpreset': state.hairPresets.delete(el.dataset.preset); renderHair(); renderOutfitBar(); break;
    case 'select-backdrop': {
      const bd = el.dataset.scene;
      state.backdrop = state.backdrop === bd ? null : bd;   // single-select; re-tap clears back to original
      renderScene(); renderOutfitBar();
      break;
    }
    case 'unselect-backdrop': state.backdrop = null; renderScene(); renderOutfitBar(); break;
    case 'del-photo':
      e.stopPropagation();
      armThen(el, async () => {
        await dbDel('photos', id);
        state.photos = state.photos.filter(p => p.id !== id);
        if (state.activePhotoId === id) {
          state.activePhotoId = state.photos[0]?.id || null;
          localStorage.setItem('fitcheck.activePhoto', state.activePhotoId || '');
        }
        renderPhotos();
      });
      break;
    case 'del-item':
      e.stopPropagation();
      armThen(el, async () => {
        const item = state.items.find(i => i.id === id);
        await dbDel('items', id);
        state.items = state.items.filter(i => i.id !== id);
        const set = item && state.sel.get(item.cat);
        if (set) { set.delete(id); if (!set.size) state.sel.delete(item.cat); }
        if (item && itemImageUrl(item)) { state.pendingDeleted.add(id); scheduleSync(); }   // tombstone synced items
        renderCats(); renderHair(); renderOutfitBar();
      });
      break;
    case 'generate': generate(); break;
    case 'select-drawer':
      state.catalogDrawer = el.dataset.all === 'true' ? null : el.dataset.drawer;
      renderCatalog();
      break;
    case 'add-catalog': materializeCatalog(id); break;
    case 'del-catalog':
      e.stopPropagation();
      armThen(el, async () => {
        await dbDel('catalog', id);
        state.catalog = state.catalog.filter(c => c.id !== id);
        state.pendingDeleted.add(id); scheduleSync();
        renderCatalog();
      });
      break;
    case 'clear-catalog':
      if (state.catalog.length && confirm(`Remove all ${state.catalog.length} catalogued items? Your wardrobe stays untouched.`)) {
        (async () => {
          for (const c of state.catalog) { try { await dbDel('catalog', c.id); } catch {} state.pendingDeleted.add(c.id); }
          state.catalog = []; state.catalogFilter = '';
          renderCatalog();
          scheduleSync();
          toast('Catalogue cleared.');
        })();
      }
      break;
    case 'import-url': importFromUrl(); break;
    case 'toggle-import-img': {
      const i = +el.dataset.idx;
      const ch = state.importMeta?.chosen;
      if (ch) { ch.has(i) ? ch.delete(i) : ch.add(i); renderImportModal(); }
      break;
    }
    case 'confirm-import': addImported(); break;
    case 'cancel-generate': state.abort?.abort(); break;
    case 'open-look': openViewer(id); break;
    case 'download-look': downloadLook(state.currentLookId); break;
    case 'regen-look': regenerateFromLook(state.currentLookId); break;
    case 'del-look': {
      const lookId = state.currentLookId;
      dbDel('looks', lookId).then(() => {
        state.looks = state.looks.filter(l => l.id !== lookId);
        closeModals();
        renderLooks();
        toast('Look deleted.');
      });
      break;
    }
    case 'open-settings': openSettings(); break;
    case 'close-modal': closeModals(); break;
    case 'toggle-key-vis': {
      const inp = $('#set-key');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      break;
    }
    case 'test-key': testKey(); break;
    case 'save-settings': {
      const s = getSettings();
      s.apiKey = $('#set-key').value.trim();
      s.syncSecret = ($('#sync-secret')?.value || '').trim();
      saveSettings(s);
      closeModals();
      renderOutfitBar(); renderBanner();
      toast('Settings saved.');
      if (syncEnabled()) syncNow(false);
      break;
    }
    case 'sync-now': syncNow(false); break;
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'notes-input') state.notes = e.target.value;
  if (e.target.id === 'catalog-filter') { state.catalogFilter = e.target.value; renderCatalog(); }
});

document.addEventListener('change', e => {
  if (e.target.id === 'import-cat' && state.importMeta) state.importMeta.cat = e.target.value;
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModals();
  if (e.key === 'Enter' && e.target.id === 'import-url') { e.preventDefault(); importFromUrl(); }
});

// mobile: after the tab is backgrounded and restored, re-render from in-memory state
// (the IndexedDB connection is reopened lazily by dbTxn) so the UI can't get stuck.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !state.generating) renderAll();
});

$('#file-input').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) await handleFiles(files);
});

/* ============================== init ============================== */

(async function init() {
  try {
    [state.photos, state.items, state.looks, state.catalog] = await Promise.all([dbAll('photos'), dbAll('items'), dbAll('looks'), dbAll('catalog')]);
    state.photos.sort((a, b) => a.createdAt - b.createdAt);
    state.items.sort((a, b) => a.createdAt - b.createdAt);
    state.looks.sort((a, b) => b.createdAt - a.createdAt);
    state.catalog.sort((a, b) => a.createdAt - b.createdAt);
    if (!state.photos.some(p => p.id === state.activePhotoId)) {
      state.activePhotoId = state.photos[0]?.id || null;
    }
  } catch (e) {
    console.error('FitCheck: IndexedDB unavailable', e);
    toast('Storage unavailable — uploads won\'t persist. Are you in a private window?', 'err');
  }
  renderAll();
  if (syncEnabled()) syncNow(true);   // pull the library (and flush local) on load
})();
