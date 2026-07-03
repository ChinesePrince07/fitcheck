/* FitCheck — virtual try-on. Vanilla JS, zero deps.
   Data: IndexedDB (photos / items / looks), settings in localStorage.
   Generation: swappable provider module (Gemini "Nano Banana" family for now). */

'use strict';

/* ============================== config ============================== */

const CATS = [
  { key: 'wholeset', label: 'Whole set',      icon: '🧍', verb: 'Dress the person in the COMPLETE outfit shown in this image — every garment, layer and accessory visible in it, reproduced exactly. If another person is shown wearing it, copy ONLY their clothing and accessories, never their face, body or identity' },
  { key: 'top',      label: 'Tops',           icon: '👕', verb: 'Replace their current top/shirt with this exact garment' },
  { key: 'bottom',   label: 'Bottoms',        icon: '👖', verb: 'Replace their current pants/bottoms with this exact garment' },
  { key: 'outer',    label: 'Outerwear',      icon: '🧥', verb: 'Layer this exact jacket/outerwear naturally over their top' },
  { key: 'hat',      label: 'Hats & Beanies', icon: '🧢', verb: 'Place this exact hat/beanie naturally on their head' },
  { key: 'shoes',    label: 'Shoes',          icon: '👟', verb: 'Replace their footwear with this exact pair of shoes' },
  { key: 'necklace', label: 'Necklaces',      icon: '📿', verb: 'Add this exact necklace around their neck, resting naturally' },
  { key: 'watch',    label: 'Watches',        icon: '⌚', verb: 'Place this exact watch on their wrist' },
  { key: 'bracelet', label: 'Bracelets',      icon: '🔗', verb: 'Add this exact bracelet on their wrist' },
  { key: 'other',    label: 'Other',          icon: '✨', verb: 'Incorporate this exact item into the outfit naturally' },
  { key: 'hair',     label: 'Hair',           icon: '💇', verb: 'Restyle the subject\'s hair to exactly match the hairstyle and hair colour in this reference image — take ONLY the hair from it, never its face or the person shown, keeping the subject\'s own face and identity unchanged' },
];
const catByKey = k => CATS.find(c => c.key === k) || CATS[CATS.length - 1];

