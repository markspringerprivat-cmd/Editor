(() => {
  'use strict';

  const app = document.getElementById('app');
  const editorType = document.body.dataset.editor;
  const VERSION = '72';
  const mediaFileStore = new Map();

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const uid = () => 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isYoutube = (url) => /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i.test(url || '');
  const youtubeId = (url) => {
    const m = String(url || '').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : '';
  };
  const ytEmbed = (url) => {
    const id = youtubeId(url);
    return id ? `https://www.youtube.com/embed/${id}?rel=0` : url;
  };

  function dataUrlFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function minBlockSize(type = 'text') {
    const sizes = {
      choice: { width: 520, height: 260 },
      dragWords: { width: 620, height: 240 },
      dragDrop: { width: 680, height: 380 },
      interactiveVideo: { width: 680, height: 420 },
      video: { width: 620, height: 350 },
      image: { width: 360, height: 240 },
      text: { width: 260, height: 120 },
      link: { width: 240, height: 90 }
    };
    return sizes[type] || { width: 300, height: 140 };
  }

  function defaultStyle(type = 'text') {
    const min = minBlockSize(type);
    return {
      x: 40,
      y: 54,
      width: min.width,
      height: min.height,
      z: 1,
      showBorder: true,
      showShadow: false,
      bgColor: '#ffffff',
      bgTransparent: type === 'text' ? true : false
    };
  }

  function defaultAction(type = 'choice') {
    return {
      id: uid(),
      time: 0,
      type,
      question: 'Neue Frage',
      description: 'Wähle eine Antwort aus.',
      answers: ['Neue Antwort'],
      correct: [0],
      dragText: 'Text mit [Lücke].',
      pairs: [{ item: 'Begriff', target: 'Zielbereich' }],
      overlay: { bg: 'rgba(255,255,255,.88)', textColor: '#111827', border: false, shadow: false }
    };
  }

  function defaultBlock(type = 'text') {
    return {
      id: uid(),
      type,
      richText: type === 'text' ? 'Text eingeben …' : '',
      linkText: 'Link öffnen',
      url: 'https://example.com',
      media: '',
      alt: '',
      question: 'Welche Antwort passt?',
      description: 'Wähle die passende Antwort aus.',
      answers: ['Neue Antwort'],
      correct: [0],
      dragText: 'Eine professionelle Gesprächsführung braucht [Wartezeit] und [Rückmeldung].',
      pairs: [
        { item: 'Beispiel', target: 'Planung' },
        { item: 'Struktur', target: 'Verständnis' }
      ],
      interactions: [],
      style: defaultStyle(type)
    };
  }

  function normalizeBlock(block = {}) {
    const base = defaultBlock(block.type || 'text');
    const out = { ...base, ...block };
    out.style = { ...defaultStyle(out.type), ...(block.style || {}) };
    const min = minBlockSize(out.type);
    out.style.width = Math.max(Number(out.style.width) || min.width, min.width);
    out.style.height = Math.max(Number(out.style.height) || min.height, min.height);
    out.style.showBorder = out.style.showBorder !== false;
    out.style.bgTransparent = out.style.bgTransparent === true;
    out.answers = Array.isArray(out.answers) && out.answers.length ? out.answers.map(String) : base.answers;
    out.correct = Array.isArray(out.correct) ? out.correct.map(Number) : [Number(out.correctIndex) || 0];
    out.pairs = Array.isArray(out.pairs) && out.pairs.length ? out.pairs.map(p => ({ item: String(p.item || ''), target: String(p.target || '') })) : base.pairs;
    out.interactions = Array.isArray(out.interactions) ? out.interactions.map(normalizeAction) : [];
    return out;
  }

  function normalizeAction(a = {}) {
    const base = defaultAction(a.type || 'choice');
    const out = { ...base, ...a };
    out.id = out.id || uid();
    out.time = Number(out.time) || 0;
    out.answers = Array.isArray(out.answers) && out.answers.length ? out.answers.map(String) : base.answers;
    out.correct = Array.isArray(out.correct) ? out.correct.map(Number) : [Number(out.correctIndex) || 0];
    out.pairs = Array.isArray(out.pairs) && out.pairs.length ? out.pairs.map(p => ({ item: String(p.item || ''), target: String(p.target || '') })) : base.pairs;
    out.overlay = { ...(base.overlay || {}), ...(a.overlay || {}) };
    return out;
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function ivOverlayStyle(action = {}) {
    const o = action.overlay || {};
    const bg = 'rgba(255,255,255,.90)';
    const color = '#111827';
    action.overlay = { ...o, bg, textColor: color, border: false, shadow: false };
    return `left:50%;top:50%;width:min(86%,920px);max-height:78%;height:auto;right:auto;bottom:auto;transform:translate(-50%,-50%);background:${bg};color:${color};border:1px solid rgba(255,255,255,.55);box-shadow:0 18px 48px rgba(17,24,39,.18);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:24px;`;
  }

  function defaultPage(n = 1, label = 'Folie') {
    return { id: uid(), title: `${label} ${n}`, blocks: [] };
  }

  function toolbarHtml() {
    return `<div class="format-toolbar">
      <select data-cmd="fontName" title="Schriftart">
        <option value="Inter, system-ui, sans-serif">Aptos / Inter</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="Times New Roman, serif">Times</option><option value="Courier New, monospace">Courier</option>
      </select>
      <select data-font-size title="Schriftgröße"><option>12</option><option>14</option><option selected>16</option><option>18</option><option>20</option><option>24</option><option>28</option><option>32</option></select>
      <button type="button" data-cmd="bold"><b>F</b></button><button type="button" data-cmd="italic"><i>K</i></button><button type="button" data-cmd="underline"><u>U</u></button>
      <button type="button" data-cmd="insertUnorderedList">• Liste</button>
      <button type="button" data-cmd="justifyLeft">Links</button><button type="button" data-cmd="justifyCenter">Mitte</button><button type="button" data-cmd="justifyRight">Rechts</button>
      <label>Schriftfarbe <input type="color" data-cmd="foreColor" value="#111827"></label>
    </div>`;
  }

  let savedRange = null;
  document.addEventListener('selectionchange', () => {
    const s = window.getSelection?.();
    if (!s || !s.rangeCount) return;
    const node = s.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    if (el?.closest?.('.editable-text, .editable-field')) savedRange = s.getRangeAt(0).cloneRange();
  });
  function restoreRange() {
    if (!savedRange) return;
    const s = window.getSelection?.();
    if (!s) return;
    s.removeAllRanges(); s.addRange(savedRange);
  }
  function bindToolbar(root = document) {
    root.querySelectorAll('[data-cmd]').forEach(control => {
      const run = () => {
        restoreRange();
        document.execCommand(control.dataset.cmd, false, control.value || null);
        emitEditableInput();
      };
      control.addEventListener(control.type === 'color' ? 'input' : 'click', run);
      if (control.tagName === 'SELECT') control.addEventListener('change', run);
    });
    root.querySelectorAll('[data-font-size]').forEach(sel => sel.addEventListener('change', () => {
      restoreRange(); document.execCommand('fontSize', false, '7');
      document.querySelectorAll('font[size="7"]').forEach(font => {
        const span = document.createElement('span'); span.style.fontSize = `${sel.value}px`; span.innerHTML = font.innerHTML; font.replaceWith(span);
      });
      emitEditableInput();
    }));
  }


  function richToPlain(html = '') {
    const div = document.createElement('div');
    div.innerHTML = String(html || '');
    return div.textContent || div.innerText || '';
  }

  function currentEditableElement() {
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount) {
      const node = sel.anchorNode;
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      const editable = el?.closest?.('.editable-text, .editable-field, .dtw-text[contenteditable="true"]');
      if (editable) return editable;
    }
    return document.activeElement?.closest?.('.editable-text, .editable-field, .dtw-text[contenteditable="true"]') || null;
  }

  function emitEditableInput() {
    const el = currentEditableElement();
    if (el) el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function requiredBlockSizeFromElement(el, b) {
    const min = minBlockSize(b.type);
    const inner = el.querySelector('.block-inner');
    if (!inner) return min;
    const handleExtra = el.classList.contains('active') ? 18 : 0;
    const neededW = Math.ceil(Math.max(inner.scrollWidth, inner.offsetWidth) + 2);
    const neededH = Math.ceil(Math.max(inner.scrollHeight + handleExtra, inner.offsetHeight + handleExtra) + 2);
    return { width: Math.max(min.width, neededW), height: Math.max(min.height, neededH) };
  }

  function fitBlockElement(el, b, allowGrow = true) {
    if (!el || !b?.style) return;
    const need = requiredBlockSizeFromElement(el, b);
    const w = allowGrow ? Math.max(Number(b.style.width) || 0, need.width) : need.width;
    const h = allowGrow ? Math.max(Number(b.style.height) || 0, need.height) : need.height;
    if (w !== b.style.width || h !== b.style.height) {
      b.style.width = w; b.style.height = h;
      el.style.width = w + 'px'; el.style.height = h + 'px';
    }
  }

  function renderChoiceAnswersEditor(target, prefix = 'block', mode = 'multi') {
    target.answers = Array.isArray(target.answers) && target.answers.length ? target.answers : ['Neue Antwort'];
    const correct = Array.isArray(target.correct) ? target.correct.map(Number) : [0];
    const inputType = mode === 'single' ? 'radio' : 'checkbox';
    return `<div class="answer-editor" data-answer-editor="${prefix}">
      <div class="answer-editor-head"><strong>Antworten</strong><span>Richtige Antwort direkt markieren.</span></div>
      ${target.answers.map((answer, i) => `<div class="answer-card">
        <label class="correct-tile" title="Richtige Antwort"><input type="${inputType}" name="${prefix}-correct-choice" data-${prefix}-answer-correct="${i}" ${correct.includes(i) ? 'checked' : ''}> richtig</label>
        <label class="answer-text-label">Antwort <input data-${prefix}-answer-text="${i}" value="${esc(richToPlain(answer))}" placeholder="Antwort eingeben"></label>
        <button class="answer-remove" type="button" data-${prefix}-answer-remove="${i}" ${target.answers.length <= 1 ? 'disabled' : ''}>×</button>
      </div>`).join('')}
      <button class="btn" type="button" data-${prefix}-answer-add>+ Neue Antwort hinzufügen</button>
    </div>`;
  }

  function mediaHtml(src, cls = 'media-video') {
    if (!src) return '<div class="empty-media">Keine Video-/Medienquelle eingetragen.</div>';
    if (isYoutube(src)) return `<iframe class="${cls} youtube-frame" src="${esc(ytEmbed(src))}" allowfullscreen title="YouTube"></iframe>`;
    return `<video class="${cls}" src="${esc(src)}" controls></video>`;
  }

  function editableAttrs(editable, prop) {
    return editable ? ` class="editable-field" contenteditable="true" data-edit-prop="${prop}" spellcheck="false"` : '';
  }
  function renderChoice(block, editable = true) {
    const multi = (block.correct || []).length > 1;
    return `<div class="activity-preview" data-run="choice"><h3${editableAttrs(editable, 'question')}>${block.question || ''}</h3><p${editableAttrs(editable, 'description')}>${block.description || ''}</p><div class="choice-stack">${block.answers.map((a,i)=>`<label class="choice-option"><input type="${multi?'checkbox':'radio'}" name="c-${esc(block.id)}" value="${i}"> <span class="${editable ? 'editable-field' : ''}" ${editable ? `contenteditable="true" data-edit-answer-index="${i}" spellcheck="false"` : ''}>${a || ''}</span></label>`).join('')}</div><div class="test-button-row"><button class="btn primary check-choice" type="button">Prüfen</button><button class="btn retry-activity" type="button">Neuer Versuch</button></div><div class="feedback" hidden></div></div>`;
  }
  function renderDragWords(block, editable = true) {
    const words = [];
    const text = esc(block.dragText).replace(/\[([^\]]+)\]/g, (_, w) => { words.push(w); return `<span class="dtw-blank" data-answer="${esc(w)}"></span>`; });
    return `<div class="activity-preview" data-run="dragWords"><p class="dtw-text"${editable ? ' contenteditable="true" data-edit-drag-text spellcheck="false"' : ''}>${text}</p><div class="word-bank">${words.map(w=>`<button class="chip" type="button" draggable="true">${esc(w)}</button>`).join('')}</div><div class="test-button-row"><button class="btn primary check-dtw" type="button">Prüfen</button><button class="btn retry-activity" type="button">Neuer Versuch</button></div><div class="feedback" hidden></div></div>`;
  }
  function renderDragDrop(block, editable = true) {
    const targets = [...new Set((block.pairs || []).map(p => p.target).filter(Boolean))];
    return `<div class="activity-preview" data-run="dragDrop"><p${editableAttrs(editable, 'description')}>${block.description || ''}</p><div class="dnd-bank">${(block.pairs||[]).map(p=>`<button class="dnd-item" type="button" draggable="true" data-target="${esc(p.target)}">${esc(p.item)}</button>`).join('')}</div><div class="dnd-target-grid">${targets.map(t=>`<div class="dnd-target" data-target="${esc(t)}"><strong>${esc(t)}</strong></div>`).join('')}</div><div class="test-button-row"><button class="btn primary check-dnd" type="button">Prüfen</button><button class="btn retry-activity" type="button">Neuer Versuch</button></div><div class="feedback" hidden></div></div>`;
  }
  function renderInteractiveVideo(block) {
    return `<div class="iv-stage" data-interactions="${esc(JSON.stringify(block.interactions || []))}">${mediaHtml(block.media, 'media-video')}<div class="glass-overlay" hidden></div></div>`;
  }
  function renderBlockContent(block, editable = true) {
    if (block.type === 'text') return `<div class="editable-text" contenteditable="${editable}" data-rich="${esc(block.id)}">${block.richText || 'Text eingeben …'}</div>`;
    if (block.type === 'link') return `<a class="link-box" href="${esc(block.url)}" target="_blank">${esc(block.linkText || 'Link öffnen')}</a>`;
    if (block.type === 'image') return block.media ? `<img class="media-img" src="${esc(block.media)}" alt="${esc(block.alt)}">` : '<div class="empty-media">Bild auswählen oder URL eintragen.</div>';
    if (block.type === 'video') return mediaHtml(block.media, 'media-video');
    if (block.type === 'interactiveVideo') return renderInteractiveVideo(block);
    if (block.type === 'choice') return renderChoice(block, editable);
    if (block.type === 'dragWords') return renderDragWords(block, editable);
    if (block.type === 'dragDrop') return renderDragDrop(block, editable);
    return '';
  }


  function bindEditableFields(root = document, getBlock = () => null) {
    root.querySelectorAll('[data-edit-prop], [data-edit-answer-index], [data-edit-drag-text]').forEach(el => {
      el.addEventListener('mousedown', e => e.stopPropagation());
      el.addEventListener('click', e => e.stopPropagation());
      el.addEventListener('input', () => {
        const host = el.closest('[data-block-id]');
        const target = getBlock(host?.dataset.blockId) || window.__singleBlock || null;
        if (!target) return;
        if (el.dataset.editProp) target[el.dataset.editProp] = el.innerHTML;
        if (el.dataset.editAnswerIndex !== undefined) {
          const i = Number(el.dataset.editAnswerIndex);
          target.answers = Array.isArray(target.answers) ? target.answers : [];
          target.answers[i] = el.innerHTML;
        }
        if (el.dataset.editDragText !== undefined) {
          // Rein textuell speichern; Lücken bleiben über die Eigenschaften mit [Klammern] sauber steuerbar.
          target.dragText = el.innerText;
        }
        document.dispatchEvent(new CustomEvent('activity-content-edited'));
      });
    });
  }

  function attachRunHandlers(root = document, getBlock = () => null) {
    bindEditableFields(root, getBlock);
    let dragged = null;
    root.querySelectorAll('.chip,.dnd-item').forEach(el => { el.ondragstart = () => dragged = el; el.onclick = () => { dragged = el; }; });
    root.querySelectorAll('.dtw-blank').forEach(blank => {
      const place = () => { if (dragged?.classList.contains('chip')) { blank.textContent = dragged.textContent; blank.dataset.filled = dragged.textContent; dragged.remove(); dragged = null; } };
      blank.ondragover = e => e.preventDefault(); blank.ondrop = place; blank.onclick = place;
    });
    root.querySelectorAll('.dnd-target').forEach(zone => {
      const place = () => { if (dragged?.classList.contains('dnd-item')) { zone.appendChild(dragged); dragged = null; } };
      zone.ondragover = e => e.preventDefault(); zone.ondrop = place; zone.onclick = place;
    });
    root.querySelectorAll('.check-choice').forEach(btn => btn.onclick = () => {
      const card = btn.closest('[data-run="choice"]'); const host = btn.closest('[data-block-id]'); const b = getBlock(host?.dataset.blockId) || window.__singleBlock || {};
      const correct = (b.correct || [0]).map(Number).sort((a,b)=>a-b); const chosen = [...card.querySelectorAll('input:checked')].map(i=>Number(i.value)).sort((a,b)=>a-b);
      const ok = chosen.length === correct.length && chosen.every((v,i)=>v===correct[i]);
      card.querySelectorAll('.choice-option').forEach((o,i)=>{ o.classList.toggle('is-correct', correct.includes(i)); o.classList.toggle('is-wrong', chosen.includes(i)&&!correct.includes(i)); });
      const f = card.querySelector('.feedback'); f.hidden = false; f.textContent = ok ? 'Richtig.' : 'Nicht ganz. Die richtige Antwort ist markiert.';
    });
    root.querySelectorAll('.check-dtw').forEach(btn => btn.onclick = () => {
      const card = btn.closest('[data-run="dragWords"]'); const blanks = [...card.querySelectorAll('.dtw-blank')];
      const ok = blanks.length && blanks.every(b => b.dataset.filled === b.dataset.answer); blanks.forEach(b => b.classList.toggle('is-correct', b.dataset.filled === b.dataset.answer));
      const f = card.querySelector('.feedback'); f.hidden = false; f.textContent = ok ? 'Alles richtig.' : 'Noch nicht alles richtig.';
    });
    root.querySelectorAll('.check-dnd').forEach(btn => btn.onclick = () => {
      const card = btn.closest('[data-run="dragDrop"]'); const items = [...card.querySelectorAll('.dnd-target .dnd-item')]; const all = card.querySelectorAll('.dnd-item').length;
      const ok = items.length === all && items.every(i => i.dataset.target === i.parentElement.dataset.target); items.forEach(i => i.classList.toggle('is-correct', i.dataset.target === i.parentElement.dataset.target));
      const f = card.querySelector('.feedback'); f.hidden = false; f.textContent = ok ? 'Alles richtig.' : 'Einige Zuordnungen stimmen noch nicht.';
    });
    root.querySelectorAll('.retry-activity').forEach(btn => btn.onclick = () => {
      const host = btn.closest('[data-block-id]');
      const blockObj = getBlock(host?.dataset.blockId) || window.__singleBlock || null;
      if (host && blockObj) {
        const inner = host.querySelector('.block-inner');
        if (inner) inner.innerHTML = renderBlockContent(blockObj, true);
        attachRunHandlers(host, getBlock);
        return;
      }
      const activity = btn.closest('.activity-preview');
      if (activity) {
        activity.querySelectorAll('input').forEach(input => { input.checked = false; });
        activity.querySelectorAll('.is-correct,.is-wrong').forEach(el => el.classList.remove('is-correct','is-wrong'));
        activity.querySelectorAll('.feedback').forEach(f => { f.hidden = true; f.textContent = ''; });
      }
    });
    attachInteractiveRuntime(root);
  }
  function renderAction(action) {
    const a = normalizeAction(action);
    const fake = normalizeBlock({ ...a, id: a.id, type: a.type === 'choice' ? 'choice' : a.type });
    if (a.type === 'dragWords') return renderDragWords(fake);
    if (a.type === 'dragDrop') return renderDragDrop(fake);
    return renderChoice(fake);
  }
  function attachInteractiveRuntime(root = document) {
    root.querySelectorAll('.iv-stage').forEach(stage => {
      const video = stage.querySelector('video');
      const overlay = stage.querySelector('.glass-overlay');
      if (!video || !overlay) return;
      let actions = [];
      try {
        actions = JSON.parse(stage.dataset.interactions || '[]')
          .map(normalizeAction)
          .sort((a, b) => Number(a.time) - Number(b.time))
          .map(a => ({ ...a, done: false }));
      } catch { actions = []; }
      video.onseeking = () => {
        const t = Number(video.currentTime) || 0;
        actions.forEach(a => { if (t < Number(a.time) - 0.25) a.done = false; });
      };
      video.onplay = () => {
        if (!overlay.classList.contains('editing-overlay')) overlay.hidden = true;
      };
      video.ontimeupdate = () => {
        const now = Number(video.currentTime) || 0;
        const action = actions.find(a => !a.done && now >= Number(a.time));
        if (!action) return;
        action.done = true;
        video.pause();
        showPlayableIvOverlay(overlay, action, () => video.play().catch(()=>{}));
      };
    });
  }

  function showPlayableIvOverlay(overlay, action, onContinue = null) {
    overlay.hidden = false;
    overlay.classList.remove('editing-overlay');
    overlay.setAttribute('style', ivOverlayStyle(action));
    overlay.innerHTML = `<div class="iv-card">${renderAction(action)}</div>`;
    const row = overlay.querySelector('.activity-preview .test-button-row') || overlay.querySelector('.test-button-row');
    const btn = document.createElement('button');
    btn.className = 'btn primary continue-video';
    btn.type = 'button';
    btn.textContent = 'Weiter';
    (row || overlay.querySelector('.iv-card')).appendChild(btn);
    attachRunHandlers(overlay, () => action);
    btn.addEventListener('click', () => { overlay.hidden = true; onContinue?.(); });
  }

  function blockStyle(block) {
    const s = block.style || defaultStyle(block.type);
    const bg = s.bgTransparent ? 'transparent' : (s.bgColor || '#ffffff');
    const min = minBlockSize(block.type);
    return `left:${Number(s.x)||0}px;top:${Number(s.y)||0}px;width:${Math.max(Number(s.width)||min.width, min.width)}px;height:${Math.max(Number(s.height)||min.height, min.height)}px;min-width:${min.width}px;min-height:${min.height}px;z-index:${Number(s.z)||1};background:${bg};border-color:${s.showBorder === false ? 'transparent' : 'rgba(47,95,143,.40)'};box-shadow:${s.showShadow === true ? '0 8px 22px rgba(17,24,39,.09)' : 'none'}`;
  }

  function renderPairsEditor(pairs = [], prefix = 'pair') {
    const list = Array.isArray(pairs) && pairs.length ? pairs : [{ item: '', target: '' }];
    return `<div class="pair-editor"><div class="pair-head"><span>Begriff / Beispiel</span><span>Zielbereich</span><span></span></div>${list.map((p,i)=>`<div class="pair-row"><input data-${prefix}-item="${i}" value="${esc(p.item)}" placeholder="Begriff"><input data-${prefix}-target="${i}" value="${esc(p.target)}" placeholder="Zielbereich"><button class="btn small" type="button" data-${prefix}-remove="${i}">×</button></div>`).join('')}<button class="btn small" type="button" data-${prefix}-add>Weiteres Paar hinzufügen</button></div>`;
  }

  function renderInlinePairsEditor(pairs = [], actionIndex = 0) {
    const list = Array.isArray(pairs) && pairs.length ? pairs : [{ item: '', target: '' }];
    return `<div class="pair-editor compact-pair-editor"><div class="pair-head"><span>Begriff / Beispiel</span><span>Zielbereich</span><span></span></div>${list.map((p,i)=>`<div class="pair-row"><input data-iv-pair-item="${i}" data-action-index="${actionIndex}" value="${esc(p.item)}" placeholder="Begriff"><input data-iv-pair-target="${i}" data-action-index="${actionIndex}" value="${esc(p.target)}" placeholder="Zielbereich"><button class="btn small" type="button" data-iv-pair-remove="${i}" data-action-index="${actionIndex}">×</button></div>`).join('')}<button class="btn small" type="button" data-iv-pair-add data-action-index="${actionIndex}">Weiteres Paar hinzufügen</button></div>`;
  }

  function humanCorrectValue(values = [0]) {
    return (Array.isArray(values) ? values : [0]).map(v => Number(v) + 1).filter(v => Number.isFinite(v) && v > 0).join(',');
  }

  function actionSpecificFields(action, prefix = 'draft') {
    const a = normalizeAction(action);
    if (a.type === 'choice') {
      return `<div class="iv-field-block full">${renderChoiceAnswersEditor(a, prefix, 'multi')}</div>`;
    }
    if (a.type === 'dragWords') {
      return `<div class="iv-field-block full"><label>Text mit Lücken <textarea data-${prefix}-prop="dragText" rows="4">${esc(a.dragText)}</textarea></label><p class="muted small-note">Lücken mit eckigen Klammern markieren, z. B. [Wartezeit].</p></div>`;
    }
    if (a.type === 'dragDrop') {
      return `<div class="iv-field-block full">${renderPairsEditor(a.pairs, `${prefix}pair`)}</div>`;
    }
    return '';
  }

  function renderActionBuilder(action, prefix = 'ivdraft', existing = false) {
    const a = normalizeAction(action);
    const takeBtn = prefix === 'singleiv' ? `<button class="btn" id="takeTime" type="button">Aktuelle Zeit übernehmen</button>` : '';
    return `<div class="iv-builder-card refined-iv-builder">
      <div class="iv-top-row">
        <label class="type-field">Aktionstyp <select data-${prefix}-type><option value="choice" ${a.type === 'choice' ? 'selected' : ''}>Single & Multiple Choice</option><option value="dragWords" ${a.type === 'dragWords' ? 'selected' : ''}>Drag the Words</option><option value="dragDrop" ${a.type === 'dragDrop' ? 'selected' : ''}>Drag and Drop</option></select></label>
        <label class="time-field">Sekunde <input data-${prefix}-prop="time" type="number" step="0.1" min="0" value="${esc(a.time)}"></label>
        ${takeBtn}
      </div>
      <div class="iv-text-row">
        <label>Frage <input data-${prefix}-prop="question" value="${esc(a.question)}"></label>
        <label>Beschreibung <input data-${prefix}-prop="description" value="${esc(a.description)}"></label>
      </div>
      ${actionSpecificFields(a, prefix)}
      <div class="iv-builder-actions">
        <button class="btn primary" type="button" data-${prefix}-add>${existing ? 'Als neue Aktion hinzufügen' : 'Aktion hinzufügen'}</button>
        <button class="btn" type="button" data-${prefix}-update ${existing ? '' : 'disabled'}>Aktualisieren</button>
      </div>
    </div>`;
  }

  function renderInlineInteractiveVideoEditor(block) {
    block.interactions = Array.isArray(block.interactions) ? block.interactions.map(normalizeAction) : [];
    const editingId = block._editingActionId || '';
    const editing = block.interactions.find(a => a.id === editingId);
    const draft = normalizeAction(block._draftAction || editing || defaultAction('choice'));
    return `<div class="inline-iv-editor upgraded-inline-iv inline-iv-split">
      <div class="inline-iv-left">
        <label class="iv-file-row">Lokale Videodatei <input type="file" accept="video/*" data-file="media"></label>
        <p class="muted">Wähle eine lokale Videodatei und lege darunter deine Interaktionen an.</p>
        <div class="iv-editor-section compact-list-shell"><h3>Interaktionsliste</h3><div class="action-list compact-list">${block.interactions.length ? block.interactions.map((a,i)=>`<div class="action-list-row ${a.id===editingId?'active':''}"><button class="action-select" type="button" data-inline-action="${esc(a.id)}"><span class="time-pill">${Number(a.time).toFixed(1)} s</span><strong>${esc(String(a.question || `Interaktion ${i+1}`).replace(/<[^>]+>/g,''))}</strong><small>${esc(typeName(a.type))}</small></button><button class="action-delete" type="button" title="Interaktion löschen" data-inline-delete-action="${esc(a.id)}">×</button></div>`).join('') : '<p class="muted">Noch keine Interaktion angelegt.</p>'}</div></div>
      </div>
      <div class="inline-iv-right">
        <div class="iv-editor-section"><h3>${editing ? 'Ausgewählte Interaktion bearbeiten' : 'Neue Interaktion'}</h3>${renderActionBuilder(draft, 'inlineiv', !!editing)}</div>
      </div>
    </div>`;
  }

  function propertiesHtml(block, compact = false) {
    if (!block) return '<div class="properties-strip muted">Wähle ein Element aus.</div>';
    let content = '';
    if (block.type === 'text') content = `<label>Text <textarea data-prop="richText" rows="2">${esc(String(block.richText || '').replace(/<[^>]+>/g,''))}</textarea></label>`;
    if (block.type === 'link') content = `<label>Linktext <input data-prop="linkText" value="${esc(block.linkText)}"></label><label>URL <input data-prop="url" value="${esc(block.url)}"></label>`;
    if (block.type === 'image') content = `<label>Bild-URL <input data-prop="media" value="${esc(block.media)}"></label><label>Bilddatei <input type="file" accept="image/*" data-file="media"></label>`;
    if (block.type === 'video') content = `<label>Video-URL <input data-prop="media" value="${esc(block.media)}" placeholder="Direkte Videodatei oder YouTube-Link"></label><label>Videodatei <input type="file" accept="video/*" data-file="media"></label>`;
    if (block.type === 'interactiveVideo') content = renderInlineInteractiveVideoEditor(block);
    if (block.type === 'choice') content = `<label>Frage <input data-prop="question" value="${esc(richToPlain(block.question))}"></label><label>Beschreibung <input data-prop="description" value="${esc(richToPlain(block.description))}"></label>${renderChoiceAnswersEditor(block, 'blockchoice', 'multi')}`;
    if (block.type === 'dragWords') content = `<label>Text mit Lücken <textarea data-prop="dragText" rows="3">${esc(block.dragText)}</textarea></label>`;
    if (block.type === 'dragDrop') content = `<label>Aufgabentext <input data-prop="description" value="${esc(block.description)}"></label>${renderPairsEditor(block.pairs, 'blockpair')}`;
    return `<div class="properties-strip"><div class="prop-title">Element bearbeiten</div>${content}<label class="checkline"><input type="checkbox" data-style="bgTransparent" ${block.style.bgTransparent ? 'checked' : ''}> Hintergrund transparent</label><label>Hintergrundfarbe <input type="color" data-style="bgColor" value="${esc(block.style.bgColor || '#ffffff')}"></label><label class="checkline"><input type="checkbox" data-style="showBorder" ${block.style.showBorder !== false ? 'checked' : ''}> Rahmen anzeigen</label><label class="checkline"><input type="checkbox" data-style="showShadow" ${block.style.showShadow === true ? 'checked' : ''}> Schatten anzeigen</label><div class="layer-buttons"><button type="button" data-layer="back">Ebene zurück</button><button type="button" data-layer="front">Ebene vor</button><button type="button" data-layer="bottom">Ganz nach hinten</button><button type="button" data-layer="top">Ganz nach vorne</button><button class="danger" type="button" data-delete>Element löschen</button></div></div>`;
  }


  function bindChoiceAnswers(prefix, target, afterChange) {
    const commit = (needsRender = false) => {
      target.answers = Array.isArray(target.answers) && target.answers.length ? target.answers : ['Neue Antwort'];
      target.correct = Array.isArray(target.correct) && target.correct.length ? target.correct.filter(i => i >= 0 && i < target.answers.length) : [0];
      if (!target.correct.length) target.correct = [0];
      afterChange?.(needsRender);
    };
    app.querySelectorAll(`[data-${prefix}-answer-text]`).forEach(input => input.addEventListener('input', () => {
      const i = Number(input.dataset[`${prefix}AnswerText`]);
      target.answers[i] = input.value;
      commit(false);
    }));
    app.querySelectorAll(`[data-${prefix}-answer-correct]`).forEach(input => input.addEventListener('change', () => {
      const checked = [...app.querySelectorAll(`[data-${prefix}-answer-correct]:checked`)].map(x => Number(x.dataset[`${prefix}AnswerCorrect`]));
      target.correct = checked.length ? checked : [Number(input.dataset[`${prefix}AnswerCorrect`]) || 0];
      commit(false);
    }));
    app.querySelector(`[data-${prefix}-answer-add]`)?.addEventListener('click', () => {
      target.answers.push('Neue Antwort');
      commit(true);
    });
    app.querySelectorAll(`[data-${prefix}-answer-remove]`).forEach(btn => btn.addEventListener('click', () => {
      if (target.answers.length <= 1) return;
      const idx = Number(btn.dataset[`${prefix}AnswerRemove`]);
      target.answers.splice(idx, 1);
      target.correct = (target.correct || []).map(i => i > idx ? i - 1 : i).filter(i => i !== idx && i >= 0 && i < target.answers.length);
      if (!target.correct.length) target.correct = [0];
      commit(true);
    }));
  }

  function initContainer(kind) {
    const label = kind === 'book' ? 'Seite' : 'Folie';
    const storeKey = `mark-${kind}-${VERSION}`;
    let state = { title: kind === 'book' ? 'Interactive Book' : 'Course Presentation', stageWidth: 1200, stageHeight: kind === 'book' ? 760 : 680, pages: [defaultPage(1,label)], activePage: 0, selectedId: null };
    try { const saved = localStorage.getItem(storeKey); if (saved) state = { ...state, ...JSON.parse(saved) }; } catch {}
    state.pages = (state.pages || []).map((p,i)=>({ ...defaultPage(i+1,label), ...p, blocks: Array.isArray(p.blocks) ? p.blocks.map(normalizeBlock) : [] }));
    const current = () => state.pages[state.activePage];
    const block = (id) => current().blocks.find(b => b.id === id);
    const selected = () => block(state.selectedId);
    const save = () => localStorage.setItem(storeKey, JSON.stringify(state));
    const maxZ = () => Math.max(1, ...current().blocks.map(b => Number(b.style.z)||1));
    document.addEventListener('activity-content-edited', save);

    function render() {
      const page = current(); const pct = ((state.activePage + 1) / state.pages.length) * 100;
      const tabsHtml = `<aside class="page-tabs"><h2>${label}n</h2>${state.pages.map((p,i)=>`<button class="${i===state.activePage?'active':''}" data-page="${i}">${esc(p.title)}</button>`).join('')}<button data-new-page>+ ${label}</button></aside>`;
      const slideStrip = `<div class="course-slide-strip"><h2>Folien</h2>${state.pages.map((p,i)=>`<button class="${i===state.activePage?'active':''}" data-page="${i}">${esc(p.title)}</button>`).join('')}<button data-new-page>+ ${label}</button></div>`;
      app.innerHTML = `<div class="insert-toolbar"><button data-add="text">Textbox</button><button data-add="link">Link</button><button data-add="image">Bild</button><button data-add="video">Video</button><button data-add="interactiveVideo">Interaktives Video</button><button data-add="choice">Choice</button><button data-add="dragWords">Drag the Words</button><button data-add="dragDrop">Drag and Drop</button></div>
        ${toolbarHtml()}
        <div id="propertiesHost">${propertiesHtml(selected())}</div>
        <section class="container-work ${kind === 'book' ? 'book-work' : 'course-work'}">
          ${kind === 'book' ? tabsHtml : ''}
          <div class="stage-shell">
            <div class="stage-title"><input id="pageTitle" value="${esc(page.title)}"><span>${label} ${state.activePage+1} von ${state.pages.length}</span></div>
            <div class="stage-frame" style="height:${state.stageHeight}px" data-stage>
              <div class="progress-inside"><span style="width:${pct}%"></span></div>
              ${kind === 'course' ? `<button class="slide-arrow left" data-prev-page>‹</button><button class="slide-arrow right" data-next-page>›</button>` : ''}
              ${page.blocks.map(b=>`<article class="free-block block-type-${esc(b.type)} ${b.id===state.selectedId?'active':''}" data-block-type="${esc(b.type)}" data-block-id="${esc(b.id)}" style="${blockStyle(b)}"><div class="move-handle"></div><div class="block-inner">${renderBlockContent(b, b.id===state.selectedId)}</div></article>`).join('')}
            </div>
            ${kind === 'course' ? slideStrip : ''}
          </div>
        </section>
        <div class="export-row"><button class="btn primary" id="exportZip">HTML-ZIP herunterladen</button><button class="btn" id="clearLocal">Lokale Speicherung löschen</button></div>`;
      bindToolbar(app); bindContainerEvents(); attachRunHandlers(app, block); setTimeout(() => { app.querySelectorAll('.free-block').forEach(el => { const bb = block(el.dataset.blockId); if (bb) fitBlockElement(el, bb, true); }); save(); }, 0); save();
    }

    function addBlock(type) {
      const b = defaultBlock(type); b.style.x = 70 + current().blocks.length * 24; b.style.y = 80 + current().blocks.length * 24; b.style.z = maxZ() + 1; current().blocks.push(b); state.selectedId = b.id; render();
    }
    function bindContainerEvents() {
      app.querySelectorAll('[data-add]').forEach(btn => btn.onclick = () => addBlock(btn.dataset.add));
      app.querySelectorAll('[data-page]').forEach(btn => btn.onclick = () => { state.activePage = Number(btn.dataset.page); state.selectedId = null; render(); });
      app.querySelector('[data-new-page]')?.addEventListener('click', () => { state.pages.push(defaultPage(state.pages.length+1,label)); state.activePage = state.pages.length-1; state.selectedId = null; render(); });
      app.querySelector('[data-prev-page]')?.addEventListener('click', () => { state.activePage = Math.max(0, state.activePage-1); state.selectedId=null; render(); });
      app.querySelector('[data-next-page]')?.addEventListener('click', () => { state.activePage = Math.min(state.pages.length-1, state.activePage+1); state.selectedId=null; render(); });
      app.querySelector('#pageTitle')?.addEventListener('input', e => { current().title = e.target.value; save(); });
      const frame = app.querySelector('[data-stage]');
      frame?.addEventListener('mousedown', e => { if (e.target === frame) { state.selectedId = null; render(); } });
      app.querySelectorAll('.free-block').forEach(el => bindFreeBlock(el));
      bindProperties();
      app.querySelector('#exportZip').onclick = async () => downloadActivityZip(state, `${kind}-export`);
      app.querySelector('#clearLocal').onclick = () => { localStorage.removeItem(storeKey); location.reload(); };
    }
    function bindFreeBlock(el) {
      const b = block(el.dataset.blockId); if (!b) return;
      el.addEventListener('mousedown', e => { if (state.selectedId !== b.id) { state.selectedId = b.id; render(); } });
      const rich = el.querySelector('.editable-text');
      if (rich) rich.addEventListener('input', () => { b.richText = rich.innerHTML; save(); });
      const ro = new ResizeObserver(() => { if (state.selectedId === b.id) { const min = minBlockSize(b.type); b.style.width = Math.max(Math.round(el.offsetWidth), min.width); b.style.height = Math.max(Math.round(el.offsetHeight), min.height); fitBlockElement(el, b, true); save(); } }); ro.observe(el); setTimeout(() => { fitBlockElement(el, b, true); save(); }, 0);
      const handle = el.querySelector('.move-handle'); let start = null;
      handle?.addEventListener('mousedown', e => { e.preventDefault(); start = { x:e.clientX, y:e.clientY, left:b.style.x, top:b.style.y }; document.body.classList.add('dragging'); });
      document.addEventListener('mousemove', e => { if (!start) return; b.style.x = Math.max(0, start.left + e.clientX - start.x); b.style.y = Math.max(24, start.top + e.clientY - start.y); el.style.left = b.style.x+'px'; el.style.top = b.style.y+'px'; });
      document.addEventListener('mouseup', () => { if (start) { start=null; document.body.classList.remove('dragging'); save(); } });
    }
    function bindProperties() {
      const b = selected(); if (!b) return;
      app.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('input', () => { b[input.dataset.prop] = input.value; updateSelectedDom(b); save(); }));
      app.querySelectorAll('[data-prop-list]').forEach(input => input.addEventListener('input', () => { b[input.dataset.propList] = input.value.split('\n').filter(Boolean); updateSelectedDom(b); save(); }));
      app.querySelector('[data-prop-correct]')?.addEventListener('input', e => { b.correct = e.target.value.split(',').map(x=>Number(x.trim())-1).filter(x=>Number.isFinite(x) && x>=0); save(); });
      app.querySelectorAll('[data-style]').forEach(input => input.addEventListener('input', () => { const k = input.dataset.style; b.style[k] = input.type === 'checkbox' ? input.checked : input.value; updateSelectedDom(b); save(); }));
      app.querySelectorAll('[data-file]').forEach(input => input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file) return;
        if ((b.type === 'video' || b.type === 'interactiveVideo') && input.dataset.file === 'media') {
          if (file.size > 250 * 1024 * 1024) { alert('Die Videodatei ist sehr groß. Bitte nutze für den Test eine kleinere Datei.'); return; }
          if (b._objectUrl) URL.revokeObjectURL(b._objectUrl);
          const url = URL.createObjectURL(file);
          b.media = url; b._objectUrl = url; b._assetName = 'assets/' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); mediaFileStore.set(b.id, file);
        } else {
          b[input.dataset.file] = await dataUrlFromFile(file);
        }
        updateSelectedDom(b); save();
      }));
      app.querySelector('[data-delete]')?.addEventListener('click', () => { current().blocks = current().blocks.filter(x=>x.id!==b.id); state.selectedId=null; render(); });
      app.querySelectorAll('[data-layer]').forEach(btn => btn.addEventListener('click', () => { const z = maxZ(); if (btn.dataset.layer==='front') b.style.z += 1; if (btn.dataset.layer==='back') b.style.z = Math.max(1, b.style.z-1); if (btn.dataset.layer==='top') b.style.z = z+1; if (btn.dataset.layer==='bottom') b.style.z = 1; render(); }));
      bindChoiceAnswers('blockchoice', b, (needsRender) => { updateSelectedDom(b); save(); if (needsRender) render(); });
      bindInlineIvEditor(b, render, save, updateSelectedDom);
      bindPairs('blockpair', b);
    }
    function updateSelectedDom(b) {
      const el = app.querySelector(`[data-block-id="${CSS.escape(b.id)}"]`); if (!el) return;
      el.setAttribute('style', blockStyle(b));
      if (document.activeElement?.closest?.('#propertiesHost')) el.querySelector('.block-inner').innerHTML = renderBlockContent(b, true);
      attachRunHandlers(el, block);
      setTimeout(() => { fitBlockElement(el, b, true); save(); }, 0);
    }
    function bindPairs(prefix, target) {
      app.querySelector(`[data-${prefix}-add]`)?.addEventListener('click', () => { target.pairs.push({item:'', target:''}); render(); });
      app.querySelectorAll(`[data-${prefix}-remove]`).forEach(btn => btn.onclick = () => { target.pairs.splice(Number(btn.dataset[`${prefix}Remove`]),1); render(); });
      app.querySelectorAll(`[data-${prefix}-item]`).forEach(input => input.oninput = () => { target.pairs[Number(input.dataset[`${prefix}Item`])].item = input.value; save(); });
      app.querySelectorAll(`[data-${prefix}-target]`).forEach(input => input.oninput = () => { target.pairs[Number(input.dataset[`${prefix}Target`])].target = input.value; save(); });
    }
    render();
  }

  function readActionFromForm(prefix, base = defaultAction('choice')) {
    const out = normalizeAction(base);
    const typeEl = app.querySelector(`[data-${prefix}-type]`);
    if (typeEl) out.type = typeEl.value;
    app.querySelectorAll(`[data-${prefix}-prop]`).forEach(input => { out[input.dataset[`${prefix}Prop`]] = input.dataset[`${prefix}Prop`] === 'time' ? (Number(input.value) || 0) : input.value; });
    app.querySelectorAll(`[data-${prefix}-list]`).forEach(input => { out[input.dataset[`${prefix}List`]] = input.value.split('\n').filter(Boolean); });
    const correct = app.querySelector(`[data-${prefix}-correct]`);
    if (correct) out.correct = correct.value.split(',').map(x => Number(x.trim()) - 1).filter(x => Number.isFinite(x) && x >= 0);
    const answerInputs = [...app.querySelectorAll(`[data-${prefix}-answer-text]`)];
    if (answerInputs.length) {
      out.answers = answerInputs.map(input => input.value).filter(v => v.trim() !== '');
      const checked = [...app.querySelectorAll(`[data-${prefix}-answer-correct]:checked`)].map(input => Number(input.dataset[`${prefix}AnswerCorrect`])).filter(Number.isFinite);
      out.correct = checked.length ? checked.filter(i => i < out.answers.length) : [0];
    }
    const pairRows = [...app.querySelectorAll(`[data-${prefix}pair-item]`)];
    if (pairRows.length) {
      out.pairs = pairRows.map(input => {
        const i = Number(input.dataset[`${prefix}pairItem`]);
        return { item: input.value, target: app.querySelector(`[data-${prefix}pair-target="${i}"]`)?.value || '' };
      });
    }
    app.querySelectorAll(`[data-${prefix}-overlay]`).forEach(input => { out.overlay[input.dataset[`${prefix}Overlay`]] = ['left','top','width','height'].includes(input.dataset[`${prefix}Overlay`]) ? (Number(input.value) || 0) : input.value; });
    app.querySelectorAll(`[data-${prefix}-overlay-check]`).forEach(input => { out.overlay[input.dataset[`${prefix}OverlayCheck`]] = input.checked; });
    out.id = base.id || uid();
    return normalizeAction(out);
  }

  function bindInlineIvEditor(block, rerender, save, updateSelectedDom) {
    if (!block || block.type !== 'interactiveVideo') return;
    block.interactions = Array.isArray(block.interactions) ? block.interactions.map(normalizeAction) : [];
    block._draftAction = normalizeAction(block._draftAction || defaultAction('choice'));
    const selected = () => block.interactions.find(a => a.id === block._editingActionId);
    const refreshBlockPreview = () => { updateSelectedDom?.(block); save(); };
    app.querySelector('[data-inlineiv-type]')?.addEventListener('change', () => {
      block._draftAction = readActionFromForm('inlineiv', block._draftAction);
      block._draftAction.type = app.querySelector('[data-inlineiv-type]').value;
      rerender();
    });
    app.querySelectorAll('[data-inlineiv-prop], [data-inlineiv-list], [data-inlineiv-correct], [data-inlineiv-answer-text], [data-inlineiv-answer-correct], [data-inlineivpair-item], [data-inlineivpair-target]').forEach(input => input.addEventListener('input', () => {
      block._draftAction = readActionFromForm('inlineiv', block._draftAction);
      if (selected()) previewContainerAction(block, block._draftAction);
      refreshBlockPreview();
    }));
    app.querySelector('[data-inlineiv-add]')?.addEventListener('click', () => {
      const action = normalizeAction(readActionFromForm('inlineiv', block._draftAction));
      action.id = uid();
      block.interactions.push(action);
      block._editingActionId = action.id;
      block._draftAction = normalizeAction(action);
      save(); rerender();
    });
    app.querySelector('[data-inlineiv-update]')?.addEventListener('click', () => {
      const a = selected(); if (!a) return;
      const updated = normalizeAction(readActionFromForm('inlineiv', block._draftAction));
      updated.id = a.id;
      Object.assign(a, updated);
      block._draftAction = normalizeAction(a);
      refreshBlockPreview(); rerender();
    });
    app.querySelectorAll('[data-inline-action]').forEach(btn => btn.onclick = () => {
      block._editingActionId = btn.dataset.inlineAction; const a = selected(); if (a) { block._draftAction = normalizeAction(a); }
      save(); rerender(); setTimeout(() => previewContainerAction(block, block._draftAction), 60);
    });
    app.querySelectorAll('[data-inline-delete-action]').forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.inlineDeleteAction;
      block.interactions = block.interactions.filter(x => x.id !== id);
      if (block._editingActionId === id) { block._editingActionId = null; block._draftAction = normalizeAction(defaultAction('choice')); }
      refreshBlockPreview(); rerender();
    });
    app.querySelector(`[data-inlineivpair-add]`)?.addEventListener('click', () => { block._draftAction.pairs.push({ item: '', target: '' }); save(); rerender(); });
    app.querySelectorAll(`[data-inlineivpair-remove]`).forEach(btn => btn.onclick = () => { block._draftAction.pairs.splice(Number(btn.dataset.inlineivpairRemove), 1); save(); rerender(); });
  }

