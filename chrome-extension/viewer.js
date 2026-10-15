const $ = id => document.getElementById(id);
const pagesEl = $('pages');

let doc = null; // { buf, name, pages: [{ ifd, w, h, el, canvas }] }
let zoom = 'fit-width'; // 'fit-width' | 'fit-page' | number (1 = 100%)
let rotation = 0;
let current = 0;

// UTIF's bundled JPEG decoder always treats 3-channel JPEG data as YCbCr.
// TIFFs with JPEG compression (259=7) but RGB photometric (262=2) store plain
// RGB, so skip the colour conversion for those. `w` is the decoder's
// "apply colour transform" check in the bundled utif@3.1.0.
let rawRgbJpeg = false;
const jpegProto = UTIF.JpegDecoder && UTIF.JpegDecoder.prototype;
if (jpegProto && typeof jpegProto.w === 'function') {
  const applyTransform = jpegProto.w;
  jpegProto.w = function () {
    return rawRgbJpeg && this.i === 3 && !this.A ? false : applyTransform.call(this);
  };
}

// ---------- loading ----------

function showMessage(html, isError) {
  pagesEl.innerHTML = '<div id="message"></div>';
  const m = $('message');
  m.innerHTML = html;
  m.classList.toggle('error', !!isError);
}

function nameFromUrl(url) {
  try {
    const seg = new URL(url).pathname.split('/').pop();
    return decodeURIComponent(seg) || 'image.tif';
  } catch { return 'image.tif'; }
}

function readLocalFile(url) {
  // fetch() doesn't support file://, but XHR does from an extension page.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => (xhr.response && xhr.response.byteLength ? resolve(xhr.response) : reject(new Error('file is empty or unreadable')));
    xhr.onerror = () => reject(new Error('could not read the file'));
    xhr.send();
  });
}

async function loadFromUrl(url) {
  const name = nameFromUrl(url);
  showMessage('<p>Loading ' + escapeHtml(name) + '…</p>');
  try {
    let buf;
    if (url.startsWith('file:')) {
      const allowed = await new Promise(r => chrome.extension.isAllowedFileSchemeAccess(r));
      if (!allowed) {
        showMessage('<p><b>Chrome needs permission to open local files.</b></p>' +
          '<p>Go to <b>chrome://extensions</b> → TIFF Viewer → <b>Details</b>, and switch on<br><b>Allow access to file URLs</b>. Then reload this tab.</p>' +
          '<p class="hint">Or click <b>Open…</b> above to pick the file.</p>', true);
        return;
      }
      buf = await readLocalFile(url);
    } else {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('server returned ' + res.status + ' ' + res.statusText);
      buf = await res.arrayBuffer();
    }
    openDoc(buf, name, url);
  } catch (e) {
    showMessage('<p><b>Couldn’t load ' + escapeHtml(name) + '</b></p><p>' + escapeHtml(e.message || String(e)) + '</p>', true);
  }
}

async function loadFromFile(file) {
  showMessage('<p>Loading ' + escapeHtml(file.name) + '…</p>');
  openDoc(await file.arrayBuffer(), file.name, null);
}

function openDoc(buf, name, url) {
  let ifds;
  try {
    ifds = UTIF.decode(buf).filter(ifd => !(ifd.t254 && (ifd.t254[0] & 1))); // skip thumbnails
  } catch (e) {
    showMessage('<p><b>' + escapeHtml(name) + ' isn’t a TIFF Chrome can read.</b></p><p>' + escapeHtml(e.message || String(e)) + '</p>', true);
    return;
  }
  ifds = ifds.filter(ifd => ifd.t256 && ifd.t257);
  if (!ifds.length) {
    showMessage('<p><b>No pages found in ' + escapeHtml(name) + '.</b></p>', true);
    return;
  }

  document.title = name + ' – TIFF Viewer';
  $('name').textContent = name;
  $('name').title = url || name;
  if (url) history.replaceState(null, '', '#' + url);

  pagesEl.innerHTML = '';
  doc = { buf, name, pages: [] };
  rotation = 0;
  current = 0;
  for (const ifd of ifds) {
    const el = document.createElement('div');
    el.className = 'page';
    el.innerHTML = '<div class="label">Loading…</div>';
    pagesEl.appendChild(el);
    doc.pages.push({ ifd, w: ifd.t256[0], h: ifd.t257[0], el, canvas: null });
  }
  doc.pages.forEach(p => observer.observe(p.el));
  ['prev', 'next', 'zoomOut', 'zoom', 'zoomIn', 'rotate', 'original', 'pdf'].forEach(id => ($(id).disabled = false));
  layout();
  pagesEl.scrollTop = 0;
  updatePageInfo();
}