// Hairstyle try-on: pick a preset (text) OR upload a reference photo of a cut. Rendered in its own section.
const HAIR_PRESETS = [
  { id: 'buzz',     label: 'Buzz cut',       desc: 'a very short, even buzz cut' },
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

const MODEL_NAMES = {
  'gemini-3.1-flash-image': 'Nano Banana 2',
  'gemini-3-pro-image': 'Nano Banana Pro',
};
// Always use the best model + highest resolution available (no in-app selection).
const BEST_MODEL = 'gemini-3-pro-image';   // Nano Banana Pro — strongest identity preservation for try-on
const BEST_IMAGE_SIZE = '4K';              // highest resolution Pro supports (verified 3584×4800)
const DEFAULT_SETTINGS = {
  provider: 'gemini',
  apiKey: '',
};

const PERSON_MAX_DIM = 2048;   // keep the face at high resolution to help identity preservation
const ITEM_MAX_DIM = 1280;

/* ============================== state ============================== */

const state = {
  photos: [],
  items: [],
  looks: [],
  activePhotoId: localStorage.getItem('fitcheck.activePhoto') || null,
  sel: new Map(),          // category key -> item id
  hairPreset: null,        // hairstyle preset id (mutually exclusive with a selected hair reference image)
  notes: '',
  generating: false,
  abort: null,
  uploadCat: null,         // null => uploading a photo of you
  currentLookId: null,     // look open in viewer
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

/* ============================== IndexedDB ============================== */

let _db;
function db() {
  _db ??= new Promise((res, rej) => {
    const req = indexedDB.open('fitcheck', 1);
    req.onupgradeneeded = () => {
      for (const store of ['photos', 'items', 'looks']) {
        if (!req.result.objectStoreNames.contains(store)) {
          req.result.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return _db;
}
async function dbPut(store, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, 'readwrite');
    t.objectStore(store).put(val);
    t.oncomplete = () => res(val);
    t.onerror = () => rej(t.error);
  });
}
async function dbDel(store, id) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, 'readwrite');
    t.objectStore(store).delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
async function dbAll(store) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

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

async function fileToImage(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    // fallback for formats createImageBitmap rejects
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

function buildPrompt(items, notes, hairPreset) {
  const changes = items.map((it, i) => `- Image ${i + 2} (${catByKey(it.cat).label.toLowerCase()}): ${catByKey(it.cat).verb}.`);
  const preset = hairPreset ? hairPresetById(hairPreset) : null;
  if (preset) changes.push(`- Hairstyle: restyle the subject's hair to ${preset.desc}, adapting it naturally to their head, while keeping their face unchanged.`);
  const hairChanging = preset || items.some(it => it.cat === 'hair');

  const locked = ['face', 'facial features', 'bone structure', 'jawline', 'eyes', 'nose', 'mouth',
    'skin tone and complexion', ...(hairChanging ? [] : ['hair']), 'body shape', 'height and proportions',
    'exact pose', 'camera angle', 'background'].join(', ');

  let p = `You are performing a precise virtual try-on photo edit. Image 1 is a real photograph of one specific real person — the subject.

CRITICAL — preserve the subject's identity EXACTLY. The person in the result must be unmistakably the SAME person as in Image 1: keep their ${locked} 100% identical to Image 1. Do NOT beautify, slim, smooth, restyle, age or de-age the person, and do NOT change their surroundings. This identity match matters more than anything else in the image.

Change ONLY the following, nothing else:

${changes.join('\n')}

Each new garment or accessory must keep its exact design, colour, pattern, texture and material from its reference image. Anything not listed above stays exactly as in Image 1. Blend every change in photorealistically — natural fit, draping, wrinkles, contact shadows and lighting consistent with Image 1. Output only the final edited photograph of the subject.`;
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
    async generate({ apiKey, model, imageSize, person, items, notes, hairPreset, signal }) {
      const parts = [
        { text: buildPrompt(items, notes, hairPreset) },
        dataUrlToInlinePart(person.dataUrl),
        ...items.map(it => dataUrlToInlinePart(it.dataUrl)),
      ];
      const makeBody = withImageConfig => JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(withImageConfig ? { imageConfig: { aspectRatio: nearestAspect(person.w, person.h), imageSize } } : {}),
        },
      });
      const call = body => fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body,
        signal,
      });

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
    const selId = state.sel.get(cat.key);
    const picked = items.find(i => i.id === selId);
    return `<div class="cat" data-cat="${cat.key}">
      <div class="cat-head">
        <h3>${cat.icon} ${cat.label}</h3>
        <span class="count">${items.length ? items.length + ' item' + (items.length > 1 ? 's' : '') : ''}</span>
        ${picked ? `<span class="picked">wearing: ${esc(picked.name || 'selected')}</span>` : ''}
      </div>
      <div class="grid">
        ${items.map(i => tileHtml(i, { selected: i.id === selId, kind: 'item' })).join('')}
        <button class="tile add" data-action="add-item" data-cat="${cat.key}"><span class="plus">＋</span><span>Add ${cat.label.toLowerCase()}</span></button>
      </div>
    </div>`;
  }).join('');
}

