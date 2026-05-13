(() => {
  'use strict';

  const app = document.getElementById('app');
  const editorType = document.body.dataset.editor;
  const VERSION = '63';
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

  function defaultStyle(type = 'text') {
    return {
      x: 40,
      y: 54,
      width: type === 'video' || type === 'interactiveVideo' ? 620 : 380,
      height: type === 'video' || type === 'interactiveVideo' ? 350 : 180,
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
      answers: ['Antwort 1', 'Antwort 2'],
      correct: [0],
      dragText: 'Text mit [Lücke].',
      pairs: [{ item: 'Begriff', target: 'Zielbereich' }]
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
      answers: ['Antwort 1', 'Antwort 2'],
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
    return out;
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
    if (el?.closest?.('.editable-text')) savedRange = s.getRangeAt(0).cloneRange();
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
      };
      control.addEventListener(control.type === 'color' ? 'input' : 'click', run);
      if (control.tagName === 'SELECT') control.addEventListener('change', run);
    });
    root.querySelectorAll('[data-font-size]').forEach(sel => sel.addEventListener('change', () => {
      restoreRange(); document.execCommand('fontSize', false, '7');
      document.querySelectorAll('font[size="7"]').forEach(font => {
        const span = document.createElement('span'); span.style.fontSize = `${sel.value}px`; span.innerHTML = font.innerHTML; font.replaceWith(span);
      });
    }));
  }

  function mediaHtml(src, cls = 'media-video') {
    if (!src) return '<div class="empty-media">Keine Video-/Medienquelle eingetragen.</div>';
    if (isYoutube(src)) return `<iframe class="${cls} youtube-frame" src="${esc(ytEmbed(src))}" allowfullscreen title="YouTube"></iframe>`;
    return `<video class="${cls}" src="${esc(src)}" controls></video>`;
  }

  function renderChoice(block) {
    const multi = (block.correct || []).length > 1;
    return `<div class="activity-preview" data-run="choice"><h3>${esc(block.question)}</h3><p>${esc(block.description)}</p><div class="choice-stack">${block.answers.map((a,i)=>`<label class="choice-option"><input type="${multi?'checkbox':'radio'}" name="c-${esc(block.id)}" value="${i}"> ${esc(a)}</label>`).join('')}</div><div class="test-button-row"><button class="btn primary check-choice" type="button">Prüfen</button><button class="btn retry-activity" type="button">Neuer Versuch</button></div><div class="feedback" hidden></div></div>`;
  }
  function renderDragWords(block) {
    const words = [];
    const text = esc(block.dragText).replace(/\[([^\]]+)\]/g, (_, w) => { words.push(w); return `<span class="dtw-blank" data-answer="${esc(w)}"></span>`; });
    return `<div class="activity-preview" data-run="dragWords"><p class="dtw-text">${text}</p><div class="word-bank">${words.map(w=>`<button class="chip" type="button" draggable="true">${esc(w)}</button>`).join('')}</div><div class="test-button-row"><button class="btn primary check-dtw" type="button">Prüfen</button><button class="btn retry-activity" type="button">Neuer Versuch</button></div><div class="feedback" hidden></div></div>`;
  }
  function renderDragDrop(block) {
    const targets = [...new Set((block.pairs || []).map(p => p.target).filter(Boolean))];
    return `<div class="activity-preview" data-run="dragDrop"><p>${esc(block.description)}</p><div class="dnd-bank">${(block.pairs||[]).map(p=>`<button class="dnd-item" type="button" draggable="true" data-target="${esc(p.target)}">${esc(p.item)}</button>`).join('')}</div><div class="dnd-target-grid">${targets.map(t=>`<div class="dnd-target" data-target="${esc(t)}"><strong>${esc(t)}</strong></div>`).join('')}</div><div class="test-button-row"><button class="btn primary check-dnd" type="button">Prüfen</button><button class="btn retry-activity" type="button">Neuer Versuch</button></div><div class="feedback" hidden></div></div>`;
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
    if (block.type === 'choice') return renderChoice(block);
    if (block.type === 'dragWords') return renderDragWords(block);
    if (block.type === 'dragDrop') return renderDragDrop(block);
    return '';
  }

  function attachRunHandlers(root = document, getBlock = () => null) {
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
      const video = stage.querySelector('video'); const overlay = stage.querySelector('.glass-overlay'); if (!video || !overlay) return;
      let actions = []; try { actions = JSON.parse(stage.dataset.interactions || '[]').map(a => ({ ...normalizeAction(a), done: false })); } catch {}
      video.ontimeupdate = () => {
        const action = actions.find(a => !a.done && video.currentTime >= Number(a.time)); if (!action) return;
        action.done = true; video.pause(); overlay.hidden = false;
        overlay.innerHTML = `<div class="iv-card"><h3>${esc(action.question)}</h3><p>${esc(action.description)}</p>${renderAction(action)}<button class="btn primary continue-video" type="button">Weiter</button></div>`;
        overlay.querySelector('.continue-video').onclick = () => { overlay.hidden = true; video.play().catch(()=>{}); };
        attachRunHandlers(overlay, () => action);
      };
    });
  }

  function blockStyle(block) {
    const s = block.style || defaultStyle(block.type);
    const bg = s.bgTransparent ? 'transparent' : (s.bgColor || '#ffffff');
    return `left:${Number(s.x)||0}px;top:${Number(s.y)||0}px;width:${Number(s.width)||300}px;height:${Number(s.height)||160}px;z-index:${Number(s.z)||1};background:${bg};border-color:${s.showBorder === false ? 'transparent' : 'rgba(47,95,143,.40)'};box-shadow:${s.showShadow === true ? '0 8px 22px rgba(17,24,39,.09)' : 'none'}`;
  }

  function renderPairsEditor(pairs = [], prefix = 'pair') {
    const list = Array.isArray(pairs) && pairs.length ? pairs : [{ item: '', target: '' }];
    return `<div class="pair-editor"><div class="pair-head"><span>Begriff / Beispiel</span><span>Zielbereich</span><span></span></div>${list.map((p,i)=>`<div class="pair-row"><input data-${prefix}-item="${i}" value="${esc(p.item)}" placeholder="Begriff"><input data-${prefix}-target="${i}" value="${esc(p.target)}" placeholder="Zielbereich"><button class="btn small" type="button" data-${prefix}-remove="${i}">×</button></div>`).join('')}<button class="btn small" type="button" data-${prefix}-add>Weiteres Paar hinzufügen</button></div>`;
  }

  function renderInlinePairsEditor(pairs = [], actionIndex = 0) {
    const list = Array.isArray(pairs) && pairs.length ? pairs : [{ item: '', target: '' }];
    return `<div class="pair-editor compact-pair-editor"><div class="pair-head"><span>Begriff / Beispiel</span><span>Zielbereich</span><span></span></div>${list.map((p,i)=>`<div class="pair-row"><input data-iv-pair-item="${i}" data-action-index="${actionIndex}" value="${esc(p.item)}" placeholder="Begriff"><input data-iv-pair-target="${i}" data-action-index="${actionIndex}" value="${esc(p.target)}" placeholder="Zielbereich"><button class="btn small" type="button" data-iv-pair-remove="${i}" data-action-index="${actionIndex}">×</button></div>`).join('')}<button class="btn small" type="button" data-iv-pair-add data-action-index="${actionIndex}">Weiteres Paar hinzufügen</button></div>`;
  }

  function renderInlineActionEditor(action, index) {
    const a = normalizeAction(action);
    let specific = '';
    if (a.type === 'choice') {
      specific = `<label>Antworten <textarea data-iv-list="answers" data-action-index="${index}" rows="3">${esc(a.answers.join('\n'))}</textarea></label><label>Richtige Antwort(en), z. B. 0 oder 0,2 <input data-iv-correct data-action-index="${index}" value="${esc((a.correct || [0]).join(','))}"></label>`;
    } else if (a.type === 'dragWords') {
      specific = `<label>Text mit Lücken <textarea data-iv-prop="dragText" data-action-index="${index}" rows="3">${esc(a.dragText)}</textarea></label>`;
    } else if (a.type === 'dragDrop') {
      specific = renderInlinePairsEditor(a.pairs, index);
    }
    return `<article class="inline-action-card"><div class="inline-action-head"><strong>Interaktion ${index + 1}</strong><button class="btn" type="button" data-iv-refresh="${index}">Aktualisieren</button><button class="btn danger" type="button" data-iv-remove="${index}">Löschen</button></div><div class="inline-action-grid"><label>Sekunde <input data-iv-prop="time" data-action-index="${index}" type="number" step="0.1" min="0" value="${esc(a.time)}"></label><label>Typ <select data-iv-type data-action-index="${index}"><option value="choice" ${a.type === 'choice' ? 'selected' : ''}>Single & Multiple Choice</option><option value="dragWords" ${a.type === 'dragWords' ? 'selected' : ''}>Drag the Words</option><option value="dragDrop" ${a.type === 'dragDrop' ? 'selected' : ''}>Drag and Drop</option></select></label><label>Frage <input data-iv-prop="question" data-action-index="${index}" value="${esc(a.question)}"></label><label>Beschreibung <input data-iv-prop="description" data-action-index="${index}" value="${esc(a.description)}"></label></div>${specific}</article>`;
  }

  function renderInlineInteractiveVideoEditor(block) {
    const actions = Array.isArray(block.interactions) ? block.interactions.map(normalizeAction) : [];
    return `<div class="inline-iv-editor"><label>Lokale Videodatei <input type="file" accept="video/*" data-file="media"></label><p class="muted">Interaktive Videos nutzen hier nur lokale Videodateien. Die Datei wird beim HTML-ZIP-Export als Asset mit ausgegeben.</p><div class="inline-action-create"><label>Neue Interaktion <select data-iv-new-type><option value="choice">Single & Multiple Choice</option><option value="dragWords">Drag the Words</option><option value="dragDrop">Drag and Drop</option></select></label><button class="btn primary" type="button" data-iv-add>Interaktion hinzufügen</button></div>${actions.length ? actions.map((a,i)=>renderInlineActionEditor(a,i)).join('') : '<p class="muted">Noch keine Interaktion angelegt.</p>'}</div>`;
  }

  function propertiesHtml(block, compact = false) {
    if (!block) return '<div class="properties-strip muted">Wähle ein Element aus.</div>';
    let content = '';
    if (block.type === 'text') content = `<label>Text <textarea data-prop="richText" rows="2">${esc(String(block.richText || '').replace(/<[^>]+>/g,''))}</textarea></label>`;
    if (block.type === 'link') content = `<label>Linktext <input data-prop="linkText" value="${esc(block.linkText)}"></label><label>URL <input data-prop="url" value="${esc(block.url)}"></label>`;
    if (block.type === 'image') content = `<label>Bild-URL <input data-prop="media" value="${esc(block.media)}"></label><label>Bilddatei <input type="file" accept="image/*" data-file="media"></label>`;
    if (block.type === 'video') content = `<label>Video-URL <input data-prop="media" value="${esc(block.media)}" placeholder="Direkte Videodatei oder YouTube-Link"></label><label>Videodatei <input type="file" accept="video/*" data-file="media"></label>`;
    if (block.type === 'interactiveVideo') content = renderInlineInteractiveVideoEditor(block);
    if (block.type === 'choice') content = `<label>Frage <input data-prop="question" value="${esc(block.question)}"></label><label>Beschreibung <input data-prop="description" value="${esc(block.description)}"></label><label>Antworten <textarea data-prop-list="answers" rows="3">${esc(block.answers.join('\n'))}</textarea></label><label>Richtige Antwort(en), z. B. 0 oder 0,2 <input data-prop-correct value="${esc((block.correct||[0]).join(','))}"></label>`;
    if (block.type === 'dragWords') content = `<label>Text mit Lücken <textarea data-prop="dragText" rows="3">${esc(block.dragText)}</textarea></label>`;
    if (block.type === 'dragDrop') content = `<label>Aufgabentext <input data-prop="description" value="${esc(block.description)}"></label>${renderPairsEditor(block.pairs, 'blockpair')}`;
    return `<div class="properties-strip"><div class="prop-title">Element bearbeiten</div>${content}<label class="checkline"><input type="checkbox" data-style="bgTransparent" ${block.style.bgTransparent ? 'checked' : ''}> Hintergrund transparent</label><label>Hintergrundfarbe <input type="color" data-style="bgColor" value="${esc(block.style.bgColor || '#ffffff')}"></label><label class="checkline"><input type="checkbox" data-style="showBorder" ${block.style.showBorder !== false ? 'checked' : ''}> Rahmen anzeigen</label><label class="checkline"><input type="checkbox" data-style="showShadow" ${block.style.showShadow === true ? 'checked' : ''}> Schatten anzeigen</label><div class="layer-buttons"><button type="button" data-layer="back">Ebene zurück</button><button type="button" data-layer="front">Ebene vor</button><button type="button" data-layer="bottom">Ganz nach hinten</button><button type="button" data-layer="top">Ganz nach vorne</button><button class="danger" type="button" data-delete>Element löschen</button></div></div>`;
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

    function render() {
      const page = current(); const pct = ((state.activePage + 1) / state.pages.length) * 100;
      const tabsHtml = `<aside class="page-tabs"><h2>${label}n</h2>${state.pages.map((p,i)=>`<button class="${i===state.activePage?'active':''}" data-page="${i}">${esc(p.title)}</button>`).join('')}<button data-new-page>+ ${label}</button></aside>`;
      const slideStrip = `<div class="course-slide-strip"><h2>Folien</h2>${state.pages.map((p,i)=>`<button class="${i===state.activePage?'active':''}" data-page="${i}">${esc(p.title)}</button>`).join('')}<button data-new-page>+ ${label}</button></div>`;
      app.innerHTML = `<section class="editor-top compact-hero"><p class="eyebrow">Containerfunktion</p><h1>${esc(state.title)}</h1></section>
        <div class="insert-toolbar"><button data-add="text">Textbox</button><button data-add="link">Link</button><button data-add="image">Bild</button><button data-add="video">Video</button><button data-add="interactiveVideo">Interaktives Video</button><button data-add="choice">Choice</button><button data-add="dragWords">Drag the Words</button><button data-add="dragDrop">Drag and Drop</button></div>
        ${toolbarHtml()}
        <div id="propertiesHost">${propertiesHtml(selected())}</div>
        <section class="container-work ${kind === 'book' ? 'book-work' : 'course-work'}">
          ${kind === 'book' ? tabsHtml : ''}
          <div class="stage-shell">
            <div class="stage-title"><input id="pageTitle" value="${esc(page.title)}"><span>${label} ${state.activePage+1} von ${state.pages.length}</span></div>
            <div class="stage-frame" style="height:${state.stageHeight}px" data-stage>
              <div class="progress-inside"><span style="width:${pct}%"></span></div>
              ${kind === 'course' ? `<button class="slide-arrow left" data-prev-page>‹</button><button class="slide-arrow right" data-next-page>›</button>` : ''}
              ${page.blocks.map(b=>`<article class="free-block ${b.id===state.selectedId?'active':''}" data-block-id="${esc(b.id)}" style="${blockStyle(b)}"><div class="move-handle"></div><div class="block-inner">${renderBlockContent(b, b.id===state.selectedId)}</div></article>`).join('')}
            </div>
            ${kind === 'course' ? slideStrip : ''}
          </div>
        </section>
        <div class="export-row"><button class="btn primary" id="exportZip">HTML-ZIP herunterladen</button><button class="btn" id="clearLocal">Lokale Speicherung löschen</button></div>`;
      bindToolbar(app); bindContainerEvents(); attachRunHandlers(app, block); save();
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
      const ro = new ResizeObserver(() => { if (state.selectedId === b.id) { b.style.width = Math.round(el.offsetWidth); b.style.height = Math.round(el.offsetHeight); save(); } }); ro.observe(el);
      const handle = el.querySelector('.move-handle'); let start = null;
      handle?.addEventListener('mousedown', e => { e.preventDefault(); start = { x:e.clientX, y:e.clientY, left:b.style.x, top:b.style.y }; document.body.classList.add('dragging'); });
      document.addEventListener('mousemove', e => { if (!start) return; b.style.x = Math.max(0, start.left + e.clientX - start.x); b.style.y = Math.max(24, start.top + e.clientY - start.y); el.style.left = b.style.x+'px'; el.style.top = b.style.y+'px'; });
      document.addEventListener('mouseup', () => { if (start) { start=null; document.body.classList.remove('dragging'); save(); } });
    }
    function bindProperties() {
      const b = selected(); if (!b) return;
      app.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('input', () => { b[input.dataset.prop] = input.value; updateSelectedDom(b); save(); }));
      app.querySelectorAll('[data-prop-list]').forEach(input => input.addEventListener('input', () => { b[input.dataset.propList] = input.value.split('\n').filter(Boolean); updateSelectedDom(b); save(); }));
      app.querySelector('[data-prop-correct]')?.addEventListener('input', e => { b.correct = e.target.value.split(',').map(x=>Number(x.trim())).filter(Number.isFinite); save(); });
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
      bindInlineIvEditor(b, render, save);
      bindPairs('blockpair', b);
    }
    function updateSelectedDom(b) {
      const el = app.querySelector(`[data-block-id="${CSS.escape(b.id)}"]`); if (!el) return;
      el.setAttribute('style', blockStyle(b));
      if (document.activeElement?.closest?.('#propertiesHost')) el.querySelector('.block-inner').innerHTML = renderBlockContent(b, false);
      attachRunHandlers(el, block);
    }
    function bindPairs(prefix, target) {
      app.querySelector(`[data-${prefix}-add]`)?.addEventListener('click', () => { target.pairs.push({item:'', target:''}); render(); });
      app.querySelectorAll(`[data-${prefix}-remove]`).forEach(btn => btn.onclick = () => { target.pairs.splice(Number(btn.dataset[`${prefix}Remove`]),1); render(); });
      app.querySelectorAll(`[data-${prefix}-item]`).forEach(input => input.oninput = () => { target.pairs[Number(input.dataset[`${prefix}Item`])].item = input.value; save(); });
      app.querySelectorAll(`[data-${prefix}-target]`).forEach(input => input.oninput = () => { target.pairs[Number(input.dataset[`${prefix}Target`])].target = input.value; save(); });
    }
    render();
  }

  function bindInlineIvEditor(block, rerender, save) {
    if (!block || block.type !== 'interactiveVideo') return;
    block.interactions = Array.isArray(block.interactions) ? block.interactions.map(normalizeAction) : [];
    app.querySelector('[data-iv-add]')?.addEventListener('click', () => {
      const type = app.querySelector('[data-iv-new-type]')?.value || 'choice';
      block.interactions.push(defaultAction(type));
      save(); rerender();
    });
    app.querySelectorAll('[data-iv-refresh]').forEach(btn => btn.onclick = () => { updateSelectedDom?.(block); save(); });
    app.querySelectorAll('[data-iv-remove]').forEach(btn => btn.onclick = () => { block.interactions.splice(Number(btn.dataset.ivRemove), 1); save(); rerender(); });
    app.querySelectorAll('[data-iv-type]').forEach(input => input.onchange = () => { const a = block.interactions[Number(input.dataset.actionIndex)]; if (!a) return; a.type = input.value; save(); rerender(); });
    app.querySelectorAll('[data-iv-prop]').forEach(input => input.oninput = () => { const a = block.interactions[Number(input.dataset.actionIndex)]; if (!a) return; a[input.dataset.ivProp] = input.dataset.ivProp === 'time' ? (Number(input.value) || 0) : input.value; save(); });
    app.querySelectorAll('[data-iv-list]').forEach(input => input.oninput = () => { const a = block.interactions[Number(input.dataset.actionIndex)]; if (!a) return; a[input.dataset.ivList] = input.value.split('\n').filter(Boolean); save(); });
    app.querySelectorAll('[data-iv-correct]').forEach(input => input.oninput = () => { const a = block.interactions[Number(input.dataset.actionIndex)]; if (!a) return; a.correct = input.value.split(',').map(x => Number(x.trim())).filter(Number.isFinite); save(); });
    app.querySelectorAll('[data-iv-pair-add]').forEach(btn => btn.onclick = () => { const a = block.interactions[Number(btn.dataset.actionIndex)]; if (!a) return; a.pairs.push({ item: '', target: '' }); save(); rerender(); });
    app.querySelectorAll('[data-iv-pair-remove]').forEach(btn => btn.onclick = () => { const a = block.interactions[Number(btn.dataset.actionIndex)]; if (!a) return; a.pairs.splice(Number(btn.dataset.ivPairRemove), 1); save(); rerender(); });
    app.querySelectorAll('[data-iv-pair-item]').forEach(input => input.oninput = () => { const a = block.interactions[Number(input.dataset.actionIndex)]; if (!a) return; a.pairs[Number(input.dataset.ivPairItem)].item = input.value; save(); });
    app.querySelectorAll('[data-iv-pair-target]').forEach(input => input.oninput = () => { const a = block.interactions[Number(input.dataset.actionIndex)]; if (!a) return; a.pairs[Number(input.dataset.ivPairTarget)].target = input.value; save(); });
  }

  function initSingle(type) {
    if (type === 'interactiveVideo') return initInteractiveVideoEditor();
    const storeKey = `mark-single-${type}-${VERSION}`;
    let block = defaultBlock(type); try { const saved = localStorage.getItem(storeKey); if (saved) block = normalizeBlock(JSON.parse(saved)); } catch {}
    window.__singleBlock = block;
    const save = () => { window.__singleBlock = block; localStorage.setItem(storeKey, JSON.stringify(block)); };
    function render() {
      app.innerHTML = `<section class="editor-top"><p class="eyebrow">Einzelfunktion</p><h1>${esc(typeName(type))}</h1></section>${toolbarHtml()}<div id="propertiesHost">${propertiesHtml(block, true)}</div><section class="single-stage"><article class="free-block active single-block" data-block-id="${esc(block.id)}" style="${blockStyle(block)}"><div class="move-handle"></div><div class="block-inner">${renderBlockContent(block,true)}</div></article></section><div class="export-row"><button class="btn primary" id="exportZip">HTML-ZIP herunterladen</button></div>`;
      bindToolbar(app); bindSingleEvents(); attachRunHandlers(app, () => block); save();
    }
    function bindSingleEvents() {
      const el = app.querySelector('.single-block'); const rich = el.querySelector('.editable-text');
      rich?.addEventListener('input', () => { block.richText = rich.innerHTML; save(); });
      const ro = new ResizeObserver(() => { block.style.width = Math.round(el.offsetWidth); block.style.height = Math.round(el.offsetHeight); save(); }); ro.observe(el);
      bindPropertiesForSingle();
      app.querySelector('#exportZip').onclick = () => downloadActivityZip({ title: typeName(type), stageWidth: 1200, stageHeight: 700, pages: [{ title: typeName(type), blocks: [block] }] }, `${type}-export`);
    }
    function bindPropertiesForSingle() {
      app.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('input', () => { block[input.dataset.prop] = input.value; render(); }));
      app.querySelectorAll('[data-prop-list]').forEach(input => input.addEventListener('input', () => { block[input.dataset.propList] = input.value.split('\n').filter(Boolean); render(); }));
      app.querySelector('[data-prop-correct]')?.addEventListener('input', e => { block.correct = e.target.value.split(',').map(x=>Number(x.trim())).filter(Number.isFinite); save(); });
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
    let data = defaultBlock('interactiveVideo'); data.interactions = [];
    try { const saved = localStorage.getItem(storeKey); if (saved) data = normalizeBlock(JSON.parse(saved)); } catch {}
    data.interactions = Array.isArray(data.interactions) ? data.interactions.map(normalizeAction) : [];
    let selectedAction = data.interactions[0]?.id || null;
    const save = () => localStorage.setItem(storeKey, JSON.stringify(data));
    function render() {
      const action = data.interactions.find(a => a.id === selectedAction) || null;
      app.innerHTML = `<section class="editor-top compact-hero"><p class="eyebrow">Einzelfunktion</p><h1>Interaktives Video</h1></section><section class="iv-editor-grid"><div class="iv-video-card"><label>Lokale Videodatei <input id="videoFile" type="file" accept="video/*"></label><p class="iv-video-warning">Interaktive Videos nutzen hier nur lokale Videodateien. Für den Export wird die ausgewählte Datei als Asset in den ZIP-Ordner gelegt, solange du nach dem Auswählen direkt exportierst.</p><div class="iv-preview">${renderInteractiveVideo(data)}</div></div><aside class="iv-actions"><h2>Aktionen</h2><div class="action-create"><label>Zeitpunkt in Sekunden <input id="newTime" type="number" step="0.1" min="0" value="0"></label><button class="btn" id="takeTime" type="button">Aktuelle Zeit übernehmen</button><label>Aktionstyp <select id="newType"><option value="choice">Single & Multiple Choice</option><option value="dragWords">Drag the Words</option><option value="dragDrop">Drag and Drop</option></select></label><button class="btn primary" id="addAction" type="button">Aktion hinzufügen</button></div><div class="action-list">${data.interactions.length ? data.interactions.map(a=>`<button class="${a.id===selectedAction?'active':''}" data-action="${esc(a.id)}">${Number(a.time).toFixed(1)} s · ${esc(typeName(a.type))}</button>`).join('') : '<p class="muted">Noch keine Aktion angelegt.</p>'}</div>${action ? actionEditor(action) : '<p class="muted">Wähle eine Aktion aus oder füge eine neue hinzu.</p>'}</aside></section><div class="export-row"><button class="btn primary" id="exportZip">HTML-ZIP herunterladen</button></div>`;
      bindIvEvents(); attachRunHandlers(app, () => data); save();
    }
    function actionEditor(a) {
      let specific = '';
      if (a.type === 'choice') specific = `<label>Antworten <textarea data-action-list="answers" rows="3">${esc(a.answers.join('\n'))}</textarea></label><label>Richtige Antwort(en) <input data-action-correct value="${esc(a.correct.join(','))}"></label>`;
      if (a.type === 'dragWords') specific = `<label>Text mit Lücken <textarea data-action-prop="dragText" rows="4">${esc(a.dragText)}</textarea></label>`;
      if (a.type === 'dragDrop') specific = `${renderPairsEditor(a.pairs, 'actionpair')}`;
      return `<div class="action-editor"><h3>Aktion bearbeiten</h3><label>Zeit <input data-action-prop="time" type="number" step="0.1" value="${esc(a.time)}"></label><label>Frage <input data-action-prop="question" value="${esc(a.question)}"></label><label>Beschreibung <input data-action-prop="description" value="${esc(a.description)}"></label>${specific}<button class="btn primary" data-action-refresh type="button">Aktualisieren</button><button class="btn danger" data-action-delete type="button">Aktion löschen</button></div>`;
    }
    function bindIvEvents() {
      app.querySelector('#videoFile').onchange = e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 250 * 1024 * 1024) { alert('Die Videodatei ist sehr groß. Bitte nutze für den Test eine kleinere Datei.'); return; } const url = URL.createObjectURL(file); if (data._objectUrl) URL.revokeObjectURL(data._objectUrl); data.media = url; data._objectUrl = url; data._assetName = 'assets/' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); mediaFileStore.set(data.id, file); render(); };
      app.querySelector('#takeTime').onclick = () => { const v = app.querySelector('.iv-preview video'); app.querySelector('#newTime').value = v ? v.currentTime.toFixed(1) : '0'; };
      app.querySelector('#addAction').onclick = () => { const a = defaultAction(app.querySelector('#newType').value); a.time = Number(app.querySelector('#newTime').value)||0; data.interactions.push(a); selectedAction = a.id; render(); };
      app.querySelectorAll('[data-action]').forEach(btn => btn.onclick = () => { selectedAction = btn.dataset.action; render(); });
      const a = data.interactions.find(x=>x.id===selectedAction);
      if (a) {
        app.querySelectorAll('[data-action-prop]').forEach(input => input.oninput = () => { a[input.dataset.actionProp] = input.dataset.actionProp==='time' ? Number(input.value)||0 : input.value; save(); refreshIvStage(); });
        app.querySelector('[data-action-list]')?.addEventListener('input', e => { a.answers = e.target.value.split('\n').filter(Boolean); save(); });
        app.querySelector('[data-action-correct]')?.addEventListener('input', e => { a.correct = e.target.value.split(',').map(x=>Number(x.trim())).filter(Number.isFinite); save(); });
        app.querySelector('[data-action-refresh]')?.addEventListener('click', () => { refreshIvStage(); save(); });
        app.querySelector('[data-action-delete]')?.addEventListener('click', () => { data.interactions = data.interactions.filter(x=>x.id!==a.id); selectedAction = data.interactions[0]?.id || null; render(); });
        bindPairsIv('actionpair', a);
      }
      app.querySelector('#exportZip').onclick = async () => downloadActivityZip({ title:'Interaktives Video', stageWidth:1200, stageHeight:720, pages:[{title:'Interaktives Video', blocks:[data]}] }, 'interactive-video-export');
    }
    function refreshIvStage() { const stage = app.querySelector('.iv-stage'); if (stage) stage.dataset.interactions = JSON.stringify(data.interactions); }
    function bindPairsIv(prefix, target) {
      app.querySelector(`[data-${prefix}-add]`)?.addEventListener('click', () => { target.pairs.push({item:'',target:''}); render(); });
      app.querySelectorAll(`[data-${prefix}-remove]`).forEach(btn => btn.onclick = () => { target.pairs.splice(Number(btn.dataset[`${prefix}Remove`]),1); render(); });
      app.querySelectorAll(`[data-${prefix}-item]`).forEach(input => input.oninput = () => { target.pairs[Number(input.dataset[`${prefix}Item`])].item = input.value; save(); });
      app.querySelectorAll(`[data-${prefix}-target]`).forEach(input => input.oninput = () => { target.pairs[Number(input.dataset[`${prefix}Target`])].target = input.value; save(); });
    }
    render();
  }

  function exportIndex(data) {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.title||'Aktivität')}</title><link rel="stylesheet" href="activity-style.css"></head><body><main><h1>${esc(data.title||'Aktivität')}</h1><div id="viewer"></div><nav><button id="prev">Zurück</button><span id="count"></span><button id="next">Weiter</button></nav></main><script src="activity-data.js"></script><script src="activity-runtime.js"></script></body></html>`;
  }
  function exportData(data) { return `window.ACTIVITY_DATA = ${JSON.stringify(data, null, 2)};`; }
  function exportCss() { return `body{font-family:Inter,system-ui,sans-serif;margin:0;padding:32px;color:#111827;background:#fff}main{max-width:1200px;margin:0 auto}h1{letter-spacing:-.035em}.export-stage{position:relative;border:1px solid #cbd5e1;background:#fff;overflow:hidden}.free-block{position:absolute;border:1px solid rgba(47,95,143,.4);padding:12px;overflow:auto;box-shadow:none;background:#fff}.media-video,.youtube-frame{width:100%;height:100%;border:0;background:#111}.media-img{max-width:100%;max-height:100%;display:block}.choice-stack,.word-bank,.dnd-bank{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0 26px}.choice-option,.chip,.dnd-item{border:1px solid #cbd5e1;padding:10px 14px;background:#fff;border-radius:18px;font-weight:760;cursor:pointer}.choice-option.is-correct,.dtw-blank.is-correct,.dnd-item.is-correct{background:#dcfce7}.choice-option.is-wrong{background:#fee2e2}.dnd-target-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:20px;margin:24px 0 30px}.dnd-target{min-height:155px;border:1.5px dashed #2f5f8f;padding:16px;background:#eef6ff}.dtw-blank{display:inline-flex;min-width:110px;min-height:34px;margin:0 6px 8px;padding:4px 8px;border:1.5px dashed #2f5f8f;background:#e8f2fb;vertical-align:middle}.feedback{margin-top:18px;padding:14px;background:#e8f2fb;border:1px solid rgba(47,95,143,.3)}button,.check-choice,.check-dtw,.check-dnd,.retry-activity,.continue-video{appearance:none;-webkit-appearance:none;border:1px solid rgba(47,95,143,.35);background:#fff!important;background-image:none!important;color:#173d63;font-weight:800;padding:11px 15px;cursor:pointer;box-shadow:none!important;text-shadow:none!important;filter:none!important}.check-choice,.check-dtw,.check-dnd,.continue-video{background:#2f6fa9!important;color:#fff!important;border-color:#2f6fa9!important}.test-button-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.glass-overlay{position:absolute;left:5%;right:5%;bottom:7%;background:rgba(255,255,255,.82);backdrop-filter:blur(12px);padding:24px;box-shadow:0 18px 40px rgba(17,24,39,.2)}.iv-stage{position:relative;width:100%;height:100%}.progress{height:8px;background:#e5e7eb}.progress span{display:block;height:100%;background:#2f5f8f}nav{display:flex;gap:12px;align-items:center;margin-top:18px}`; }
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
