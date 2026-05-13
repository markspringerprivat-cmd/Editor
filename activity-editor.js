(() => {
  'use strict';

  const editorType = document.body.dataset.editor;
  const app = document.getElementById('app');
  const VERSION = '54';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const uid = () => 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const typeLabel = (type) => ({
    text: 'Textbox', link: 'Link', image: 'Bild', video: 'Video', interactiveVideo: 'Interaktives Video',
    choice: 'Single & Multiple Choice', dragWords: 'Drag the Words', dragDrop: 'Drag and Drop'
  }[type] || type);
  const isYoutube = (url) => /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i.test(url || '');
  const youtubeId = (url) => {
    const text = String(url || '');
    const match = text.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
    return match ? match[1] : '';
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
      x: 70,
      y: 70,
      width: type === 'interactiveVideo' || type === 'video' ? 620 : 360,
      height: type === 'interactiveVideo' || type === 'video' ? 360 : 170,
      z: 1
    };
  }

  function defaultAction(type = 'choice') {
    return {
      id: uid(),
      time: 4,
      type,
      question: 'Welche Antwort passt?',
      description: 'Wähle eine Antwort aus.',
      answers: ['Antwort 1', 'Antwort 2', 'Antwort 3'],
      correct: [0],
      dragText: 'Eine professionelle Gesprächsführung braucht [Wartezeit] und [Rückmeldung].',
      pairs: [
        { item: 'Beispiel', target: 'Planung' },
        { item: 'Struktur', target: 'Verständnis' }
      ]
    };
  }

  function defaultBlock(type = 'text', position = {}) {
    const style = { ...defaultStyle(type), ...position };
    const block = {
      id: uid(),
      type,
      label: typeLabel(type),
      richText: type === 'text' ? '<p>Text eingeben …</p>' : '',
      linkText: 'Link öffnen',
      url: 'https://example.com',
      media: '',
      alt: '',
      question: 'Welche Antwort passt?',
      description: 'Wähle eine Antwort aus.',
      answers: ['Antwort 1', 'Antwort 2', 'Antwort 3'],
      correct: [0],
      dragText: 'Eine professionelle Gesprächsführung braucht [Wartezeit] und [Rückmeldung].',
      pairs: [
        { item: 'Beispiel', target: 'Planung' },
        { item: 'Struktur', target: 'Verständnis' }
      ],
      interactions: [defaultAction('choice')],
      style
    };
    if (type === 'link') block.richText = '';
    if (type === 'image') block.style.height = 260;
    return block;
  }

  function defaultPage(number = 1, label = 'Folie') {
    return { id: uid(), title: `${label} ${number}`, blocks: [] };
  }

  function normalizeAction(action = {}) {
    const base = defaultAction(action.type || 'choice');
    return {
      ...base,
      ...action,
      id: action.id || uid(),
      time: Number(action.time) || 0,
      answers: Array.isArray(action.answers) && action.answers.length ? action.answers.map(String) : base.answers,
      correct: Array.isArray(action.correct) ? action.correct.map(Number) : [Number(action.correctIndex) || 0],
      pairs: Array.isArray(action.pairs) && action.pairs.length
        ? action.pairs.map((pair) => ({ item: String(pair.item || ''), target: String(pair.target || '') })).filter((pair) => pair.item && pair.target)
        : base.pairs
    };
  }

  function normalizeBlock(block = {}) {
    const base = defaultBlock(block.type || 'text');
    const normalized = { ...base, ...block };
    normalized.style = { ...defaultStyle(normalized.type), ...(block.style || {}) };
    normalized.answers = Array.isArray(block.answers) && block.answers.length ? block.answers.map(String) : base.answers;
    normalized.correct = Array.isArray(block.correct) ? block.correct.map(Number) : [Number(block.correctIndex) || 0];
    normalized.pairs = Array.isArray(block.pairs) && block.pairs.length
      ? block.pairs.map((pair) => ({ item: String(pair.item || ''), target: String(pair.target || '') })).filter((pair) => pair.item && pair.target)
      : base.pairs;
    normalized.interactions = Array.isArray(block.interactions) ? block.interactions.map(normalizeAction) : [];
    normalized.richText = String(normalized.richText || '');
    return normalized;
  }

  function createTextToolbar() {
    return `
      <div class="word-toolbar" aria-label="Textformatierung">
        <div class="toolbar-group">
          <select data-cmd="fontName" title="Schriftart">
            <option value="Inter, system-ui, sans-serif">Aptos / Inter</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="Times New Roman, serif">Times</option>
            <option value="Courier New, monospace">Courier</option>
          </select>
          <select data-cmd="fontSize" title="Schriftgröße">
            <option value="2">12</option><option value="3" selected>16</option><option value="4">18</option><option value="5">24</option><option value="6">32</option>
          </select>
        </div>
        <div class="toolbar-group">
          <button class="tb" type="button" data-cmd="bold"><b>F</b></button>
          <button class="tb" type="button" data-cmd="italic"><i>K</i></button>
          <button class="tb" type="button" data-cmd="underline"><u>U</u></button>
          <button class="tb" type="button" data-cmd="insertUnorderedList">• Liste</button>
        </div>
        <div class="toolbar-group">
          <button class="tb" type="button" data-cmd="justifyLeft">Links</button>
          <button class="tb" type="button" data-cmd="justifyCenter">Mitte</button>
          <button class="tb" type="button" data-cmd="justifyRight">Rechts</button>
        </div>
        <div class="toolbar-group">
          <label>Schrift <input type="color" data-cmd="foreColor" value="#111827"></label>
          <label>Markierung <input type="color" data-cmd="hiliteColor" value="#fff59d"></label>
        </div>
      </div>`;
  }

  function bindTextToolbar(root = document) {
    root.querySelectorAll('[data-cmd]').forEach((control) => {
      const run = () => document.execCommand(control.dataset.cmd, false, control.value || null);
      if (control.tagName === 'BUTTON') control.addEventListener('click', run);
      else control.addEventListener('change', run);
    });
  }

  function renderMedia(media, className = 'preview-video') {
    if (!media) return '<p class="hint">Noch keine Video-URL oder Datei ausgewählt.</p>';
    if (isYoutube(media)) {
      return `<iframe class="${className} youtube-frame" src="${esc(ytEmbed(media))}" title="YouTube-Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    }
    return `<video class="${className}" src="${esc(media)}" controls></video>`;
  }

  function blockStyle(block) {
    const style = block.style || defaultStyle(block.type);
    return `left:${Number(style.x) || 0}px;top:${Number(style.y) || 0}px;width:${Number(style.width) || 300}px;height:${Number(style.height) || 140}px;z-index:${Number(style.z) || 1}`;
  }

  function renderChoice(block) {
    const multi = (block.correct || []).length > 1;
    return `
      <div data-run="choice">
        <h3>${esc(block.question)}</h3>
        <p>${esc(block.description || '')}</p>
        <div class="choice-stack">${(block.answers || []).map((answer, index) => `
          <label class="choice-option"><input type="${multi ? 'checkbox' : 'radio'}" name="choice-${esc(block.id)}" value="${index}"> <span>${esc(answer)}</span></label>
        `).join('')}</div>
        <button class="btn primary check-choice control-gap" type="button">Prüfen</button>
        <div class="feedback" hidden></div>
      </div>`;
  }

  function renderDragWords(block) {
    const words = [];
    const html = esc(block.dragText || '').replace(/\[([^\]]+)\]/g, (_, word) => {
      words.push(word);
      return `<span class="dtw-blank" data-answer="${esc(word)}"></span>`;
    });
    return `
      <div data-run="dragWords">
        <p class="dtw-text">${html}</p>
        <div class="word-bank">${words.map((word) => `<button class="chip" type="button" draggable="true">${esc(word)}</button>`).join('')}</div>
        <button class="btn primary check-dtw control-gap" type="button">Prüfen</button>
        <div class="feedback" hidden></div>
      </div>`;
  }

  function renderDragDrop(block) {
    const pairs = block.pairs || [];
    const targets = [...new Set(pairs.map((pair) => pair.target))];
    return `
      <div data-run="dragDrop">
        <p>${esc(block.description || 'Ziehe die Begriffe in die passenden Felder.')}</p>
        <div class="dnd-bank">${pairs.map((pair) => `<button class="dnd-item" type="button" draggable="true" data-target="${esc(pair.target)}">${esc(pair.item)}</button>`).join('')}</div>
        <div class="dnd-target-grid">${targets.map((target) => `<div class="dnd-target" data-target="${esc(target)}"><strong>${esc(target)}</strong></div>`).join('')}</div>
        <button class="btn primary check-dnd control-gap" type="button">Prüfen</button>
        <div class="feedback" hidden></div>
      </div>`;
  }

  function renderInteractiveVideo(block) {
    return `
      <div data-run="interactiveVideo">
        <div class="iv-stage" data-interactions="${esc(JSON.stringify(block.interactions || []))}">
          ${renderMedia(block.media, 'preview-video')}
          <div class="glass-overlay" hidden></div>
        </div>
        <p class="hint">${(block.interactions || []).length} Aktion(en). Zeitstopps funktionieren bei lokalen oder direkten Videodateien. YouTube wird eingebettet, aber nicht zuverlässig per Zeitmarke gesteuert.</p>
      </div>`;
  }

  function renderBlockContent(block, editable = true) {
    block = normalizeBlock(block);
    if (block.type === 'text') {
      return `<div class="rich-text" contenteditable="${editable}" data-rich-for="${esc(block.id)}">${block.richText || '<p>Text eingeben …</p>'}</div>`;
    }
    if (block.type === 'link') {
      return `<a class="link-box" href="${esc(block.url || '#')}" target="_blank" rel="noopener">${esc(block.linkText || 'Link öffnen')}</a>`;
    }
    if (block.type === 'image') {
      return block.media ? `<img class="media" src="${esc(block.media)}" alt="${esc(block.alt || '')}">` : '<p class="hint">Bild-URL oder Bilddatei rechts einfügen.</p>';
    }
    if (block.type === 'video') return renderMedia(block.media, 'preview-video');
    if (block.type === 'interactiveVideo') return renderInteractiveVideo(block);
    if (block.type === 'choice') return renderChoice(block);
    if (block.type === 'dragWords') return renderDragWords(block);
    if (block.type === 'dragDrop') return renderDragDrop(block);
    return `<p>${esc(block.label || typeLabel(block.type))}</p>`;
  }

  function attachRunHandlers(root = document, getData = () => null) {
    let dragged = null;
    root.querySelectorAll('.chip,.dnd-item').forEach((item) => {
      item.addEventListener('dragstart', () => { dragged = item; });
      item.addEventListener('click', () => { dragged = item; });
    });
    root.querySelectorAll('.dtw-blank').forEach((blank) => {
      const place = () => {
        if (!dragged || !dragged.classList.contains('chip')) return;
        blank.textContent = dragged.textContent;
        blank.dataset.filled = dragged.textContent;
        dragged.remove();
        dragged = null;
      };
      blank.addEventListener('dragover', (event) => event.preventDefault());
      blank.addEventListener('drop', place);
      blank.addEventListener('click', place);
    });
    root.querySelectorAll('.dnd-target').forEach((zone) => {
      const place = () => {
        if (!dragged || !dragged.classList.contains('dnd-item')) return;
        zone.appendChild(dragged);
        dragged = null;
      };
      zone.addEventListener('dragover', (event) => event.preventDefault());
      zone.addEventListener('drop', place);
      zone.addEventListener('click', place);
    });
    root.querySelectorAll('.check-choice').forEach((button) => {
      button.onclick = () => {
        const host = button.closest('[data-block-id], .single-preview, .iv-action-card');
        const block = getData(host?.dataset?.blockId) || window.__singleData || {};
        const correct = (block.correct || [0]).map(Number).sort((a, b) => a - b);
        const card = button.closest('[data-run="choice"]');
        const selected = [...card.querySelectorAll('input:checked')].map((input) => Number(input.value)).sort((a, b) => a - b);
        const ok = selected.length === correct.length && selected.every((value, index) => value === correct[index]);
        card.querySelectorAll('.choice-option').forEach((option, index) => {
          option.classList.toggle('is-correct', correct.includes(index));
          option.classList.toggle('is-wrong', selected.includes(index) && !correct.includes(index));
        });
        const feedback = card.querySelector('.feedback');
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = ok ? 'Richtig.' : 'Nicht ganz. Die richtige Antwort ist markiert.';
        }
      };
    });
    root.querySelectorAll('.check-dtw').forEach((button) => {
      button.onclick = () => {
        const card = button.closest('[data-run="dragWords"]');
        const blanks = [...card.querySelectorAll('.dtw-blank')];
        const ok = blanks.length && blanks.every((blank) => blank.dataset.filled === blank.dataset.answer);
        blanks.forEach((blank) => blank.classList.toggle('is-correct', blank.dataset.filled === blank.dataset.answer));
        const feedback = card.querySelector('.feedback');
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = ok ? 'Alles richtig.' : 'Noch nicht alles richtig.';
        }
      };
    });
    root.querySelectorAll('.check-dnd').forEach((button) => {
      button.onclick = () => {
        const card = button.closest('[data-run="dragDrop"]');
        const items = [...card.querySelectorAll('.dnd-target .dnd-item')];
        const all = card.querySelectorAll('.dnd-item').length;
        const ok = items.length === all && items.every((item) => item.dataset.target === item.parentElement.dataset.target);
        items.forEach((item) => item.classList.toggle('is-correct', item.dataset.target === item.parentElement.dataset.target));
        const feedback = card.querySelector('.feedback');
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = ok ? 'Alles richtig.' : 'Einige Zuordnungen stimmen noch nicht.';
        }
      };
    });
    attachInteractiveVideoRuntime(root);
  }

  function renderOverlayAction(action) {
    action = normalizeAction(action);
    if (action.type === 'dragWords') return renderDragWords(action);
    if (action.type === 'dragDrop') return renderDragDrop(action);
    return renderChoice(action);
  }

  function attachInteractiveVideoRuntime(root = document) {
    root.querySelectorAll('.iv-stage').forEach((stage) => {
      const video = stage.querySelector('video');
      const overlay = stage.querySelector('.glass-overlay');
      if (!video || !overlay) return;
      let actions = [];
      try { actions = JSON.parse(stage.dataset.interactions || '[]').map((item) => ({ ...normalizeAction(item), done: false })); } catch {}
      video.ontimeupdate = () => {
        const action = actions.find((item) => !item.done && video.currentTime >= Number(item.time));
        if (!action) return;
        action.done = true;
        video.pause();
        overlay.hidden = false;
        overlay.innerHTML = `<div class="iv-action-card"><h3>${esc(action.question)}</h3><p>${esc(action.description || '')}</p>${renderOverlayAction(action)}<button class="btn primary continue-video" type="button">Weiter</button></div>`;
        overlay.querySelector('.continue-video').onclick = () => {
          overlay.hidden = true;
          video.play().catch(() => {});
        };
        attachRunHandlers(overlay, () => action);
      };
    });
  }

  function initContainer(kind) {
    const label = kind === 'book' ? 'Seite' : 'Folie';
    const storeKey = `lite-${kind}-v${VERSION}`;
    let state = {
      title: kind === 'book' ? 'Interactive Book' : 'Course Presentation',
      stageWidth: kind === 'book' ? 1180 : 1280,
      stageHeight: kind === 'book' ? 760 : 720,
      pages: [defaultPage(1, label)],
      activePage: 0,
      selectedId: null
    };
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        state = { ...state, ...parsed };
      }
    } catch {}
    state.pages = (state.pages || []).map((page, index) => ({
      ...defaultPage(index + 1, label),
      ...page,
      blocks: Array.isArray(page.blocks) ? page.blocks.map(normalizeBlock) : []
    }));
    if (!state.pages.length) state.pages = [defaultPage(1, label)];

    const current = () => state.pages[state.activePage];
    const findBlock = (id) => current()?.blocks.find((block) => block.id === id) || null;
    const selected = () => findBlock(state.selectedId);
    const save = () => localStorage.setItem(storeKey, JSON.stringify(state));

    function addBlock(type) {
      const offset = (current().blocks.length % 5) * 28;
      const block = defaultBlock(type, { x: 70 + offset, y: 90 + offset });
      current().blocks.push(block);
      state.selectedId = block.id;
      save();
      render();
    }

    function setActivePage(index) {
      state.activePage = Math.max(0, Math.min(state.pages.length - 1, index));
      state.selectedId = null;
      save();
      render();
    }

    function insertBar() {
      return `
        <div class="insert-bar clean-insert-bar">
          <span class="insert-label">Einfügen</span>
          <button type="button" data-add="text">Textbox</button>
          <button type="button" data-add="link">Link</button>
          <button type="button" data-add="image">Bild</button>
          <button type="button" data-add="video">Video</button>
          <button type="button" data-add="interactiveVideo">Interaktives Video</button>
          <button type="button" data-add="choice">Choice</button>
          <button type="button" data-add="dragWords">Drag the Words</button>
          <button type="button" data-add="dragDrop">Drag and Drop</button>
          <span class="insert-spacer"></span>
          <label>Breite <input id="stageW" type="number" min="700" value="${Number(state.stageWidth) || 1280}"></label>
          <label>Höhe <input id="stageH" type="number" min="420" value="${Number(state.stageHeight) || 720}"></label>
          <button id="exportZip" class="primary" type="button">HTML-ZIP herunterladen</button>
        </div>`;
    }

    function progress() {
      const total = Math.max(1, state.pages.length);
      const percent = ((state.activePage + 1) / total) * 100;
      return `
        <div class="slide-progress" aria-label="Fortschritt">
          <div class="slide-progress-bar" style="width:${percent}%"></div>
        </div>
        <p class="slide-count">${label} ${state.activePage + 1} von ${total}</p>`;
    }

    function render() {
      const page = current();
      const modeClass = kind === 'book' ? 'book-editor-mode' : 'presentation-editor-mode';
      app.innerHTML = `
        <section class="container-editor ${modeClass}">
          ${insertBar()}
          ${createTextToolbar()}
          <div class="container-grid ${kind === 'book' ? 'book-container-grid' : ''}">
            <aside class="pages-panel ${kind === 'book' ? 'book-tabs' : ''}">
              <h2>${kind === 'book' ? 'Buchseiten' : 'Folien'}</h2>
              <div class="page-list">
                ${state.pages.map((item, index) => `<button class="page-tab ${index === state.activePage ? 'is-active' : ''}" type="button" data-page="${index}"><span>${esc(item.title || `${label} ${index + 1}`)}</span></button>`).join('')}
              </div>
              <button id="addPage" class="btn" type="button">${label} hinzufügen</button>
            </aside>
            <main class="stage-column">
              ${progress()}
              <input class="title-input" id="pageTitle" value="${esc(page.title)}" aria-label="${label}titel">
              <div class="stage-frame ${kind === 'book' ? 'book-frame' : 'presentation-frame'}">
                <button class="stage-arrow stage-arrow-left" id="prevPage" type="button" aria-label="Vorherige ${label}" ${state.activePage === 0 ? 'disabled' : ''}>‹</button>
                <div class="stage" id="stage" style="width:${Number(state.stageWidth) || 1280}px;height:${Number(state.stageHeight) || 720}px;">
                  ${page.blocks.map((block) => `<article class="free-block ${state.selectedId === block.id ? 'is-selected' : ''}" data-block-id="${esc(block.id)}" style="${blockStyle(block)}"><div class="drag-handle" title="Zum Verschieben ziehen">${esc(typeLabel(block.type))}</div><div class="free-content">${renderBlockContent(block, true)}</div></article>`).join('')}
                </div>
                <button class="stage-arrow stage-arrow-right" id="nextPage" type="button" aria-label="Nächste ${label}" ${state.activePage === state.pages.length - 1 ? 'disabled' : ''}>›</button>
              </div>
            </main>
            <aside class="property-panel edge-panel"><h2>Element bearbeiten</h2><div id="props">${renderProps(selected())}</div></aside>
          </div>
        </section>`;
      bindEvents();
      bindTextToolbar(app);
      attachRunHandlers(app, findBlock);
    }

    function renderProps(block) {
      if (!block) return `<p class="hint">Wähle ein Element auf der ${label.toLowerCase()} aus.</p>`;
      const style = block.style || defaultStyle(block.type);
      return `
        <div class="prop-grid compact-props">
          <label>X <input data-style="x" type="number" value="${Number(style.x) || 0}"></label>
          <label>Y <input data-style="y" type="number" value="${Number(style.y) || 0}"></label>
          <label>Breite <input data-style="width" type="number" value="${Number(style.width) || 300}"></label>
          <label>Höhe <input data-style="height" type="number" value="${Number(style.height) || 160}"></label>
        </div>
        ${typeProps(block)}
        <button id="deleteBlock" class="btn danger" type="button">Element löschen</button>`;
    }

    function typeProps(block) {
      if (block.type === 'link') {
        return `<label>Linktext <input data-field="linkText" value="${esc(block.linkText || '')}"></label><label>URL <input data-field="url" value="${esc(block.url || '')}"></label>`;
      }
      if (block.type === 'image') {
        return `<label>Bild-URL <input data-field="media" value="${esc(block.media || '')}"></label><label>Bilddatei auswählen <input data-file="media" type="file" accept="image/*"></label><label>Alternativtext <input data-field="alt" value="${esc(block.alt || '')}"></label>`;
      }
      if (block.type === 'video' || block.type === 'interactiveVideo') {
        return `<label>Video-URL oder YouTube-Link <input data-field="media" value="${esc(block.media || '')}"></label><label>Videodatei auswählen <input data-file="media" type="file" accept="video/*"></label>${block.type === 'interactiveVideo' ? actionProps(block) : ''}`;
      }
      if (block.type === 'choice') {
        return choiceProps(block);
      }
      if (block.type === 'dragWords') {
        return `<label>Text mit [Lücken] <textarea data-field="dragText">${esc(block.dragText || '')}</textarea></label>`;
      }
      if (block.type === 'dragDrop') {
        return `<label>Paare: Begriff | Zielbereich <textarea data-pairs>${esc((block.pairs || []).map((pair) => `${pair.item} | ${pair.target}`).join('\n'))}</textarea></label>`;
      }
      return `<p class="hint">Text wird direkt in der Box bearbeitet. Markiere Text und nutze die Leiste oben.</p>`;
    }

    function choiceProps(block) {
      return `
        <label>Frage <input data-field="question" value="${esc(block.question || '')}"></label>
        <label>Beschreibung <textarea data-field="description">${esc(block.description || '')}</textarea></label>
        <label>Antworten, je eine Zeile <textarea data-list="answers">${esc((block.answers || []).join('\n'))}</textarea></label>
        <label>Richtige Antwort(en), Nummern ab 0 <input data-correct value="${esc((block.correct || [0]).join(','))}"></label>`;
    }

    function actionProps(block) {
      const rows = (block.interactions || []).map((action, index) => `<button type="button" class="action-pill ${index === 0 ? 'is-active' : ''}" data-action-select="${index}">${Number(action.time).toFixed(1)}s · ${esc(typeLabel(action.type))}</button>`).join('');
      return `
        <div class="props-section">
          <h3>Videoaktionen</h3>
          <div class="action-pill-list">${rows || '<p class="hint">Noch keine Aktion.</p>'}</div>
          <button class="btn small" type="button" data-add-inner-action="choice">Choice-Aktion hinzufügen</button>
        </div>`;
    }

    async function bindFieldFile(input) {
      const block = selected();
      if (!block || !input.files?.[0]) return;
      block[input.dataset.file] = await dataUrlFromFile(input.files[0]);
      save();
      render();
    }

    function updateSelectedClass() {
      app.querySelectorAll('.free-block').forEach((element) => element.classList.toggle('is-selected', element.dataset.blockId === state.selectedId));
      const props = app.querySelector('#props');
      if (props) props.innerHTML = renderProps(selected());
      bindPropsOnly();
    }

    function bindPropsOnly() {
      app.querySelectorAll('[data-style]').forEach((input) => {
        input.oninput = () => {
          const block = selected();
          if (!block) return;
          block.style[input.dataset.style] = Number(input.value) || 0;
          const element = app.querySelector(`[data-block-id="${CSS.escape(block.id)}"]`);
          if (element) {
            if (input.dataset.style === 'x') element.style.left = `${block.style.x}px`;
            if (input.dataset.style === 'y') element.style.top = `${block.style.y}px`;
            if (input.dataset.style === 'width') element.style.width = `${block.style.width}px`;
            if (input.dataset.style === 'height') element.style.height = `${block.style.height}px`;
          }
          save();
        };
      });
      app.querySelectorAll('[data-field]').forEach((input) => {
        input.oninput = () => {
          const block = selected();
          if (!block) return;
          block[input.dataset.field] = input.value;
          save();
          const element = app.querySelector(`[data-block-id="${CSS.escape(block.id)}"] .free-content`);
          if (element && ['linkText', 'url', 'media', 'question', 'description'].includes(input.dataset.field)) element.innerHTML = renderBlockContent(block, true);
          attachRunHandlers(app, findBlock);
        };
      });
      app.querySelectorAll('[data-list]').forEach((input) => {
        input.oninput = () => {
          const block = selected();
          if (!block) return;
          block[input.dataset.list] = input.value.split('\n').map((item) => item.trim()).filter(Boolean);
          save();
        };
      });
      app.querySelector('[data-correct]')?.addEventListener('input', (event) => {
        const block = selected();
        if (!block) return;
        block.correct = event.target.value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite);
        save();
      });
      app.querySelector('[data-pairs]')?.addEventListener('input', (event) => {
        const block = selected();
        if (!block) return;
        block.pairs = event.target.value.split('\n').map((line) => {
          const [item, target] = line.split('|').map((part) => part?.trim());
          return { item, target };
        }).filter((pair) => pair.item && pair.target);
        save();
      });
      app.querySelectorAll('[data-file]').forEach((input) => input.onchange = () => bindFieldFile(input));
      app.querySelector('#deleteBlock')?.addEventListener('click', () => {
        const page = current();
        page.blocks = page.blocks.filter((block) => block.id !== state.selectedId);
        state.selectedId = null;
        save();
        render();
      });
    }

    function bindEvents() {
      app.querySelectorAll('[data-add]').forEach((button) => button.onclick = () => addBlock(button.dataset.add));
      app.querySelector('#addPage').onclick = () => {
        state.pages.push(defaultPage(state.pages.length + 1, label));
        setActivePage(state.pages.length - 1);
      };
      app.querySelectorAll('[data-page]').forEach((button) => button.onclick = () => setActivePage(Number(button.dataset.page)));
      app.querySelector('#prevPage').onclick = () => setActivePage(state.activePage - 1);
      app.querySelector('#nextPage').onclick = () => setActivePage(state.activePage + 1);
      app.querySelector('#pageTitle').oninput = (event) => {
        current().title = event.target.value;
        const activeTab = app.querySelector('.page-tab.is-active span');
        if (activeTab) activeTab.textContent = event.target.value;
        save();
      };
      app.querySelector('#stageW').onchange = (event) => {
        state.stageWidth = Number(event.target.value) || state.stageWidth;
        save();
        render();
      };
      app.querySelector('#stageH').onchange = (event) => {
        state.stageHeight = Number(event.target.value) || state.stageHeight;
        save();
        render();
      };
      app.querySelector('#exportZip').onclick = () => downloadActivityZip({ kind, title: state.title, pages: state.pages, stageWidth: state.stageWidth, stageHeight: state.stageHeight }, `${kind}-export`);
      app.querySelector('#stage').addEventListener('click', (event) => {
        if (event.target.id !== 'stage') return;
        state.selectedId = null;
        save();
        updateSelectedClass();
      });
      app.querySelectorAll('.free-block').forEach((element) => {
        const block = findBlock(element.dataset.blockId);
        const handle = element.querySelector('.drag-handle');
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          state.selectedId = block.id;
          save();
          updateSelectedClass();
        });
        element.querySelectorAll('[contenteditable="true"]').forEach((editable) => {
          editable.addEventListener('input', () => {
            block.richText = editable.innerHTML;
            save();
          });
        });
        let start = null;
        handle.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          start = { px: event.clientX, py: event.clientY, x: Number(block.style.x) || 0, y: Number(block.style.y) || 0 };
          handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener('pointermove', (event) => {
          if (!start) return;
          block.style.x = Math.max(0, Math.round(start.x + event.clientX - start.px));
          block.style.y = Math.max(0, Math.round(start.y + event.clientY - start.py));
          element.style.left = `${block.style.x}px`;
          element.style.top = `${block.style.y}px`;
        });
        handle.addEventListener('pointerup', () => {
          if (!start) return;
          start = null;
          save();
          updateSelectedClass();
        });
        element.addEventListener('mouseup', () => {
          const rect = element.getBoundingClientRect();
          block.style.width = Math.round(rect.width);
          block.style.height = Math.round(rect.height);
          save();
        });
      });
      bindPropsOnly();
    }

    render();
  }

  function initSingle(type) {
    const storeKey = `lite-single-${type}-v${VERSION}`;
    let data = defaultBlock(type === 'choice' ? 'choice' : type);
    if (type === 'interactiveVideo') data = defaultBlock('interactiveVideo', { width: 760, height: 440 });
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved) data = { ...data, ...JSON.parse(saved) };
    } catch {}
    data = normalizeBlock(data);
    window.__singleData = data;
    const save = () => { localStorage.setItem(storeKey, JSON.stringify(data)); window.__singleData = data; };

    function render() {
      if (type === 'interactiveVideo') renderInteractiveVideoEditor();
      else renderSimpleSingle();
      attachRunHandlers(app, () => data);
    }

    function renderSimpleSingle() {
      app.innerHTML = `
        <section class="single-layout">
          <div class="panel single-preview"><h2>Vorschau</h2>${renderBlockContent(data, false)}</div>
          <aside class="panel"><h2>Bearbeiten</h2>${singleProps(data)}<button id="exportZip" class="btn primary" type="button">HTML-ZIP herunterladen</button></aside>
        </section>`;
      bindSingleProps();
    }

    function singleProps(block) {
      if (block.type === 'choice') return `<label>Frage <input data-field="question" value="${esc(block.question)}"></label><label>Beschreibung <textarea data-field="description">${esc(block.description)}</textarea></label><label>Antworten <textarea data-list="answers">${esc(block.answers.join('\n'))}</textarea></label><label>Richtig, Nummern ab 0 <input data-correct value="${esc(block.correct.join(','))}"></label>`;
      if (block.type === 'dragWords') return `<label>Text mit [Lücken] <textarea data-field="dragText">${esc(block.dragText)}</textarea></label>`;
      if (block.type === 'dragDrop') return `<label>Paare: Begriff | Zielbereich <textarea data-pairs>${esc(block.pairs.map((pair) => `${pair.item} | ${pair.target}`).join('\n'))}</textarea></label>`;
      return '';
    }

    function bindSingleProps() {
      app.querySelectorAll('[data-field]').forEach((input) => input.oninput = () => { data[input.dataset.field] = input.value; save(); render(); });
      app.querySelectorAll('[data-list]').forEach((input) => input.oninput = () => { data[input.dataset.list] = input.value.split('\n').map((item) => item.trim()).filter(Boolean); save(); render(); });
      app.querySelector('[data-correct]')?.addEventListener('input', (event) => { data.correct = event.target.value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite); save(); });
      app.querySelector('[data-pairs]')?.addEventListener('input', (event) => { data.pairs = event.target.value.split('\n').map((line) => { const [item, target] = line.split('|').map((part) => part?.trim()); return { item, target }; }).filter((pair) => pair.item && pair.target); save(); render(); });
      app.querySelector('#exportZip').onclick = () => downloadActivityZip({ kind: type, title: typeLabel(type), pages: [{ title: typeLabel(type), blocks: [data] }] }, `${type}-export`);
    }

    function renderInteractiveVideoEditor(selectedActionIndex = 0) {
      const currentAction = data.interactions[selectedActionIndex] || null;
      app.innerHTML = `
        <section class="iv-editor-layout">
          <div class="panel iv-preview-panel">
            <h2>Interaktives Video</h2>
            <div class="iv-stage editor-iv-stage" data-interactions="${esc(JSON.stringify(data.interactions || []))}">${renderMedia(data.media, 'preview-video')}<div class="glass-overlay" hidden></div></div>
            <div class="button-row"><button id="takeTime" class="btn" type="button">Aktuelle Zeit übernehmen</button><span id="currentTimeReadout" class="hint">Aktuelle Zeit: 0.0s</span></div>
          </div>
          <aside class="panel iv-settings-panel">
            <h2>Video</h2>
            <label>Video-URL oder YouTube-Link <input id="videoSource" value="${esc(data.media || '')}"></label>
            <label>Lokale Videodatei <input id="videoFile" type="file" accept="video/*"></label>
            <p class="hint">Für Zeitstopps sind lokale oder direkte Videodateien am zuverlässigsten. YouTube wird als iframe angezeigt.</p>
            <div class="props-section">
              <h2>Aktionen</h2>
              <div class="action-list">${(data.interactions || []).map((action, index) => `<button class="action-pill ${index === selectedActionIndex ? 'is-active' : ''}" type="button" data-action-index="${index}">${Number(action.time).toFixed(1)}s · ${esc(typeLabel(action.type))}</button>`).join('')}</div>
              <div class="button-row"><select id="newActionType"><option value="choice">Single & Multiple Choice</option><option value="dragWords">Drag the Words</option><option value="dragDrop">Drag and Drop</option></select><button id="addAction" class="btn" type="button">Aktion hinzufügen</button></div>
            </div>
            <div id="actionEditor">${renderActionEditor(currentAction, selectedActionIndex)}</div>
            <button id="exportZip" class="btn primary" type="button">HTML-ZIP herunterladen</button>
          </aside>
        </section>`;
      bindInteractiveVideoEditor(selectedActionIndex);
      attachRunHandlers(app, () => data);
    }

    function renderActionEditor(action, index) {
      if (!action) return '<p class="hint">Lege eine Aktion an oder wähle eine bestehende Aktion aus.</p>';
      action = normalizeAction(action);
      return `
        <div class="props-section">
          <h2>Aktion bearbeiten</h2>
          <label>Sekunde <input data-action="time" type="number" step="0.1" value="${Number(action.time)}"></label>
          <label>Typ <select data-action="type"><option ${action.type === 'choice' ? 'selected' : ''} value="choice">Single & Multiple Choice</option><option ${action.type === 'dragWords' ? 'selected' : ''} value="dragWords">Drag the Words</option><option ${action.type === 'dragDrop' ? 'selected' : ''} value="dragDrop">Drag and Drop</option></select></label>
          <label>Frage <input data-action="question" value="${esc(action.question)}"></label>
          <label>Beschreibung <textarea data-action="description">${esc(action.description)}</textarea></label>
          ${action.type === 'choice' ? `<label>Antworten <textarea data-action-list="answers">${esc(action.answers.join('\n'))}</textarea></label><label>Richtig, Nummern ab 0 <input data-action-correct value="${esc(action.correct.join(','))}"></label>` : ''}
          ${action.type === 'dragWords' ? `<label>Text mit [Lücken] <textarea data-action="dragText">${esc(action.dragText)}</textarea></label>` : ''}
          ${action.type === 'dragDrop' ? `<label>Paare: Begriff | Zielbereich <textarea data-action-pairs>${esc(action.pairs.map((pair) => `${pair.item} | ${pair.target}`).join('\n'))}</textarea></label>` : ''}
          <button id="deleteAction" class="btn danger" type="button">Aktion löschen</button>
        </div>`;
    }

    function bindInteractiveVideoEditor(selectedActionIndex) {
      const video = app.querySelector('video');
      const readout = app.querySelector('#currentTimeReadout');
      if (video && readout) video.ontimeupdate = () => { readout.textContent = `Aktuelle Zeit: ${video.currentTime.toFixed(1)}s`; };
      app.querySelector('#videoSource').oninput = (event) => { data.media = event.target.value; save(); };
      app.querySelector('#videoSource').onchange = () => renderInteractiveVideoEditor(selectedActionIndex);
      app.querySelector('#videoFile').onchange = async (event) => {
        if (!event.target.files?.[0]) return;
        data.media = await dataUrlFromFile(event.target.files[0]);
        save();
        renderInteractiveVideoEditor(selectedActionIndex);
      };
      app.querySelector('#takeTime').onclick = () => {
        if (!video || !data.interactions[selectedActionIndex]) return;
        data.interactions[selectedActionIndex].time = Number(video.currentTime.toFixed(1));
        save();
        renderInteractiveVideoEditor(selectedActionIndex);
      };
      app.querySelectorAll('[data-action-index]').forEach((button) => button.onclick = () => renderInteractiveVideoEditor(Number(button.dataset.actionIndex)));
      app.querySelector('#addAction').onclick = () => {
        data.interactions.push(defaultAction(app.querySelector('#newActionType').value));
        save();
        renderInteractiveVideoEditor(data.interactions.length - 1);
      };
      const action = data.interactions[selectedActionIndex];
      app.querySelectorAll('[data-action]').forEach((input) => {
        input.oninput = () => {
          if (!action) return;
          action[input.dataset.action] = input.dataset.action === 'time' ? Number(input.value) || 0 : input.value;
          if (input.dataset.action === 'type') Object.assign(action, normalizeAction({ ...action, type: input.value }));
          save();
        };
        if (input.dataset.action === 'type') input.onchange = () => renderInteractiveVideoEditor(selectedActionIndex);
      });
      app.querySelectorAll('[data-action-list]').forEach((input) => input.oninput = () => { if (!action) return; action[input.dataset.actionList] = input.value.split('\n').map((item) => item.trim()).filter(Boolean); save(); });
      app.querySelector('[data-action-correct]')?.addEventListener('input', (event) => { if (!action) return; action.correct = event.target.value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite); save(); });
      app.querySelector('[data-action-pairs]')?.addEventListener('input', (event) => { if (!action) return; action.pairs = event.target.value.split('\n').map((line) => { const [item, target] = line.split('|').map((part) => part?.trim()); return { item, target }; }).filter((pair) => pair.item && pair.target); save(); });
      app.querySelector('#deleteAction')?.addEventListener('click', () => { data.interactions.splice(selectedActionIndex, 1); save(); renderInteractiveVideoEditor(Math.max(0, selectedActionIndex - 1)); });
      app.querySelector('#exportZip').onclick = () => downloadActivityZip({ kind: type, title: 'Interaktives Video', pages: [{ title: 'Interaktives Video', blocks: [data] }] }, 'interactive-video-export');
    }

    render();
  }

  function exportData(data) { return `window.ACTIVITY_DATA = ${JSON.stringify(data, null, 2)};`; }
  function exportIndex(data) {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(data.title || 'Aktivität')}</title><link rel="stylesheet" href="activity-style.css"></head><body><main class="export-shell"><section class="export-hero"><p class="eyebrow">Exportierte Aktivität</p><h1>${esc(data.title || 'Aktivität')}</h1></section><section id="viewer"></section><div class="export-nav"><button id="prev" type="button">Zurück</button><span id="count"></span><button id="next" type="button">Weiter</button></div></main><script src="activity-data.js"></script><script src="activity-runtime.js"></script></body></html>`;
  }
  function exportCss() {
    return `body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fff;color:#111827;padding:32px}.export-shell{max-width:1280px;margin:0 auto}.export-hero,.export-page{border:1.3px solid rgba(17,24,39,.65);padding:28px 32px;margin-bottom:24px;box-shadow:8px 16px 28px rgba(17,24,39,.08)}.eyebrow{font-size:.78rem;text-transform:uppercase;letter-spacing:.14em;color:#5f6876;font-weight:850}h1{font-size:clamp(2rem,4vw,4rem);line-height:1;margin:0 0 12px}.export-stage{position:relative;background:#fff;border:1px solid rgba(17,24,39,.28);margin:0 auto;overflow:auto}.free-block{position:absolute;border:1.3px solid rgba(17,24,39,.34);background:#fff;padding:16px;overflow:auto}.media{max-width:100%;max-height:100%;display:block}.preview-video,.youtube-frame{width:100%;height:100%;min-height:260px;background:#111}.choice-stack{display:grid;gap:12px;margin:18px 0}.choice-option{border:1px solid rgba(17,24,39,.25);padding:12px 14px}.word-bank,.dnd-bank{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0 24px}.chip,.dnd-item{border:1px solid rgba(17,24,39,.34);background:#fff;border-radius:999px;padding:10px 14px;font-weight:800}.dtw-blank{display:inline-flex;min-width:110px;min-height:34px;border:1.4px dashed #2f5f8f;background:#e8f2fb;margin:0 5px 8px}.dnd-target-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:18px;margin:24px 0 28px}.dnd-target{min-height:150px;padding:16px;border:1.5px dashed #2f5f8f;background:#e8f2fb}.feedback{margin-top:18px;padding:14px;background:#e8f2fb;border:1px solid rgba(47,95,143,.3)}.iv-stage{position:relative;width:100%;height:100%}.glass-overlay{position:absolute;left:6%;right:6%;bottom:8%;padding:24px;background:rgba(255,255,255,.78);backdrop-filter:blur(14px);box-shadow:0 18px 40px rgba(17,24,39,.2)}.export-nav{display:flex;gap:12px;align-items:center}.export-nav button,button{border:1px solid rgba(47,95,143,.35);background:#e8f2fb;color:#173d63;font-weight:850;padding:12px 16px;cursor:pointer}.slide-progress{height:8px;background:#e5e7eb;margin:0 0 18px}.slide-progress-bar{height:100%;background:#2f5f8f}`;
  }

  function exportRuntime() {
    return `(() => { const DATA = window.ACTIVITY_DATA || {}; const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); const isYoutube = u => /(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|youtube\\.com\\/embed\\/)/i.test(u||''); const ytId = u => { const m = String(u||'').match(/(?:v=|youtu\\.be\\/|embed\\/)([A-Za-z0-9_-]{6,})/); return m ? m[1] : ''; }; let active = 0; const viewer = document.getElementById('viewer'); function media(src){ if(!src) return '<p>Kein Medium.</p>'; if(isYoutube(src)) return '<iframe class="youtube-frame" src="https://www.youtube.com/embed/'+esc(ytId(src))+'?rel=0" allowfullscreen></iframe>'; return '<video class="preview-video" src="'+esc(src)+'" controls></video>'; } function choice(b){ const multi=(b.correct||[]).length>1; return '<div data-run="choice"><h3>'+esc(b.question)+'</h3><p>'+esc(b.description||'')+'</p><div class="choice-stack">'+(b.answers||[]).map((a,i)=>'<label class="choice-option"><input type="'+(multi?'checkbox':'radio')+'" name="c'+esc(b.id)+'" value="'+i+'"> '+esc(a)+'</label>').join('')+'</div><button class="check-choice">Prüfen</button><div class="feedback" hidden></div></div>'; } function dragWords(b){ let words=[]; const html=esc(b.dragText||'').replace(/\\[([^\\]]+)\\]/g,(_,w)=>{words.push(w);return '<span class="dtw-blank" data-answer="'+esc(w)+'"></span>'}); return '<div data-run="dragWords"><p>'+html+'</p><div class="word-bank">'+words.map(w=>'<button class="chip" draggable="true">'+esc(w)+'</button>').join('')+'</div><button class="check-dtw">Prüfen</button><div class="feedback" hidden></div></div>'; } function dragDrop(b){ const targets=[...new Set((b.pairs||[]).map(p=>p.target))]; return '<div data-run="dragDrop"><p>'+esc(b.description||'')+'</p><div class="dnd-bank">'+(b.pairs||[]).map(p=>'<button class="dnd-item" draggable="true" data-target="'+esc(p.target)+'">'+esc(p.item)+'</button>').join('')+'</div><div class="dnd-target-grid">'+targets.map(t=>'<div class="dnd-target" data-target="'+esc(t)+'"><strong>'+esc(t)+'</strong></div>').join('')+'</div><button class="check-dnd">Prüfen</button><div class="feedback" hidden></div></div>'; } function content(b){ if(b.type==='text') return b.richText||''; if(b.type==='link') return '<a href="'+esc(b.url||'#')+'" target="_blank">'+esc(b.linkText||'Link öffnen')+'</a>'; if(b.type==='image') return b.media?'<img class="media" src="'+esc(b.media)+'" alt="'+esc(b.alt||'')+'">':'<p>Kein Bild.</p>'; if(b.type==='video') return media(b.media); if(b.type==='interactiveVideo') return '<div class="iv-stage" data-interactions="'+esc(JSON.stringify(b.interactions||[]))+'">'+media(b.media)+'<div class="glass-overlay" hidden></div></div>'; if(b.type==='choice') return choice(b); if(b.type==='dragWords') return dragWords(b); if(b.type==='dragDrop') return dragDrop(b); return ''; } function render(){ const pages=DATA.pages||[]; const page=pages[Math.max(0,Math.min(active,pages.length-1))]||{title:DATA.title||'Aktivität',blocks:[]}; const pct=pages.length?((active+1)/pages.length)*100:100; viewer.innerHTML='<div class="slide-progress"><div class="slide-progress-bar" style="width:'+pct+'%"></div></div><section class="export-page"><h2>'+esc(page.title||'Seite')+'</h2><div class="export-stage" style="width:'+(DATA.stageWidth||1180)+'px;height:'+(DATA.stageHeight||720)+'px">'+(page.blocks||[]).map(b=>'<article class="free-block" data-block-id="'+esc(b.id)+'" style="left:'+(b.style?.x||0)+'px;top:'+(b.style?.y||0)+'px;width:'+(b.style?.width||320)+'px;height:'+(b.style?.height||160)+'px">'+content(b)+'</article>').join('')+'</div></section>'; const c=document.getElementById('count'); if(c)c.textContent=pages.length?(active+1)+' von '+pages.length:''; attach(); } function attach(){ let dragged=null; document.querySelectorAll('.chip,.dnd-item').forEach(el=>{el.ondragstart=()=>dragged=el; el.onclick=()=>dragged=el;}); document.querySelectorAll('.dtw-blank').forEach(blank=>{const place=()=>{if(dragged?.classList.contains('chip')){blank.textContent=dragged.textContent; blank.dataset.filled=dragged.textContent; dragged.remove(); dragged=null;}}; blank.ondragover=e=>e.preventDefault(); blank.ondrop=place; blank.onclick=place;}); document.querySelectorAll('.dnd-target').forEach(zone=>{const place=()=>{if(dragged?.classList.contains('dnd-item')){zone.appendChild(dragged); dragged=null;}}; zone.ondragover=e=>e.preventDefault(); zone.ondrop=place; zone.onclick=place;}); document.querySelectorAll('.check-choice,.check-dtw,.check-dnd').forEach(btn=>btn.onclick=()=>{const f=btn.parentElement.querySelector('.feedback'); if(f){f.hidden=false; f.textContent='Eingabe gespeichert/geprüft.';}}); document.querySelectorAll('.iv-stage').forEach(stage=>{const video=stage.querySelector('video'); const overlay=stage.querySelector('.glass-overlay'); if(!video||!overlay)return; let actions=[]; try{actions=JSON.parse(stage.dataset.interactions||'[]').map(x=>({...x,done:false}));}catch{} video.ontimeupdate=()=>{const a=actions.find(x=>!x.done&&video.currentTime>=Number(x.time)); if(!a)return; a.done=true; video.pause(); overlay.hidden=false; overlay.innerHTML='<h3>'+esc(a.question)+'</h3><p>'+esc(a.description||'')+'</p><button>Weiter</button>'; overlay.querySelector('button').onclick=()=>{overlay.hidden=true; video.play().catch(()=>{});};};}); } document.getElementById('prev')?.addEventListener('click',()=>{active=Math.max(0,active-1);render();}); document.getElementById('next')?.addEventListener('click',()=>{active=Math.min((DATA.pages||[]).length-1,active+1);render();}); render(); })();`;
  }

  function downloadActivityZip(data, name) {
    const files = [
      { name: 'index.html', content: exportIndex(data) },
      { name: 'activity-data.js', content: exportData(data) },
      { name: 'activity-runtime.js', content: exportRuntime() },
      { name: 'activity-style.css', content: exportCss() },
      { name: 'README.txt', content: 'index.html öffnen. Lokale Video- und Bilddateien werden als Data-URL in activity-data.js gespeichert. YouTube-Links bleiben als URL erhalten.' }
    ];
    downloadZip(`${name || 'activity'}-export.zip`, files);
  }

  function makeZip(files) {
    const encoder = new TextEncoder();
    const crcTable = (() => {
      const table = [];
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
      }
      return table;
    })();
    const crc32 = (bytes) => {
      let c = 0xffffffff;
      for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const u16 = (arr, value) => arr.push(value & 255, (value >>> 8) & 255);
    const u32 = (arr, value) => arr.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
    let parts = [], central = [], offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const crc = crc32(data);
      const local = [];
      u32(local, 0x04034b50); u16(local, 20); u16(local, 0); u16(local, 0); u16(local, 0); u16(local, 0); u32(local, crc); u32(local, data.length); u32(local, data.length); u16(local, name.length); u16(local, 0);
      parts.push(new Uint8Array(local), name, data);
      const cen = [];
      u32(cen, 0x02014b50); u16(cen, 20); u16(cen, 20); u16(cen, 0); u16(cen, 0); u16(cen, 0); u16(cen, 0); u32(cen, crc); u32(cen, data.length); u32(cen, data.length); u16(cen, name.length); u16(cen, 0); u16(cen, 0); u16(cen, 0); u16(cen, 0); u32(cen, 0); u32(cen, offset);
      central.push(new Uint8Array(cen), name);
      offset += local.length + name.length + data.length;
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length); u32(end, centralSize); u32(end, offset); u16(end, 0);
    return new Blob([...parts, ...central, new Uint8Array(end)], { type: 'application/zip' });
  }

  function downloadZip(name, files) {
    const url = URL.createObjectURL(makeZip(files));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (editorType === 'course') initContainer('course');
  if (editorType === 'book') initContainer('book');
  if (editorType === 'choice') initSingle('choice');
  if (editorType === 'drag-words') initSingle('dragWords');
  if (editorType === 'drag-drop') initSingle('dragDrop');
  if (editorType === 'interactive-video') initSingle('interactiveVideo');
})();