function renderHair() {
  const imgs = state.items.filter(i => i.cat === 'hair');
  const selImg = state.sel.get('hair');
  $('#hair-presets').innerHTML = HAIR_PRESETS.map(p =>
    `<button class="hair-preset ${state.hairPreset === p.id ? 'selected' : ''}" data-action="select-hairpreset" data-preset="${p.id}">${esc(p.label)}</button>`
  ).join('');
  $('#hair-grid').innerHTML =
    imgs.map(i => tileHtml(i, { selected: i.id === selImg, kind: 'item' })).join('') +
    `<button class="tile add" data-action="add-item" data-cat="hair"><span class="plus">＋</span><span>Upload a cut</span></button>`;
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
  const selItems = [...state.sel.entries()]
    .map(([cat, id]) => state.items.find(i => i.id === id))
    .filter(Boolean);
  const chipEls = selItems.map(i => `<span class="chip">${catByKey(i.cat).icon} ${esc(i.name || catByKey(i.cat).label)} <span class="x" data-action="unselect-chip" data-cat="${i.cat}">✕</span></span>`);
  if (state.hairPreset) {
    const p = hairPresetById(state.hairPreset);
    chipEls.unshift(`<span class="chip">💇 ${esc(p?.label || 'Hairstyle')} <span class="x" data-action="clear-hairpreset">✕</span></span>`);
  }
  const chips = chipEls.length
    ? chipEls.join('')
    : `<span class="chip placeholder">nothing selected yet — pick items or a hairstyle</span>`;
  $('#outfit-bar').innerHTML = `<div class="outfit-inner">
    <div class="chips">${chips}</div>
    <input class="notes" id="notes-input" placeholder="style notes, e.g. tuck the shirt in" value="${esc(state.notes)}">
    <span class="model-badge" title="Always generates at the best quality available">✨ Nano Banana Pro · 4K</span>
    ${state.generating
      ? `<span class="gen-status"><span class="spinner"></span> Rendering at 4K on Nano Banana Pro… ~30–60s</span>
         <button class="btn" data-action="cancel-generate">Cancel</button>`
      : `<button class="btn primary" id="generate-btn" data-action="generate">✨ Generate fit</button>`}
  </div>`;
}

function renderBanner() {
  $('#key-banner').classList.toggle('hidden', !!getSettings().apiKey);
}

function renderAll() {
  renderPhotos();
  renderCats();
  renderHair();
  renderLooks();
  renderOutfitBar();
  renderBanner();
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
    (look.notes ? `<span class="chip">📝 ${esc(look.notes)}</span>` : '') +
    `<span class="when">${new Date(look.createdAt).toLocaleString()} · ${esc(MODEL_NAMES[look.model] || look.model)} · ${esc(look.size || '')}${look.ms ? ' · ' + Math.round(look.ms / 1000) + 's' : ''}</span>`;
  $('#viewer-modal').classList.add('open');
}

function openSettings() {
  const s = getSettings();
  $('#set-key').value = s.apiKey;
  $('#test-key-result').textContent = '';
  $('#test-key-result').className = 'test-result';
  $('#settings-modal').classList.add('open');
}

function closeModals() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  state.currentLookId = null;
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
        const name = (file.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
        const rec = { id: uid(), cat, dataUrl, name, createdAt: Date.now() };
        await dbPut('items', rec);
        state.items.push(rec);
      }
      ok++;
    } catch (e) {
      console.warn('FitCheck upload failed:', e);
      toast(`Couldn't read "${file.name}" — HEIC isn't supported here, try JPEG/PNG.`, 'err');
    }
  }
  if (ok) toast(cat === null ? `Added ${ok} photo${ok > 1 ? 's' : ''} of you` : `Added ${ok} item${ok > 1 ? 's' : ''}`);
  renderAll();
}