// ---------- rendering ----------

function decodePage(page) {
  const { ifd } = page;
  rawRgbJpeg = !!(ifd.t259 && ifd.t259[0] === 7 && ifd.t262 && ifd.t262[0] === 2);
  try { UTIF.decodeImage(doc.buf, ifd); } finally { rawRgbJpeg = false; }
  if (!ifd.data) throw new Error('unsupported TIFF encoding');
  const rgba = UTIF.toRGBA8(ifd);
  ifd.data = null; // the canvas keeps the pixels; free the raw decode
  const c = document.createElement('canvas');
  c.width = page.w;
  c.height = page.h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('page too large for Chrome to display');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, 0, page.w * page.h * 4), page.w, page.h), 0, 0);
  return c;
}

function renderPage(page) {
  if (page.canvas) return page.canvas;
  try {
    page.canvas = decodePage(page);
    page.el.innerHTML = '';
    page.el.appendChild(page.canvas);
    positionCanvas(page);
  } catch (e) {
    page.el.innerHTML = '<div class="label">Can’t display this page: ' + escapeHtml(e.message || String(e)) + '</div>';
  }
  return page.canvas;
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || !doc) continue;
    const page = doc.pages.find(p => p.el === entry.target);
    if (page) setTimeout(() => renderPage(page)); // let the "Loading…" label paint first
  }
}, { root: pagesEl, rootMargin: '100% 0px' });

// ---------- layout / zoom ----------

const sideways = () => rotation % 180 !== 0;

function scaleFor(page) {
  if (typeof zoom === 'number') return zoom;
  const w = sideways() ? page.h : page.w;
  const h = sideways() ? page.w : page.h;
  const availW = pagesEl.clientWidth - 32;
  const availH = pagesEl.clientHeight - 32;
  return zoom === 'fit-page' ? Math.min(availW / w, availH / h) : availW / w;
}

function positionCanvas(page) {
  if (!page.canvas) return;
  const s = page.scale;
  Object.assign(page.canvas.style, {
    position: 'absolute', left: '50%', top: '50%',
    width: page.w * s + 'px', height: page.h * s + 'px',
    transform: 'translate(-50%, -50%) rotate(' + rotation + 'deg)',
  });
}

function layout() {
  if (!doc) return;
  const anchor = doc.pages[current];
  for (const page of doc.pages) {
    page.scale = scaleFor(page);
    const w = (sideways() ? page.h : page.w) * page.scale;
    const h = (sideways() ? page.w : page.h) * page.scale;
    page.el.style.width = w + 'px';
    page.el.style.height = h + 'px';
    positionCanvas(page);
  }
  const sel = $('zoom');
  if (typeof zoom === 'number' && zoom !== 1) {
    sel.options[3].textContent = Math.round(zoom * 100) + '%';
    sel.value = 'custom';
  } else {
    sel.value = String(zoom);
  }
  if (anchor) anchor.el.scrollIntoView({ block: 'start' });
}

function setZoom(z) {
  zoom = z;
  layout();
}

function stepZoom(factor) {
  if (!doc) return;
  const base = doc.pages[current].scale;
  setZoom(Math.min(8, Math.max(0.02, base * factor)));
}

// ---------- page navigation ----------

function updatePageInfo() {
  if (!doc) return;
  const top = pagesEl.scrollTop + 20;
  let idx = 0;
  doc.pages.forEach((p, i) => { if (p.el.offsetTop - pagesEl.offsetTop <= top) idx = i; });
  current = idx;
  $('pageInfo').textContent = (idx + 1) + ' / ' + doc.pages.length;
  $('prev').disabled = idx === 0;
  $('next').disabled = idx === doc.pages.length - 1;
}

