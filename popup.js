const API = "https://api.iconify.design";
const STORAGE_KEY = "open-icon-picker:sources";
const PACK_KEY = "open-icon-picker:pack";

const i18n =
  (globalThis.browser && globalThis.browser.i18n) ||
  (globalThis.chrome && globalThis.chrome.i18n) ||
  null;

const FALLBACK = {
  searchPlaceholder: "Search icons (home, arrow, user...)",
  filterPlaceholder: "Filter collections...",
  clear: "Clear",
  allCollections: "All collections",
  noMatches: "No matches",
  emptyHint: "Type to search 200,000+ icons.",
  searching: "Searching...",
  loadingIcons: "Loading icons...",
  noResults: "No results.",
  networkError: "Network error",
  error: "Error",
  pngError: "PNG error",
  iconOne: "icon",
  iconsMany: "icons",
  inWord: "in",
  scopeAll: "all collections",
  sourceOne: "source",
  sourcesMany: "sources",
  addSource: "Add source",
  remove: "Remove",
  downloadSvg: "Download SVG",
  copyPng: "Copy as PNG",
  addToPack: "Add to pack",
  removeFromPack: "Remove from pack",
  inPack: "in pack",
  downloadZip: "Download ZIP",
  packPreparing: "Preparing pack...",
  packDownloaded: "Pack downloaded",
  packError: "Could not build the pack",
  svgCopied: "SVG copied",
  svgDownloaded: "SVG downloaded",
  pngCopied: "PNG copied",
  hint: "Arrows navigate \u00b7 Enter copy SVG \u00b7 d download \u00b7 p PNG \u00b7 a pack \u00b7 / search",
};

function t(key) {
  return (i18n && i18n.getMessage(key)) || FALLBACK[key] || key;
}

function localize() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  const lang = (i18n && i18n.getUILanguage && i18n.getUILanguage()) || navigator.language || "en";
  document.documentElement.lang = lang.slice(0, 2);
}

const qEl = document.getElementById("q");
const sourcesEl = document.getElementById("sources");
const pickerEl = document.getElementById("picker");
const pickFilterEl = document.getElementById("pickFilter");
const pickListEl = document.getElementById("pickList");
const clearBtn = document.getElementById("clearSources");
const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const packEl = document.getElementById("pack");
const packCountEl = document.getElementById("packCount");
const packDownloadEl = document.getElementById("packDownload");
const packClearEl = document.getElementById("packClear");
const toastEl = document.getElementById("toast");

let selected = loadList(STORAGE_KEY);
let pack = loadList(PACK_KEY);
let collectionNames = {};
let allCollections = null;
let icons = [];
let iconData = new Map();
let toastTimer = null;
let searchTimer = null;
let reqId = 0;
let activeIndex = 0;

function loadList(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function splitName(name) {
  const i = name.indexOf(":");
  return [name.slice(0, i), name.slice(i + 1)];
}

function iconUrl(name) {
  const [prefix, icon] = splitName(name);
  return `${API}/${prefix}/${icon}.svg`;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 1400);
}

function renderSources() {
  sourcesEl.innerHTML = "";
  if (!selected.length) {
    const empty = document.createElement("span");
    empty.className = "pill pill-empty";
    empty.textContent = t("allCollections");
    sourcesEl.appendChild(empty);
  } else {
    for (const prefix of selected) {
      const pill = document.createElement("span");
      pill.className = "pill";

      const name = document.createElement("span");
      name.className = "pill-name";
      name.textContent = collectionNames[prefix] || prefix;
      name.title = prefix;

      const x = document.createElement("button");
      x.className = "pill-x";
      x.dataset.prefix = prefix;
      x.title = t("remove");
      x.textContent = "\u00d7";

      pill.append(name, x);
      sourcesEl.appendChild(pill);
    }
  }

  const add = document.createElement("button");
  add.id = "addSource";
  add.className = "add";
  add.title = t("addSource");
  add.textContent = "+";
  sourcesEl.appendChild(add);
}