function previewContainerAction(block, action) {
    if (!action) return;
    const holder = app.querySelector(`[data-block-id="${CSS.escape(block.id)}"] .iv-stage`);
    if (!holder) return;
    const video = holder.querySelector('video');
    const overlay = holder.querySelector('.glass-overlay');
    if (video) { try { video.currentTime = Number(action.time) || 0; video.pause(); } catch {} }
    if (overlay) showEditableIvOverlay(overlay, action, null);
  }

  function initSingle(type) {
    if (type === 'interactiveVideo') return initInteractiveVideoEditor();
    const storeKey = `mark-single-${type}-${VERSION}`;
    let block = defaultBlock(type); try { const saved = localStorage.getItem(storeKey); if (saved) block = normalizeBlock(JSON.parse(saved)); } catch {}
    window.__singleBlock = block;
    const save = () => { window.__singleBlock = block; localStorage.setItem(storeKey, JSON.stringify(block)); };
    document.addEventListener('activity-content-edited', save);
    function render() {
      app.innerHTML = `${toolbarHtml()}<div id="propertiesHost">${propertiesHtml(block, true)}</div><section class="single-stage"><article class="free-block block-type-${esc(block.type)} active single-block" data-block-type="${esc(block.type)}" data-block-id="${esc(block.id)}" style="${blockStyle(block)}"><div class="move-handle"></div><div class="block-inner">${renderBlockContent(block,true)}</div></article></section><div class="export-row"><button class="btn primary" id="exportZip">HTML-ZIP herunterladen</button></div>`;
      bindToolbar(app); bindSingleEvents(); attachRunHandlers(app, () => block); setTimeout(() => { const el = app.querySelector('.single-block'); if (el) fitBlockElement(el, block, true); save(); }, 0); save();
    }
    function bindSingleEvents() {
      const el = app.querySelector('.single-block'); const rich = el.querySelector('.editable-text');
      rich?.addEventListener('input', () => { block.richText = rich.innerHTML; save(); });
      const ro = new ResizeObserver(() => { const min = minBlockSize(block.type); block.style.width = Math.max(Math.round(el.offsetWidth), min.width); block.style.height = Math.max(Math.round(el.offsetHeight), min.height); fitBlockElement(el, block, true); save(); }); ro.observe(el); setTimeout(() => { fitBlockElement(el, block, true); save(); }, 0);
      bindPropertiesForSingle();
      app.querySelector('#exportZip').onclick = () => downloadActivityZip({ title: typeName(type), stageWidth: 1200, stageHeight: 700, pages: [{ title: typeName(type), blocks: [block] }] }, `${type}-export`);
    }
    function bindPropertiesForSingle() {
      app.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('input', () => { block[input.dataset.prop] = input.value; render(); }));
      app.querySelectorAll('[data-prop-list]').forEach(input => input.addEventListener('input', () => { block[input.dataset.propList] = input.value.split('\n').filter(Boolean); render(); }));
      app.querySelector('[data-prop-correct]')?.addEventListener('input', e => { block.correct = e.target.value.split(',').map(x=>Number(x.trim())-1).filter(Number.isFinite).filter(x=>x>=0); save(); });
      app.querySelectorAll('[data-style]').forEach(input => input.addEventListener('input', () => { block.style[input.dataset.style] = input.type==='checkbox'?input.checked:input.value; render(); }));
      app.querySelectorAll('[data-file]').forEach(input => input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file) return;
        if ((block.type === 'video' || block.type === 'interactiveVideo') && input.dataset.file === 'media') {
          if (file.size > 250 * 1024 * 1024) { alert('Die Videodatei ist sehr groß. Bitte nutze für den Test eine kleinere Datei.'); return; }
          if (block._objectUrl) URL.revokeObjectURL(block._objectUrl);
          const url = URL.createObjectURL(file);
          block.media = url; block._objectUrl = url; block._assetName = 'assets/' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); mediaFileStore.set(block.id, file);
        } else {
          block[input.dataset.file] = await dataUrlFromFile(file);
        }
        render();
      }));
      bindChoiceAnswers('blockchoice', block, (needsRender) => { save(); if (needsRender) render(); else { const el = app.querySelector('.single-block'); if (el) { el.querySelector('.block-inner').innerHTML = renderBlockContent(block, true); attachRunHandlers(el, () => block); fitBlockElement(el, block, true); } } });
      bindPairsSingle('blockpair', block);
    }
    function bindPairsSingle(prefix, target) {
      app.querySelector(`[data-${prefix}-add]`)?.addEventListener('click', () => { target.pairs.push({item:'', target:''}); render(); });
      app.querySelectorAll(`[data-${prefix}-remove]`).forEach(btn => btn.onclick = () => { target.pairs.splice(Number(btn.dataset[`${prefix}Remove`]),1); render(); });
      app.querySelectorAll(`[data-${prefix}-item]`).forEach(input => input.oninput = () => { target.pairs[Number(input.dataset[`${prefix}Item`])].item = input.value; save(); });
      app.querySelectorAll(`[data-${prefix}-target]`).forEach(input => input.oninput = () => { target.pairs[Number(input.dataset[`${prefix}Target`])].target = input.value; save(); });
    }
    render();
  }

  function typeName(type) { return ({ choice:'Single & Multiple Choice', dragWords:'Drag the Words', dragDrop:'Drag and Drop', interactiveVideo:'Interaktives Video' }[type] || type); }

  function initInteractiveVideoEditor() {
    const storeKey = `mark-iv-${VERSION}`;
    let data = defaultBlock('interactiveVideo');
    data.interactions = [];
    try { const saved = localStorage.getItem(storeKey); if (saved) data = normalizeBlock(JSON.parse(saved)); } catch {}
    data.interactions = Array.isArray(data.interactions) ? data.interactions.map(normalizeAction) : [];
    let selectedActionId = null;
    let draftAction = normalizeAction(defaultAction('choice'));
    const save = () => localStorage.setItem(storeKey, JSON.stringify(data));
    document.addEventListener('activity-content-edited', save);
    const selectedAction = () => data.interactions.find(a => a.id === selectedActionId) || null;

    function render() {
      const selected = selectedAction();
      const formAction = draftAction;
      app.innerHTML = `<section class="iv-studio">
          <div class="iv-main-panel">
            <div class="iv-file-bar"><label>Lokale Videodatei <input id="videoFile" type="file" accept="video/*"></label><span class="muted">Nur lokale Videodateien. Die Datei wird beim ZIP-Export als Asset übernommen.</span></div>
            <div class="iv-preview live-iv-preview">${renderInteractiveVideo(data)}</div>
            <div class="iv-list-panel"><div class="iv-list-head"><h2>Interaktionsliste</h2><p class="muted">Eintrag anklicken: Video springt zur Zeitmarke und zeigt das Overlay.</p></div><div class="action-list visual-list">${data.interactions.length ? data.interactions.map((a,i)=>`<div class="action-list-row ${a.id===selectedActionId?'active':''}"><button class="action-select" type="button" data-action="${esc(a.id)}"><span class="time-pill">${Number(a.time).toFixed(1)} s</span><strong>${esc(String(a.question || `Interaktion ${i+1}`).replace(/<[^>]+>/g,''))}</strong><small>${esc(typeName(a.type))}</small></button><button class="action-delete" type="button" title="Interaktion löschen" data-delete-action="${esc(a.id)}">×</button></div>`).join('') : '<p class="muted empty-list">Noch keine Interaktion angelegt.</p>'}</div></div>
          </div>
          <aside class="iv-side-panel">
            <h2>${selected ? 'Ausgewählte Interaktion bearbeiten' : 'Neue Interaktion anlegen'}</h2>
            ${renderActionBuilder(formAction, 'singleiv', !!selected)}
          </aside>
        </section>
        <div class="export-row"><button class="btn primary" id="exportZip">HTML-ZIP herunterladen</button><button class="btn" id="clearLocal">Lokale Speicherung löschen</button></div>`;
      bindIvEvents(); attachRunHandlers(app, () => data); save();
      if (selected) setTimeout(() => seekAndPreview(draftAction), 80);
    }

    function readCurrentForm(base = draftAction) {
      return normalizeAction(readActionFromForm('singleiv', base));
    }

    function bindIvEvents() {
      app.querySelector('#videoFile')?.addEventListener('change', e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 250 * 1024 * 1024) { alert('Die Videodatei ist sehr groß. Bitte nutze für den Test eine kleinere Datei.'); return; }
        if (data._objectUrl) URL.revokeObjectURL(data._objectUrl);
        const url = URL.createObjectURL(file);
        data.media = url; data._objectUrl = url; data._assetName = 'assets/' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); mediaFileStore.set(data.id, file); save(); render();
      });
      app.querySelector('#takeTime')?.addEventListener('click', () => {
        const v = app.querySelector('.live-iv-preview video');
        const t = app.querySelector('[data-singleiv-prop="time"]');
        if (t) { t.value = v ? v.currentTime.toFixed(1) : '0'; t.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      app.querySelector('[data-singleiv-type]')?.addEventListener('change', () => {
        draftAction = readCurrentForm(draftAction);
        draftAction.type = app.querySelector('[data-singleiv-type]').value;
        render();
      });
      app.querySelectorAll('[data-singleiv-prop], [data-singleiv-list], [data-singleiv-correct], [data-singleiv-answer-text], [data-singleiv-answer-correct], [data-singleivpair-item], [data-singleivpair-target]').forEach(input => input.addEventListener('input', () => {
        draftAction = readCurrentForm(draftAction);
        if (selectedAction()) seekAndPreview(draftAction);
      }));
      app.querySelector('[data-singleiv-add]')?.addEventListener('click', () => {
        const action = normalizeAction(readCurrentForm(draftAction));
        action.id = uid();
        data.interactions.push(action);
        selectedActionId = action.id;
        draftAction = normalizeAction(action);
        save(); render();
      });
      app.querySelector('[data-singleiv-update]')?.addEventListener('click', () => {
        const current = selectedAction(); if (!current) return;
        const updated = normalizeAction(readCurrentForm(draftAction));
        updated.id = current.id;
        Object.assign(current, updated);
        draftAction = normalizeAction(current);
        save(); render();
      });
      app.querySelectorAll('[data-delete-action]').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteAction;
        data.interactions = data.interactions.filter(x => x.id !== id);
        if (selectedActionId === id) { selectedActionId = null; draftAction = normalizeAction(defaultAction('choice')); }
        save(); render();
      });
      app.querySelectorAll('[data-action]').forEach(btn => btn.onclick = () => {
        selectedActionId = btn.dataset.action;
        const a = selectedAction();
        if (a) draftAction = normalizeAction(a);
        save(); render();
      });
      app.querySelector(`[data-singleiv-answer-add]`)?.addEventListener('click', () => { draftAction = readCurrentForm(draftAction); draftAction.answers.push('Neue Antwort'); render(); });
      app.querySelectorAll(`[data-singleiv-answer-remove]`).forEach(btn => btn.onclick = () => { draftAction = readCurrentForm(draftAction); if (draftAction.answers.length > 1) { const idx=Number(btn.dataset.singleivAnswerRemove); draftAction.answers.splice(idx,1); draftAction.correct=(draftAction.correct||[]).map(i=>i>idx?i-1:i).filter(i=>i!==idx&&i>=0); if(!draftAction.correct.length) draftAction.correct=[0]; render(); } });
      app.querySelector(`[data-singleivpair-add]`)?.addEventListener('click', () => { draftAction.pairs.push({ item:'', target:'' }); render(); });
      app.querySelectorAll(`[data-singleivpair-remove]`).forEach(btn => btn.onclick = () => { draftAction.pairs.splice(Number(btn.dataset.singleivpairRemove),1); render(); });
      app.querySelector('#exportZip').onclick = () => downloadActivityZip({ title:'Interaktives Video', stageWidth:1200, stageHeight:720, pages:[{title:'Interaktives Video', blocks:[data]}] }, 'interactive-video-export');
      app.querySelector('#clearLocal').onclick = () => { localStorage.removeItem(storeKey); location.reload(); };
    }
    function refreshIvStage() { const stage = app.querySelector('.live-iv-preview .iv-stage'); if (stage) stage.dataset.interactions = JSON.stringify(data.interactions); }
    function seekAndPreview(action) {
      const stage = app.querySelector('.live-iv-preview .iv-stage'); if (!stage || !action) return;
      const video = stage.querySelector('video'); const overlay = stage.querySelector('.glass-overlay');
      if (video) { try { video.currentTime = Number(action.time) || 0; video.pause(); } catch {} }
      if (overlay) showEditableIvOverlay(overlay, action, () => { save(); render(); });
    }
    render();
  }

