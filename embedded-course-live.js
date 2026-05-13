
(() => {
  const DATA = window.EMBEDDED_COURSE_DATA || {};
  const root = document.querySelector('[data-embedded-course-root]');
  if (!root) return;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const isYoutube = (u) => /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i.test(u || '');
  const ytId = (u) => { const m = String(u || '').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/); return m ? m[1] : ''; };
  let active = 0;
  const viewer = root.querySelector('[data-embedded-course-viewer]');
  const prev = root.querySelector('[data-embedded-course-prev]');
  const next = root.querySelector('[data-embedded-course-next]');
  const count = root.querySelector('[data-embedded-course-count]');

  function media(src) {
    if (!src) return '<p class="embedded-note">Kein Medium hinterlegt.</p>';
    if (isYoutube(src)) return '<iframe class="embedded-youtube-frame" src="https://www.youtube.com/embed/' + esc(ytId(src)) + '?rel=0" allowfullscreen title="YouTube Video"></iframe>';
    return '<video class="embedded-preview-video" src="' + esc(src) + '" controls></video>';
  }

  function choice(block) {
    const answers = Array.isArray(block.answers) ? block.answers : [];
    const correct = Array.isArray(block.correct) ? block.correct.map(Number) : [];
    const multi = correct.length > 1;
    return '<div class="embedded-activity" data-run="choice" data-correct="' + esc(JSON.stringify(correct)) + '">' +
      '<h3>' + esc(block.question || 'Frage') + '</h3>' +
      '<p>' + esc(block.description || '') + '</p>' +
      '<div class="embedded-choice-stack">' + answers.map((answer, index) =>
        '<label class="embedded-choice-option"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="embedded-choice-' + esc(block.id) + '" value="' + index + '"> ' + esc(answer) + '</label>'
      ).join('') + '</div>' +
      '<button class="embedded-check-choice" type="button">Prüfen</button>' +
      '<div class="embedded-feedback" hidden></div>' +
    '</div>';
  }

  function dragWords(block) {
    const words = [];
    const html = esc(block.dragText || '').replace(/\[([^\]]+)\]/g, (_, word) => {
      words.push(word);
      return '<span class="embedded-dtw-blank" data-answer="' + esc(word) + '"></span>';
    });
    return '<div class="embedded-activity" data-run="dragWords">' +
      '<p>' + html + '</p>' +
      '<div class="embedded-word-bank">' + words.map(word => '<button class="embedded-chip" draggable="true" type="button">' + esc(word) + '</button>').join('') + '</div>' +
      '<button class="embedded-check-dtw" type="button">Prüfen</button>' +
      '<div class="embedded-feedback" hidden></div>' +
    '</div>';
  }

  function dragDrop(block) {
    const pairs = Array.isArray(block.pairs) ? block.pairs : [];
    const targets = [...new Set(pairs.map(pair => pair.target))];
    return '<div class="embedded-activity" data-run="dragDrop">' +
      '<p>' + esc(block.description || '') + '</p>' +
      '<div class="embedded-dnd-bank">' + pairs.map(pair => '<button class="embedded-dnd-item" draggable="true" type="button" data-target="' + esc(pair.target) + '">' + esc(pair.item) + '</button>').join('') + '</div>' +
      '<div class="embedded-dnd-target-grid">' + targets.map(target => '<div class="embedded-dnd-target" data-target="' + esc(target) + '"><strong>' + esc(target) + '</strong></div>').join('') + '</div>' +
      '<button class="embedded-check-dnd" type="button">Prüfen</button>' +
      '<div class="embedded-feedback" hidden></div>' +
    '</div>';
  }

  function content(block) {
    if (block.type === 'text') return block.richText || '';
    if (block.type === 'link') return '<a href="' + esc(block.url || '#') + '" target="_blank" rel="noopener">' + esc(block.linkText || 'Link öffnen') + '</a>';
    if (block.type === 'image') return block.media ? '<img class="embedded-media" src="' + esc(block.media) + '" alt="' + esc(block.alt || '') + '">' : '<p class="embedded-note">Kein Bild hinterlegt.</p>';
    if (block.type === 'video') return media(block.media);
    if (block.type === 'interactiveVideo') return '<div class="embedded-iv-stage" data-interactions="' + esc(JSON.stringify(block.interactions || [])) + '">' + media(block.media) + '<div class="embedded-glass-overlay" hidden></div></div>';
    if (block.type === 'choice') return choice(block);
    if (block.type === 'dragWords') return dragWords(block);
    if (block.type === 'dragDrop') return dragDrop(block);
    return '';
  }

  function render() {
    const pages = DATA.pages || [];
    const page = pages[Math.max(0, Math.min(active, pages.length - 1))] || { title: DATA.title || 'Aktivität', blocks: [] };
    const pct = pages.length ? ((active + 1) / pages.length) * 100 : 100;
    viewer.innerHTML = '<div class="embedded-slide-progress"><div class="embedded-slide-progress-bar" style="width:' + pct + '%"></div></div>' +
      '<section class="embedded-export-page">' +
        '<div class="embedded-export-stage" style="width:min(100%, ' + (DATA.stageWidth || 1180) + 'px); height:' + (DATA.stageHeight || 720) + 'px">' +
          (page.blocks || []).map(block => {
            const style = block.style || {};
            const z = Number(style.z || 1);
            const background = style.bgTransparent ? 'transparent' : (style.bgColor || '#ffffff');
            const border = style.showBorder === false ? 'transparent' : 'rgba(17,24,39,.34)';
            return '<article class="embedded-free-block" data-block-id="' + esc(block.id) + '" style="left:' + Number(style.x || 0) + 'px;top:' + Number(style.y || 0) + 'px;width:' + Number(style.width || 320) + 'px;height:' + Number(style.height || 160) + 'px;z-index:' + z + ';background:' + esc(background) + ';border-color:' + esc(border) + '">' + content(block) + '</article>';
          }).join('') +
        '</div>' +
      '</section>';
    if (count) count.textContent = pages.length ? 'Folie ' + (active + 1) + ' von ' + pages.length : '';
    if (prev) prev.disabled = active <= 0;
    if (next) next.disabled = active >= pages.length - 1;
    attach();
  }

  function attach() {
    let dragged = null;
    root.querySelectorAll('.embedded-chip,.embedded-dnd-item').forEach(el => {
      el.ondragstart = () => { dragged = el; };
      el.onclick = () => { dragged = el; };
    });
    root.querySelectorAll('.embedded-dtw-blank').forEach(blank => {
      const place = () => {
        if (dragged?.classList.contains('embedded-chip')) {
          blank.textContent = dragged.textContent;
          blank.dataset.filled = dragged.textContent;
          dragged.remove();
          dragged = null;
        }
      };
      blank.ondragover = e => e.preventDefault();
      blank.ondrop = place;
      blank.onclick = place;
    });
    root.querySelectorAll('.embedded-dnd-target').forEach(zone => {
      const place = () => {
        if (dragged?.classList.contains('embedded-dnd-item')) {
          zone.appendChild(dragged);
          dragged = null;
        }
      };
      zone.ondragover = e => e.preventDefault();
      zone.ondrop = place;
      zone.onclick = place;
    });
    root.querySelectorAll('.embedded-check-choice').forEach(btn => btn.onclick = () => {
      const activity = btn.closest('[data-run="choice"]');
      const feedback = activity.querySelector('.embedded-feedback');
      let correct = [];
      try { correct = JSON.parse(activity.dataset.correct || '[]').map(Number); } catch {}
      const selected = [...activity.querySelectorAll('input:checked')].map(input => Number(input.value)).sort((a,b)=>a-b);
      const expected = [...correct].sort((a,b)=>a-b);
      const ok = selected.length === expected.length && selected.every((value, index) => value === expected[index]);
      activity.querySelectorAll('.embedded-choice-option').forEach((label, index) => {
        label.classList.toggle('is-correct', expected.includes(index));
        label.classList.toggle('is-wrong', selected.includes(index) && !expected.includes(index));
      });
      if (feedback) { feedback.hidden = false; feedback.textContent = ok ? 'Richtig.' : 'Nicht ganz. Die richtige Antwort ist markiert.'; }
    });
    root.querySelectorAll('.embedded-check-dtw').forEach(btn => btn.onclick = () => {
      const activity = btn.closest('[data-run="dragWords"]');
      const blanks = [...activity.querySelectorAll('.embedded-dtw-blank')];
      const ok = blanks.length && blanks.every(blank => blank.dataset.filled === blank.dataset.answer);
      blanks.forEach(blank => blank.classList.toggle('is-correct', blank.dataset.filled === blank.dataset.answer));
      const feedback = activity.querySelector('.embedded-feedback');
      if (feedback) { feedback.hidden = false; feedback.textContent = ok ? 'Alles richtig.' : 'Noch nicht alles richtig.'; }
    });
    root.querySelectorAll('.embedded-check-dnd').forEach(btn => btn.onclick = () => {
      const activity = btn.closest('[data-run="dragDrop"]');
      const placed = [...activity.querySelectorAll('.embedded-dnd-target .embedded-dnd-item')];
      const all = activity.querySelectorAll('.embedded-dnd-item').length;
      const ok = placed.length === all && placed.every(item => item.dataset.target === item.parentElement.dataset.target);
      placed.forEach(item => item.classList.toggle('is-correct', item.dataset.target === item.parentElement.dataset.target));
      const feedback = activity.querySelector('.embedded-feedback');
      if (feedback) { feedback.hidden = false; feedback.textContent = ok ? 'Alles richtig.' : 'Einige Zuordnungen stimmen noch nicht.'; }
    });
    root.querySelectorAll('.embedded-iv-stage').forEach(stage => {
      const video = stage.querySelector('video');
      const overlay = stage.querySelector('.embedded-glass-overlay');
      if (!video || !overlay) return;
      let actions = [];
      try { actions = JSON.parse(stage.dataset.interactions || '[]').map(action => ({ ...action, done: false })); } catch {}
      video.ontimeupdate = () => {
        const action = actions.find(item => !item.done && video.currentTime >= Number(item.time));
        if (!action) return;
        action.done = true;
        video.pause();
        overlay.hidden = false;
        overlay.innerHTML = '<h3>' + esc(action.question || 'Frage') + '</h3><p>' + esc(action.description || '') + '</p><button type="button">Weiter</button>';
        overlay.querySelector('button').onclick = () => { overlay.hidden = true; video.play().catch(() => {}); };
      };
    });
  }

  prev?.addEventListener('click', () => { active = Math.max(0, active - 1); render(); });
  next?.addEventListener('click', () => { active = Math.min((DATA.pages || []).length - 1, active + 1); render(); });
  render();
})();