async function generate() {
  if (state.generating) return;
  const s = getSettings();
  if (!s.apiKey) { openSettings(); toast('Add your Gemini API key first (billing enabled — image models have no free tier).', 'err'); return; }
  const person = state.photos.find(p => p.id === state.activePhotoId);
  if (!person) { toast('Add a photo of yourself first (section 1).', 'err'); return; }
  const items = [...state.sel.entries()].map(([, id]) => state.items.find(i => i.id === id)).filter(Boolean);
  if (!items.length && !state.hairPreset) { toast('Pick at least one item or a hairstyle to try on.', 'err'); return; }

  state.generating = true;
  state.abort = new AbortController();
  renderOutfitBar();
  const t0 = Date.now();
  try {
    const out = await PROVIDERS[s.provider].generate({
      apiKey: s.apiKey, model: BEST_MODEL, imageSize: BEST_IMAGE_SIZE,
      person, items, notes: state.notes, hairPreset: state.hairPreset, signal: state.abort.signal,
    });
    const look = {
      id: uid(), dataUrl: out.dataUrl,
      items: items.map(i => ({ id: i.id, cat: i.cat, name: i.name })),
      hairPreset: state.hairPreset, notes: state.notes, model: BEST_MODEL, size: BEST_IMAGE_SIZE,
      ms: Date.now() - t0, createdAt: Date.now(),
    };
    await dbPut('looks', look);
    state.looks.unshift(look);
    renderLooks();
    openViewer(look.id);
  } catch (e) {
    if (e.name === 'AbortError') toast('Generation cancelled.');
    else { console.error('FitCheck generate failed:', e); toast(e.message || 'Generation failed.', 'err'); }
  } finally {
    state.generating = false;
    state.abort = null;
    renderOutfitBar();
  }
}

function regenerateFromLook(lookId) {
  const look = state.looks.find(l => l.id === lookId);
  if (!look) return;
  state.sel.clear();
  let missing = 0;
  for (const it of look.items) {
    if (state.items.some(i => i.id === it.id)) state.sel.set(it.cat, it.id);
    else missing++;
  }
  state.hairPreset = look.hairPreset || null;
  state.notes = look.notes || '';
  closeModals();
  renderAll();
  if (!state.sel.size && !state.hairPreset) { toast('The items from this look were deleted from your wardrobe — can\'t regenerate.', 'err'); return; }
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
      if (state.sel.get(item.cat) === id) state.sel.delete(item.cat);
      else { state.sel.set(item.cat, id); if (item.cat === 'hair') state.hairPreset = null; }
      renderCats(); renderHair(); renderOutfitBar();
      break;
    }
    case 'unselect-chip': state.sel.delete(cat); renderCats(); renderHair(); renderOutfitBar(); break;
    case 'select-hairpreset': {
      const p = el.dataset.preset;
      state.hairPreset = state.hairPreset === p ? null : p;
      if (state.hairPreset) state.sel.delete('hair'); // preset & reference image are mutually exclusive
      renderHair(); renderOutfitBar();
      break;
    }
    case 'clear-hairpreset': state.hairPreset = null; renderHair(); renderOutfitBar(); break;
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
        if (item && state.sel.get(item.cat) === id) state.sel.delete(item.cat);
        renderCats(); renderHair(); renderOutfitBar();
      });
      break;
    case 'generate': generate(); break;
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
      saveSettings(s);
      closeModals();
      renderOutfitBar(); renderBanner();
      toast('Settings saved.');
      break;
    }
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'notes-input') state.notes = e.target.value;
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModals();
});

$('#file-input').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) await handleFiles(files);
});

/* ============================== init ============================== */

(async function init() {
  try {
    [state.photos, state.items, state.looks] = await Promise.all([dbAll('photos'), dbAll('items'), dbAll('looks')]);
    state.photos.sort((a, b) => a.createdAt - b.createdAt);
    state.items.sort((a, b) => a.createdAt - b.createdAt);
    state.looks.sort((a, b) => b.createdAt - a.createdAt);
    if (!state.photos.some(p => p.id === state.activePhotoId)) {
      state.activePhotoId = state.photos[0]?.id || null;
    }
  } catch (e) {
    console.error('FitCheck: IndexedDB unavailable', e);
    toast('Storage unavailable — uploads won\'t persist. Are you in a private window?', 'err');
  }
  renderAll();
})();