function goTo(i) {
  if (!doc) return;
  i = Math.max(0, Math.min(doc.pages.length - 1, i));
  doc.pages[i].el.scrollIntoView({ block: 'start' });
}

// ---------- saving ----------

// TIFF resolution tags: 282/283 = X/Y resolution, 296 = unit (2 inch, 3 cm).
function dpiOf(ifd) {
  const val = t => (ifd[t] ? Number(ifd[t][0]) : 0);
  let x = val('t282'), y = val('t283') || x;
  const unit = ifd.t296 ? ifd.t296[0] : 2;
  if (unit === 3) { x *= 2.54; y *= 2.54; }
  if (unit === 1 || x < 10 || y < 10) return [96, 96];
  return [x, y];
}

function canvasToPng(canvas) {
  return new Promise((res, rej) =>
    canvas.toBlob(b => (b ? b.arrayBuffer().then(res) : rej(new Error('page too large to save'))), 'image/png'));
}

function download(bytes, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

async function savePdf() {
  if (!doc) return;
  const btn = $('pdf');
  btn.disabled = true;
  try {
    const pdf = await PDFLib.PDFDocument.create();
    for (let i = 0; i < doc.pages.length; i++) {
      btn.textContent = 'Saving ' + (i + 1) + '/' + doc.pages.length + '…';
      const page = doc.pages[i];
      const canvas = renderPage(page);
      if (!canvas) throw new Error('page ' + (i + 1) + ' could not be decoded');
      const img = await pdf.embedPng(await canvasToPng(canvas));
      const [dx, dy] = dpiOf(page.ifd);
      const w = page.w / dx * 72, h = page.h / dy * 72;
      const p = pdf.addPage([w, h]);
      p.drawImage(img, { x: 0, y: 0, width: w, height: h });
      if (rotation) p.setRotation(PDFLib.degrees(rotation));
      await new Promise(r => setTimeout(r)); // keep the tab responsive
    }
    pdf.setTitle(doc.name.replace(/\.tiff?$/i, ''));
    pdf.setProducer('TIFF Viewer (Chrome extension)');
    download(await pdf.save(), doc.name.replace(/\.tiff?$/i, '') + '.pdf', 'application/pdf');
  } catch (e) {
    alert('Couldn’t save the PDF: ' + (e.message || e));
  } finally {
    btn.textContent = 'Save as PDF';
    btn.disabled = false;
  }
}

// ---------- wiring ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('open').onclick = () => $('pick').click();
$('pick').onchange = e => { if (e.target.files[0]) loadFromFile(e.target.files[0]); e.target.value = ''; };
$('prev').onclick = () => goTo(current - 1);
$('next').onclick = () => goTo(current + 1);
$('zoomIn').onclick = () => stepZoom(1.25);
$('zoomOut').onclick = () => stepZoom(0.8);
$('zoom').onchange = e => setZoom(e.target.value === '1' ? 1 : e.target.value);
$('rotate').onclick = () => { rotation = (rotation + 90) % 360; layout(); };
$('original').onclick = () => doc && download(doc.buf, doc.name, 'image/tiff');
$('pdf').onclick = savePdf;

pagesEl.addEventListener('scroll', updatePageInfo, { passive: true });
window.addEventListener('resize', () => { if (typeof zoom !== 'number') layout(); });

['dragenter', 'dragover'].forEach(t => window.addEventListener(t, e => { e.preventDefault(); pagesEl.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => window.addEventListener(t, e => { e.preventDefault(); pagesEl.classList.remove('over'); }));
window.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFromFile(f); });

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('pick').click(); }
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); savePdf(); }
  else if (mod) return;
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goTo(current + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(current - 1); }
  else if (e.key === '+' || e.key === '=') stepZoom(1.25);
  else if (e.key === '-') stepZoom(0.8);
  else if (e.key.toLowerCase() === 'r') $('rotate').click();
});

const initial = location.hash.slice(1);
if (initial) loadFromUrl(initial);