function showEditableIvOverlay(overlay, action, onChange = null) {
    overlay.hidden = false;
    overlay.setAttribute('style', ivOverlayStyle(action));
    overlay.classList.add('editing-overlay');
    overlay.innerHTML = `<div class="iv-card">${renderAction(action)}</div>`;
    const row = overlay.querySelector('.activity-preview .test-button-row') || overlay.querySelector('.test-button-row');
    const btn = document.createElement('button');
    btn.className = 'btn primary continue-video';
    btn.type = 'button';
    btn.textContent = 'Weiter';
    (row || overlay.querySelector('.iv-card')).appendChild(btn);
    attachRunHandlers(overlay, () => action);
    btn.addEventListener('click', () => { overlay.hidden = true; overlay.classList.remove('editing-overlay'); });
  }

  function exportCss() { return `body{font-family:Inter,system-ui,sans-serif;margin:0;padding:32px;color:#111827;background:#fff}main{max-width:1200px;margin:0 auto}h1{letter-spacing:-.035em}.export-stage{position:relative;border:1px solid #cbd5e1;background:#fff;overflow:hidden}.free-block{position:absolute;border:1px solid rgba(47,95,143,.4);padding:12px;overflow:auto;box-shadow:none;background:#fff}.media-video,.youtube-frame{width:100%;height:100%;border:0;background:#111}.media-img{max-width:100%;max-height:100%;display:block}.choice-stack,.word-bank,.dnd-bank{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0 26px}.choice-option,.chip,.dnd-item{border:1px solid #cbd5e1;padding:10px 14px;background:#fff;border-radius:18px;font-weight:760;cursor:pointer}.choice-option.is-correct,.dtw-blank.is-correct,.dnd-item.is-correct{background:#dcfce7}.choice-option.is-wrong{background:#fee2e2}.dnd-target-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:20px;margin:24px 0 30px}.dnd-target{min-height:155px;border:1.5px dashed #2f5f8f;padding:16px;background:#eef6ff}.dtw-blank{display:inline-flex;min-width:110px;min-height:34px;margin:0 6px 8px;padding:4px 8px;border:1.5px dashed #2f5f8f;background:#e8f2fb;vertical-align:middle}.feedback{margin-top:18px;padding:14px;background:#e8f2fb;border:1px solid rgba(47,95,143,.3)}button,.check-choice,.check-dtw,.check-dnd,.retry-activity,.continue-video{appearance:none;-webkit-appearance:none;border:1px solid rgba(47,95,143,.35);background:#fff!important;background-image:none!important;color:#173d63;font-weight:800;padding:11px 15px;cursor:pointer;box-shadow:none!important;text-shadow:none!important;filter:none!important}.check-choice,.check-dtw,.check-dnd,.continue-video{background:#2f6fa9!important;color:#fff!important;border-color:#2f6fa9!important}.test-button-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.glass-overlay{position:absolute;left:50%;top:50%;width:min(86%,920px);max-height:78%;transform:translate(-50%,-50%);background:rgba(255,255,255,.88);backdrop-filter:blur(12px);padding:24px;box-shadow:none;border:1px solid transparent;overflow:auto}.iv-stage{position:relative;width:100%;height:100%}.progress{height:8px;background:#e5e7eb}.progress span{display:block;height:100%;background:#2f5f8f}nav{display:flex;gap:12px;align-items:center;margin-top:18px}`; }
    function exportRuntime() { return `(() => { const DATA=window.ACTIVITY_DATA||{}; let active=0; const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); const yt=u=>/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i.test(u||''); const yid=u=>{const m=String(u||'').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);return m?m[1]:''}; function media(src){if(!src)return '<p>Kein Medium.</p>'; if(yt(src))return '<iframe class="youtube-frame" src="https://www.youtube.com/embed/'+esc(yid(src))+'?rel=0" allowfullscreen></iframe>'; return '<video class="media-video" src="'+esc(src)+'" controls></video>';} function choice(b){const multi=(b.correct||[]).length>1;return '<div data-run="choice"><h3>'+esc(b.question)+'</h3><p>'+esc(b.description||'')+'</p><div class="choice-stack">'+(b.answers||[]).map((a,i)=>'<label class="choice-option"><input type="'+(multi?'checkbox':'radio')+'" name="c'+esc(b.id)+'" value="'+i+'"> '+esc(a)+'</label>').join('')+'</div><div class="test-button-row"><button class="check-choice">Prüfen</button><button class="retry-activity">Neuer Versuch</button></div><div class="feedback" hidden></div></div>';} function dtw(b){let words=[];let h=esc(b.dragText||'').replace(/\[([^\]]+)\]/g,(_,w)=>{words.push(w);return '<span class="dtw-blank" data-answer="'+esc(w)+'"></span>'});return '<div data-run="dragWords"><p>'+h+'</p><div class="word-bank">'+words.map(w=>'<button class="chip" draggable="true">'+esc(w)+'</button>').join('')+'</div><div class="test-button-row"><button class="check-dtw">Prüfen</button><button class="retry-activity">Neuer Versuch</button></div><div class="feedback" hidden></div></div>';} function dnd(b){const targets=[...new Set((b.pairs||[]).map(p=>p.target))];return '<div data-run="dragDrop"><p>'+esc(b.description||'')+'</p><div class="dnd-bank">'+(b.pairs||[]).map(p=>'<button class="dnd-item" draggable="true" data-target="'+esc(p.target)+'">'+esc(p.item)+'</button>').join('')+'</div><div class="dnd-target-grid">'+targets.map(t=>'<div class="dnd-target" data-target="'+esc(t)+'"><strong>'+esc(t)+'</strong></div>').join('')+'</div><div class="test-button-row"><button class="check-dnd">Prüfen</button><button class="retry-activity">Neuer Versuch</button></div><div class="feedback" hidden></div></div>';} function content(b){if(b.type==='text')return b.richText||''; if(b.type==='link')return '<a href="'+esc(b.url||'#')+'" target="_blank">'+esc(b.linkText||'Link')+'</a>'; if(b.type==='image')return b.media?'<img class="media-img" src="'+esc(b.media)+'">':'<p>Kein Bild.</p>'; if(b.type==='video')return media(b.media); if(b.type==='interactiveVideo')return '<div class="iv-stage" data-interactions="'+esc(JSON.stringify(b.interactions||[]))+'">'+media(b.media)+'<div class="glass-overlay" hidden></div></div>'; if(b.type==='choice')return choice(b); if(b.type==='dragWords')return dtw(b); if(b.type==='dragDrop')return dnd(b); return '';} function render(){const pages=DATA.pages||[];const p=pages[active]||{blocks:[]};document.getElementById('viewer').innerHTML='<div class="progress"><span style="width:'+(((active+1)/(pages.length||1))*100)+'%"></span></div><h2>'+esc(p.title||'Seite')+'</h2><section class="export-stage" style="width:'+(DATA.stageWidth||1200)+'px;height:'+(DATA.stageHeight||700)+'px">'+(p.blocks||[]).map(b=>'<article class="free-block" style="left:'+(b.style?.x||0)+'px;top:'+(b.style?.y||0)+'px;width:'+(b.style?.width||300)+'px;height:'+(b.style?.height||160)+'px;z-index:'+(b.style?.z||1)+';background:'+(b.style?.bgTransparent?'transparent':(b.style?.bgColor||'#fff'))+';border-color:'+(b.style?.showBorder===false?'transparent':'rgba(47,95,143,.4)')+';box-shadow:'+(b.style?.showShadow===true?'0 8px 22px rgba(17,24,39,.09)':'none')+'">'+content(b)+'</article>').join('')+'</section>';document.getElementById('count').textContent=(active+1)+' von '+pages.length;attach();} function attach(){let dragged=null;document.querySelectorAll('.chip,.dnd-item').forEach(e=>{e.ondragstart=()=>dragged=e;e.onclick=()=>dragged=e});document.querySelectorAll('.dtw-blank').forEach(b=>{const p=()=>{if(dragged?.classList.contains('chip')){b.textContent=dragged.textContent;b.dataset.filled=dragged.textContent;dragged.remove();dragged=null}};b.ondragover=e=>e.preventDefault();b.ondrop=p;b.onclick=p});document.querySelectorAll('.dnd-target').forEach(z=>{const p=()=>{if(dragged?.classList.contains('dnd-item')){z.appendChild(dragged);dragged=null}};z.ondragover=e=>e.preventDefault();z.ondrop=p;z.onclick=p});document.querySelectorAll('.check-choice,.check-dtw,.check-dnd').forEach(btn=>btn.onclick=()=>{const root=btn.closest('[data-run]');const f=root?.querySelector('.feedback');if(!root||!f)return; if(root.dataset.run==='choice'){f.hidden=false;f.textContent='Geprüft.';} if(root.dataset.run==='dragWords'){const blanks=[...root.querySelectorAll('.dtw-blank')];const ok=blanks.length&&blanks.every(b=>b.dataset.filled===b.dataset.answer);blanks.forEach(b=>b.classList.toggle('is-correct',b.dataset.filled===b.dataset.answer));f.hidden=false;f.textContent=ok?'Alles richtig.':'Noch nicht alles richtig.';} if(root.dataset.run==='dragDrop'){const items=[...root.querySelectorAll('.dnd-target .dnd-item')];const all=root.querySelectorAll('.dnd-item').length;const ok=items.length===all&&items.every(i=>i.dataset.target===i.parentElement.dataset.target);items.forEach(i=>i.classList.toggle('is-correct',i.dataset.target===i.parentElement.dataset.target));f.hidden=false;f.textContent=ok?'Alles richtig.':'Einige Zuordnungen stimmen noch nicht.';}});document.querySelectorAll('.retry-activity').forEach(btn=>btn.onclick=()=>render());document.querySelectorAll('.iv-stage').forEach(s=>{const v=s.querySelector('video'),o=s.querySelector('.glass-overlay');if(!v||!o)return;let as=[];try{as=JSON.parse(s.dataset.interactions||'[]').map(x=>({...x,done:false}))}catch{}v.ontimeupdate=()=>{const a=as.find(x=>!x.done&&v.currentTime>=Number(x.time));if(!a)return;a.done=true;v.pause();o.hidden=false;o.innerHTML='<h3>'+esc(a.question)+'</h3><p>'+esc(a.description||'')+'</p><button class="continue-video">Weiter</button>';o.querySelector('button').onclick=()=>{o.hidden=true;v.play().catch(()=>{})}}})} document.getElementById('prev').onclick=()=>{active=Math.max(0,active-1);render()};document.getElementById('next').onclick=()=>{active=Math.min((DATA.pages||[]).length-1,active+1);render()};render(); })();`; }
  async function downloadActivityZip(data, name) { const prepared = prepareExportData(data); const files = [{name:'index.html',content:exportIndex(prepared.data)},{name:'activity-data.js',content:exportData(prepared.data)},{name:'activity-runtime.js',content:exportRuntime()},{name:'activity-style.css',content:exportCss()},{name:'README.txt',content:'index.html öffnen. Lokale Medien liegen im Ordner assets, sofern sie in dieser Sitzung ausgewählt wurden.'}, ...prepared.assets]; downloadZip(`${name}.zip`, files); }
  function prepareExportData(data) { const clone = JSON.parse(JSON.stringify(data)); const assets = []; (clone.pages||[]).forEach(page => (page.blocks||[]).forEach(block => { const file = mediaFileStore.get(block.id); if (file && block._assetName) { block.media = block._assetName; assets.push({ name:block._assetName, blob:file }); } delete block._objectUrl; delete block._assetName; delete block._urlTimer; })); return { data: clone, assets }; }
  async function makeZip(files) { const enc=new TextEncoder(); const table=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})(); const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}; const u16=(a,v)=>a.push(v&255,(v>>>8)&255),u32=(a,v)=>a.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255); let parts=[],central=[],offset=0; for(const f of files){const name=enc.encode(f.name); let data; if (f.blob) data = new Uint8Array(await f.blob.arrayBuffer()); else if (f.bytes) data = f.bytes; else data=enc.encode(f.content||''); const crc=crc32(data),local=[];u32(local,0x04034b50);u16(local,20);u16(local,0);u16(local,0);u16(local,0);u16(local,0);u32(local,crc);u32(local,data.length);u32(local,data.length);u16(local,name.length);u16(local,0);parts.push(new Uint8Array(local),name,data);const cen=[];u32(cen,0x02014b50);u16(cen,20);u16(cen,20);u16(cen,0);u16(cen,0);u16(cen,0);u16(cen,0);u32(cen,crc);u32(cen,data.length);u32(cen,data.length);u16(cen,name.length);u16(cen,0);u16(cen,0);u16(cen,0);u16(cen,0);u32(cen,0);u32(cen,offset);central.push(new Uint8Array(cen),name);offset+=local.length+name.length+data.length} const size=central.reduce((s,p)=>s+p.length,0),end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,files.length);u16(end,files.length);u32(end,size);u32(end,offset);u16(end,0);return new Blob([...parts,...central,new Uint8Array(end)],{type:'application/zip'}); }
  async function downloadZip(name, files) { const url=URL.createObjectURL(await makeZip(files)); const a=document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }

  if (editorType === 'course') initContainer('course');
  if (editorType === 'book') initContainer('book');
  if (editorType === 'choice') initSingle('choice');
  if (editorType === 'drag-words') initSingle('dragWords');
  if (editorType === 'drag-drop') initSingle('dragDrop');
  if (editorType === 'interactive-video') initInteractiveVideoEditor();
})();