function renderPickList(filterText) {
  if (!allCollections) return;
  const q = (filterText || "").trim().toLowerCase();
  pickListEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const [prefix, meta] of allCollections) {
    const name = meta.name || prefix;
    if (q && !`${name} ${prefix}`.toLowerCase().includes(q)) continue;
    const on = selected.includes(prefix);

    const item = document.createElement("button");
    item.className = `pick-item${on ? " on" : ""}`;
    item.dataset.prefix = prefix;

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = name;

    const metaEl = document.createElement("span");
    metaEl.className = "meta";
    metaEl.textContent = on ? `\u2713 ${prefix}` : prefix;

    item.append(label, metaEl);
    frag.appendChild(item);
  }
  if (!frag.childNodes.length) {
    const empty = document.createElement("div");
    empty.className = "pick-empty";
    empty.textContent = t("noMatches");
    frag.appendChild(empty);
  }
  pickListEl.appendChild(frag);
}

async function loadCollections() {
  try {
    const res = await fetch(`${API}/collections`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allCollections = Object.entries(data).sort((a, b) =>
      (a[1].name || a[0]).localeCompare(b[1].name || b[0])
    );
    collectionNames = {};
    for (const [prefix, meta] of allCollections) collectionNames[prefix] = meta.name || prefix;
    renderSources();
    if (!pickerEl.hidden) renderPickList(pickFilterEl.value);
  } catch {
    /* ignore */
  }
}

function openPicker() {
  pickerEl.hidden = false;
  renderPickList(pickFilterEl.value);
  pickFilterEl.focus();
}

function closePicker() {
  pickerEl.hidden = true;
  pickFilterEl.value = "";
}

function toggleSource(prefix) {
  const i = selected.indexOf(prefix);
  if (i === -1) selected.push(prefix);
  else selected.splice(i, 1);
  saveList(STORAGE_KEY, selected);
  renderSources();
  renderPickList(pickFilterEl.value);
  runSearch();
}

function renderPack() {
  packEl.hidden = !pack.length;
  const word = pack.length === 1 ? t("iconOne") : t("iconsMany");
  packCountEl.textContent = `${pack.length} ${word} ${t("inPack")}`;
}

function isInPack(name) {
  return pack.includes(name);
}

function togglePack(name) {
  const i = pack.indexOf(name);
  if (i === -1) pack.push(name);
  else pack.splice(i, 1);
  saveList(PACK_KEY, pack);
  renderPack();
  updatePackBadges();
}

function updatePackBadges() {
  gridEl.querySelectorAll(".tile").forEach((tile) => {
    const on = isInPack(tile.dataset.name);
    tile.classList.toggle("in-pack", on);
    const btn = tile.querySelector('.mini[data-act="pack"]');
    if (btn) {
      btn.textContent = on ? "\u2713" : "+";
      btn.title = on ? t("removeFromPack") : t("addToPack");
    }
  });
}

function makeSvg(info) {
  const left = info.left || 0;
  const top = info.top || 0;
  const w = info.width || 24;
  const h = info.height || 24;
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${w} ${h}">${info.body}</svg>`;
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const el = document.importNode(doc.documentElement, true);
  el.setAttribute("width", "34");
  el.setAttribute("height", "34");
  el.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return el;
}

async function loadIconData(names) {
  const byPrefix = new Map();
  for (const name of names) {
    const [prefix, icon] = splitName(name);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(icon);
  }
  const groups = await Promise.all(
    [...byPrefix].map(async ([prefix, list]) => {
      const res = await fetch(`${API}/${prefix}.json?icons=${list.map(encodeURIComponent).join(",")}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const defW = data.width;
      const defH = data.height;
      const defLeft = data.left || 0;
      const defTop = data.top || 0;
      const iconsObj = data.icons || {};
      const aliases = data.aliases || {};
      const pairs = [];
      for (const [icon, info] of Object.entries(iconsObj)) {
        pairs.push([
          `${prefix}:${icon}`,
          {
            body: info.body,
            width: info.width || defW,
            height: info.height || defH,
            left: info.left != null ? info.left : defLeft,
            top: info.top != null ? info.top : defTop,
          },
        ]);
      }
      for (const [icon, alias] of Object.entries(aliases)) {
        const parent = iconsObj[alias.parent];
        if (!parent) continue;
        pairs.push([
          `${prefix}:${icon}`,
          {
            body: parent.body,
            width: parent.width || defW,
            height: parent.height || defH,
            left: parent.left != null ? parent.left : defLeft,
            top: parent.top != null ? parent.top : defTop,
          },
        ]);
      }
      return pairs;
    })
  );
  const map = new Map();
  for (const group of groups) for (const pair of group) map.set(pair[0], pair[1]);
  return map;
}

function render() {
  gridEl.innerHTML = "";
  if (!icons.length) {
    statusEl.textContent = t("noResults");
    return;
  }
  const scope = selected.length
    ? `${selected.length} ${selected.length === 1 ? t("sourceOne") : t("sourcesMany")}`
    : t("scopeAll");
  const word = icons.length === 1 ? t("iconOne") : t("iconsMany");
  statusEl.textContent = `${icons.length} ${word} ${t("inWord")} ${scope}`;
  const frag = document.createDocumentFragment();
  let index = 0;
  for (const name of icons) {
    const info = iconData.get(name);
    const tile = document.createElement("div");
    tile.className = `tile${isInPack(name) ? " in-pack" : ""}`;
    tile.dataset.name = name;
    tile.title = name;
    tile.tabIndex = index === 0 ? 0 : -1;
    if (info) tile.appendChild(makeSvg(info));

    const actions = document.createElement("span");
    actions.className = "actions";

    const dl = document.createElement("button");
    dl.className = "mini";
    dl.dataset.act = "download";
    dl.title = t("downloadSvg");
    dl.textContent = "\u2193";
    actions.appendChild(dl);

    const png = document.createElement("button");
    png.className = "mini";
    png.dataset.act = "png";
    png.title = t("copyPng");
    png.textContent = "PNG";
    actions.appendChild(png);

    const add = document.createElement("button");
    add.className = "mini";
    add.dataset.act = "pack";
    add.title = isInPack(name) ? t("removeFromPack") : t("addToPack");
    add.textContent = isInPack(name) ? "\u2713" : "+";
    actions.appendChild(add);

    tile.appendChild(actions);
    frag.appendChild(tile);
    index++;
  }
  gridEl.appendChild(frag);
  activeIndex = 0;
}

function tiles() {
  return Array.from(gridEl.querySelectorAll(".tile"));
}

function columnCount() {
  const template = getComputedStyle(gridEl).gridTemplateColumns;
  const count = template.split(" ").filter(Boolean).length;
  return count > 0 ? count : 1;
}

function setActive(index, focus) {
  const list = tiles();
  if (!list.length) return;
  activeIndex = Math.max(0, Math.min(index, list.length - 1));
  list.forEach((el, i) => {
    el.tabIndex = i === activeIndex ? 0 : -1;
  });
  if (focus) {
    list[activeIndex].focus();
    list[activeIndex].scrollIntoView({ block: "nearest" });
  }
}

async function fetchSvg(name) {
  const res = await fetch(`${iconUrl(name)}?color=%23000000`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function runSearch() {
  const query = qEl.value.trim();
  const token = ++reqId;
  if (!query) {
    icons = [];
    iconData = new Map();
    gridEl.innerHTML = "";
    statusEl.textContent = t("emptyHint");
    return;
  }
  statusEl.textContent = t("searching");
  try {
    const params = new URLSearchParams({ query, limit: "160" });
    if (selected.length) params.set("prefixes", selected.join(","));
    const res = await fetch(`${API}/search?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (token !== reqId) return;
    icons = data.icons || [];
    statusEl.textContent = t("loadingIcons");
    const map = await loadIconData(icons);
    if (token !== reqId) return;
    iconData = map;
    render();
  } catch (err) {
    if (token !== reqId) return;
    statusEl.textContent = `${t("networkError")}: ${err.message}`;
  }
}

async function copySvg(name) {
  try {
    const svg = await fetchSvg(name);
    await navigator.clipboard.writeText(svg);
    toast(t("svgCopied"));
  } catch (err) {
    toast(`${t("error")}: ${err.message}`);
  }
}

async function downloadSvg(name) {
  try {
    const svg = await fetchSvg(name);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(":", "-")}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(t("svgDownloaded"));
  } catch (err) {
    toast(`${t("error")}: ${err.message}`);
  }
}

async function copyPng(name) {
  try {
    const svg = await fetchSvg(name);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, size, size);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(t("pngCopied"));
  } catch (err) {
    toast(`${t("pngError")}: ${err.message}`);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  let centralSize = 0;
  for (const part of central) centralSize += part.length;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true);

  const all = [...parts, ...central, new Uint8Array(eocd.buffer)];
  let total = 0;
  for (const part of all) total += part.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of all) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function downloadPack() {
  if (!pack.length) return;
  toast(t("packPreparing"));
  try {
    const entries = (
      await mapLimit(pack, 8, async (name) => {
        try {
          const svg = await fetchSvg(name);
          return { name: `${name.replace(":", "-")}.svg`, data: new TextEncoder().encode(svg) };
        } catch {
          return null;
        }
      })
    ).filter(Boolean);
    if (!entries.length) throw new Error("empty");
    const blob = new Blob([makeZip(entries)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `icon-pack-${entries.length}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(t("packDownloaded"));
  } catch (err) {
    toast(t("packError"));
  }
}

sourcesEl.addEventListener("click", (event) => {
  const x = event.target.closest(".pill-x");
  if (x) {
    toggleSource(x.dataset.prefix);
    return;
  }
  if (event.target.closest("#addSource")) {
    if (pickerEl.hidden) openPicker();
    else closePicker();
  }
});

pickListEl.addEventListener("click", (event) => {
  const item = event.target.closest(".pick-item");
  if (item) toggleSource(item.dataset.prefix);
});

pickFilterEl.addEventListener("input", () => renderPickList(pickFilterEl.value));

clearBtn.addEventListener("click", () => {
  selected = [];
  saveList(STORAGE_KEY, selected);
  renderSources();
  renderPickList(pickFilterEl.value);
  runSearch();
});

packDownloadEl.addEventListener("click", downloadPack);

packClearEl.addEventListener("click", () => {
  pack = [];
  saveList(PACK_KEY, pack);
  renderPack();
  updatePackBadges();
});

gridEl.addEventListener("focusin", (event) => {
  const tile = event.target.closest(".tile");
  if (tile) activeIndex = tiles().indexOf(tile);
});

gridEl.addEventListener("click", (event) => {
  const mini = event.target.closest(".mini");
  const tile = event.target.closest(".tile");
  if (!tile) return;
  const name = tile.dataset.name;
  if (mini) {
    if (mini.dataset.act === "download") downloadSvg(name);
    else if (mini.dataset.act === "png") copyPng(name);
    else if (mini.dataset.act === "pack") togglePack(name);
    return;
  }
  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    togglePack(name);
    return;
  }
  copySvg(name);
});

gridEl.addEventListener("keydown", (event) => {
  const list = tiles();
  if (!list.length) return;
  const last = list.length - 1;
  const cols = columnCount();
  const tile = event.target.closest(".tile");
  const name = tile ? tile.dataset.name : null;
  switch (event.key) {
    case "ArrowRight":
      setActive(activeIndex + 1, true);
      break;
    case "ArrowLeft":
      setActive(activeIndex - 1, true);
      break;
    case "ArrowDown":
      setActive(activeIndex + cols, true);
      break;
    case "ArrowUp":
      setActive(activeIndex - cols, true);
      break;
    case "PageDown":
      setActive(activeIndex + cols * 4, true);
      break;
    case "PageUp":
      setActive(activeIndex - cols * 4, true);
      break;
    case "Home":
      setActive(0, true);
      break;
    case "End":
      setActive(last, true);
      break;
    case "Enter":
    case " ":
      if (name) copySvg(name);
      break;
    case "a":
    case "A":
      if (name) togglePack(name);
      break;
    case "d":
    case "D":
      if (name) downloadSvg(name);
      break;
    case "p":
    case "P":
      if (name) copyPng(name);
      break;
    case "Escape":
      qEl.focus();
      break;
    default:
      return;
  }
  event.preventDefault();
});

qEl.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});

qEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    clearTimeout(searchTimer);
    runSearch();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    setActive(0, true);
  } else if (event.key === "Escape") {
    qEl.value = "";
    clearTimeout(searchTimer);
    runSearch();
  }
});

document.addEventListener("click", (event) => {
  if (pickerEl.hidden) return;
  if (pickerEl.contains(event.target) || sourcesEl.contains(event.target)) return;
  closePicker();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !pickerEl.hidden) {
    closePicker();
    return;
  }
  const active = document.activeElement;
  const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
  if (event.key === "/" && !typing) {
    event.preventDefault();
    qEl.focus();
  }
});

localize();
renderSources();
renderPack();
loadCollections();
qEl.focus();
