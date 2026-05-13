(() => {
  const video = document.getElementById("ivVideo");
  if (!video) return;

  const overlay = document.getElementById("ivOverlay");
  const overlayQuestion = document.getElementById("ivOverlayQuestion");
  const overlayDescription = document.getElementById("ivOverlayDescription");
  const answerGrid = document.getElementById("ivAnswerGrid");
  const feedback = document.getElementById("ivFeedback");
  const timeDisplay = document.getElementById("ivTimeDisplay");
  const markerList = document.getElementById("ivMarkerList");
  const configArea = document.getElementById("ivConfigArea");

  const videoUrlInput = document.getElementById("ivVideoUrl");
  const videoFileInput = document.getElementById("ivVideoFile");
  const loadVideoButton = document.getElementById("ivLoadVideoButton");
  const timeInput = document.getElementById("ivTimeInput");
  const questionInput = document.getElementById("ivQuestionInput");
  const descriptionInput = document.getElementById("ivDescriptionInput");
  const answersInput = document.getElementById("ivAnswersInput");
  const correctInput = document.getElementById("ivCorrectInput");
  const pauseInput = document.getElementById("ivPauseInput");
  const saveButton = document.getElementById("ivSaveInteractionButton");
  const currentTimeButton = document.getElementById("ivUseCurrentTimeButton");
  const restartButton = document.getElementById("ivRestartButton");
  const jumpMarkerButton = document.getElementById("ivJumpMarkerButton");
  const exportButton = document.getElementById("ivExportButton");
  const downloadHtmlButton = document.getElementById("ivDownloadHtmlButton");
  const importButton = document.getElementById("ivImportButton");
  const clearButton = document.getElementById("ivClearButton");

  const STORAGE_KEY = "kursrahmen-interactive-video-config-v1";
  let interactions = [
    {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      time: 4,
      question: "Was ist in diesem Moment wichtig?",
      description: "Beantworte die Frage, damit das Video weiterläuft.",
      answers: [
        "Die Gesprächssituation genau beobachten",
        "Sofort zur nächsten Folie springen",
        "Das Video ohne Pause weiterlaufen lassen"
      ],
      correctIndex: 0,
      pause: true,
      answered: false,
      triggered: false
    }
  ];

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    const total = Math.max(0, Math.floor(seconds));
    const mins = String(Math.floor(total / 60)).padStart(2, "0");
    const secs = String(total % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function saveLocal() {
    const data = getExportData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.videoUrl && videoUrlInput) {
        videoUrlInput.value = data.videoUrl;
        setVideoSource(data.videoUrl);
      }
      if (Array.isArray(data.interactions)) {
        interactions = data.interactions.map(normalizeInteraction);
      }
    } catch (_error) {
      // Ignore invalid local data.
    }
  }

  function normalizeInteraction(item) {
    return {
      id: item.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
      time: Number(item.time) || 0,
      question: String(item.question || "Frage"),
      description: String(item.description || "Wähle eine Antwort aus."),
      answers: Array.isArray(item.answers) && item.answers.length ? item.answers.map(String) : ["Antwort 1"],
      correctIndex: Math.max(0, Number(item.correctIndex) || 0),
      pause: item.pause !== false,
      answered: false,
      triggered: false
    };
  }

  function getExportData() {
    return {
      videoUrl: videoUrlInput?.value || video.currentSrc || "",
      interactions: interactions.map(({ id, time, question, description, answers, correctIndex, pause }) => ({
        id, time, question, description, answers, correctIndex, pause
      }))
    };
  }

  function setVideoSource(src) {
    if (!src) return;
    hideOverlay();
    video.pause();
    video.src = src;
    video.load();
    resetTriggers();
  }

  function resetTriggers() {
    interactions = interactions.map((interaction) => ({ ...interaction, answered: false, triggered: false }));
    renderMarkers();
    saveLocal();
  }

  function hideOverlay() {
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");
    answerGrid.innerHTML = "";
    feedback.hidden = true;
    feedback.textContent = "";
  }

  function showInteraction(interaction) {
    interaction.triggered = true;
    if (interaction.pause) video.pause();

    overlayQuestion.textContent = interaction.question;
    overlayDescription.textContent = interaction.description;
    feedback.hidden = true;
    feedback.textContent = "";
    answerGrid.innerHTML = "";

    interaction.answers.forEach((answer, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "iv-answer-button";
      button.textContent = answer;
      button.addEventListener("click", () => answerInteraction(interaction, index, button));
      answerGrid.appendChild(button);
    });

    overlay.classList.add("is-visible");
    overlay.setAttribute("aria-hidden", "false");
    const firstButton = answerGrid.querySelector("button");
    if (firstButton) firstButton.focus({ preventScroll: true });
    renderMarkers();
    saveLocal();
  }

  function answerInteraction(interaction, selectedIndex, selectedButton) {
    const buttons = [...answerGrid.querySelectorAll("button")];
    buttons.forEach((button, index) => {
      button.disabled = true;
      if (index === interaction.correctIndex) button.classList.add("is-correct");
    });

    const isCorrect = selectedIndex === interaction.correctIndex;
    if (!isCorrect) selectedButton.classList.add("is-wrong");
    feedback.textContent = isCorrect
      ? "Richtig. Das Video läuft jetzt weiter."
      : "Nicht ganz. Die richtige Antwort ist markiert. Das Video läuft jetzt weiter.";
    feedback.hidden = false;
    interaction.answered = true;

    window.setTimeout(() => {
      hideOverlay();
      video.play().catch(() => {});
      renderMarkers();
      saveLocal();
    }, isCorrect ? 900 : 1700);
  }

  function checkInteractions() {
    const current = video.currentTime;
    const nextInteraction = interactions
      .filter((interaction) => !interaction.triggered && current >= interaction.time && current <= interaction.time + 0.45)
      .sort((a, b) => a.time - b.time)[0];

    if (nextInteraction) showInteraction(nextInteraction);
  }

  function renderTime() {
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  }

  function renderMarkers() {
    const sorted = [...interactions].sort((a, b) => a.time - b.time);
    markerList.innerHTML = "";

    if (!sorted.length) {
      const empty = document.createElement("p");
      empty.className = "iv-marker-meta";
      empty.textContent = "Noch keine Zeitmarken angelegt.";
      markerList.appendChild(empty);
      return;
    }

    sorted.forEach((interaction) => {
      const item = document.createElement("article");
      item.className = "iv-marker-item";
      item.innerHTML = `
        <strong>${formatTime(interaction.time)} · ${escapeHtml(interaction.question)}</strong>
        <div class="iv-marker-meta">${interaction.answers.length} Antwortmöglichkeiten · ${interaction.pause ? "pausiert das Video" : "läuft ohne Pause"} · ${interaction.answered ? "beantwortet" : "offen"}</div>
      `;

      const actions = document.createElement("div");
      actions.className = "iv-marker-actions";

      const jumpButton = document.createElement("button");
      jumpButton.type = "button";
      jumpButton.className = "iv-small-button";
      jumpButton.textContent = "Anspringen";
      jumpButton.addEventListener("click", () => {
        video.currentTime = Math.max(0, interaction.time - 0.1);
        interaction.triggered = false;
        interaction.answered = false;
        video.play().catch(() => {});
      });

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "iv-small-button";
      editButton.textContent = "Bearbeiten";
      editButton.addEventListener("click", () => fillForm(interaction));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "iv-small-button";
      deleteButton.textContent = "Löschen";
      deleteButton.addEventListener("click", () => {
        interactions = interactions.filter((item) => item.id !== interaction.id);
        renderMarkers();
        saveLocal();
      });

      actions.append(jumpButton, editButton, deleteButton);
      item.appendChild(actions);
      markerList.appendChild(item);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  }


  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 700);
  }



  function encodeUtf8(value) { return new TextEncoder().encode(String(value)); }
  function crc32(bytes) { let crc = -1; for (let i = 0; i < bytes.length; i += 1) { crc ^= bytes[i]; for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
  function dosTimestamp(date = new Date()) { const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2); const day = Math.max(1, date.getDate()); const month = date.getMonth() + 1; const year = Math.max(1980, date.getFullYear()) - 1980; return { time, date: (year << 9) | (month << 5) | day }; }
  function pushU16(target, value) { target.push(value & 255, (value >>> 8) & 255); }
  function pushU32(target, value) { target.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }
  function makeZip(files) { const localParts = []; const centralParts = []; let offset = 0; const stamp = dosTimestamp(); files.forEach((file) => { const nameBytes = encodeUtf8(file.name); const dataBytes = file.content instanceof Uint8Array ? file.content : encodeUtf8(file.content); const checksum = crc32(dataBytes); const local = []; pushU32(local, 0x04034b50); pushU16(local, 20); pushU16(local, 0); pushU16(local, 0); pushU16(local, stamp.time); pushU16(local, stamp.date); pushU32(local, checksum); pushU32(local, dataBytes.length); pushU32(local, dataBytes.length); pushU16(local, nameBytes.length); pushU16(local, 0); localParts.push(new Uint8Array(local), nameBytes, dataBytes); const central = []; pushU32(central, 0x02014b50); pushU16(central, 20); pushU16(central, 20); pushU16(central, 0); pushU16(central, 0); pushU16(central, stamp.time); pushU16(central, stamp.date); pushU32(central, checksum); pushU32(central, dataBytes.length); pushU32(central, dataBytes.length); pushU16(central, nameBytes.length); pushU16(central, 0); pushU16(central, 0); pushU16(central, 0); pushU16(central, 0); pushU32(central, 0); pushU32(central, offset); centralParts.push(new Uint8Array(central), nameBytes); offset += local.length + nameBytes.length + dataBytes.length; }); const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0); const end = []; pushU32(end, 0x06054b50); pushU16(end, 0); pushU16(end, 0); pushU16(end, files.length); pushU16(end, files.length); pushU32(end, centralSize); pushU32(end, offset); pushU16(end, 0); return new Blob([...localParts, ...centralParts, new Uint8Array(end)], { type: 'application/zip' }); }
  function downloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 700); }
  function downloadZip(filename, files) { downloadBlob(filename, makeZip(files)); }

  function buildStandaloneVideoFiles() {
    const data = getExportData();
    const index = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Interaktives Video</title><link rel="stylesheet" href="activity-style.css"></head><body><main class="shell"><section class="top"><h1>Interaktives Video</h1><p>Export aus dem Kursrahmen-Editor.</p></section><section class="stage"><video id="video" controls></video><div class="overlay" id="overlay" hidden></div></section></main><script src="activity-data.js"></script><script src="activity-runtime.js"></script></body></html>`;
    const css = `body{margin:0;font-family:Inter,system-ui,sans-serif;color:#111827;background:#fff;padding:32px}.shell{max-width:1100px;margin:0 auto}.top{border:1.3px solid rgba(17,24,39,.7);padding:28px 32px;margin-bottom:24px;box-shadow:8px 16px 28px rgba(17,24,39,.08)}h1{font-size:clamp(2rem,4vw,4rem);line-height:1;margin:0 0 12px;letter-spacing:-.04em}.stage{position:relative;border:1.3px solid rgba(17,24,39,.7);box-shadow:8px 16px 28px rgba(17,24,39,.08);background:#111}video{width:100%;display:block;max-height:620px}.overlay{position:absolute;left:6%;right:6%;bottom:8%;padding:24px;background:rgba(255,255,255,.72);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.55);box-shadow:0 18px 40px rgba(17,24,39,.22)}.answers{display:grid;gap:10px;margin-top:16px}.answers button{border:1px solid rgba(47,95,143,.35);background:#fff;color:#173d63;font-weight:800;padding:12px 14px;text-align:left;cursor:pointer}.answers button.ok{background:#dcfce7;border-color:#166534}.answers button.no{background:#fee2e2;border-color:#991b1b}.feedback{margin-top:12px;font-weight:800}`;
    const dataJs = `window.ACTIVITY_DATA=${JSON.stringify(data, null, 2)};\n`;
    const runtime = `(() => { const DATA = window.ACTIVITY_DATA || {}; const video = document.getElementById('video'); const overlay = document.getElementById('overlay'); const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); video.src = DATA.videoUrl || ''; const interactions = (DATA.interactions || []).map((x) => ({ ...x, done: false })); video.addEventListener('seeked', () => { interactions.forEach((i) => { if (video.currentTime < Number(i.time) - 0.2) i.done = false; }); }); video.addEventListener('timeupdate', () => { const item = interactions.find((i) => !i.done && video.currentTime >= Number(i.time) && video.currentTime <= Number(i.time) + 0.5); if (!item) return; item.done = true; if (item.pause !== false) video.pause(); overlay.hidden = false; overlay.innerHTML = '<h2>' + esc(item.question) + '</h2><p>' + esc(item.description || '') + '</p><div class="answers">' + (item.answers || []).map((a, i) => '<button type="button" data-i="' + i + '">' + esc(a) + '</button>').join('') + '</div><div class="feedback" hidden></div>'; overlay.querySelectorAll('button').forEach((btn) => btn.onclick = () => { const idx = Number(btn.dataset.i); overlay.querySelectorAll('button').forEach((b, i) => { b.disabled = true; if (i === Number(item.correctIndex)) b.classList.add('ok'); }); if (idx !== Number(item.correctIndex)) btn.classList.add('no'); const f = overlay.querySelector('.feedback'); f.hidden = false; f.textContent = idx === Number(item.correctIndex) ? 'Richtig. Das Video läuft weiter.' : 'Nicht ganz. Die richtige Antwort ist markiert.'; setTimeout(() => { overlay.hidden = true; video.play().catch(() => {}); }, idx === Number(item.correctIndex) ? 900 : 1600); }; }); })();`;
    return [
      { name: 'interaktives-video/index.html', content: index },
      { name: 'interaktives-video/activity-style.css', content: css },
      { name: 'interaktives-video/activity-data.js', content: dataJs },
      { name: 'interaktives-video/activity-runtime.js', content: runtime },
      { name: 'interaktives-video/README.txt', content: 'Öffne index.html im Browser. Lokale Videodateien müssen separat neben die HTML-Dateien gelegt und im Editor per relativer URL eingetragen werden.\n' }
    ];
  }
  function buildStandaloneHtml() {
    const data = getExportData();
    const safeJson = JSON.stringify(data).replace(/<\/script/gi, "<\\/script");
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Interaktives Video</title><style>
      body{margin:0;font-family:Inter,system-ui,sans-serif;color:#111827;background:#fff;padding:32px}.shell{max-width:1100px;margin:0 auto}.top{border:1.3px solid rgba(17,24,39,.7);padding:28px 32px;margin-bottom:24px;box-shadow:8px 16px 28px rgba(17,24,39,.08)}h1{font-size:clamp(2rem,4vw,4rem);line-height:1;margin:0 0 12px;letter-spacing:-.04em}.stage{position:relative;border:1.3px solid rgba(17,24,39,.7);box-shadow:8px 16px 28px rgba(17,24,39,.08);background:#111}video{width:100%;display:block;max-height:620px}.overlay{position:absolute;left:6%;right:6%;bottom:8%;padding:24px;background:rgba(255,255,255,.72);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.55);box-shadow:0 18px 40px rgba(17,24,39,.22)}.answers{display:grid;gap:10px;margin-top:16px}.answers button{border:1px solid rgba(47,95,143,.35);background:#fff;color:#173d63;font-weight:800;padding:12px 14px;text-align:left;cursor:pointer}.answers button.ok{background:#dcfce7;border-color:#166534}.answers button.no{background:#fee2e2;border-color:#991b1b}.feedback{margin-top:12px;font-weight:800}
    </style></head><body><main class="shell"><section class="top"><h1>Interaktives Video</h1><p>Exportierte HTML-Datei aus dem Kursrahmen-Editor.</p></section><section class="stage"><video id="video" src="${escapeHtml(data.videoUrl || '')}" controls></video><div class="overlay" id="overlay" hidden></div></section></main><script>
      const DATA=${safeJson};
      const video=document.getElementById('video'); const overlay=document.getElementById('overlay');
      const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      const interactions=(DATA.interactions||[]).map(x=>({...x,done:false}));
      video.addEventListener('seeked',()=>{interactions.forEach(i=>{if(video.currentTime < Number(i.time)-0.2)i.done=false;});});
      video.addEventListener('timeupdate',()=>{const item=interactions.find(i=>!i.done && video.currentTime>=Number(i.time) && video.currentTime<=Number(i.time)+0.5); if(!item)return; item.done=true; if(item.pause!==false)video.pause(); overlay.hidden=false; overlay.innerHTML='<h2>'+esc(item.question)+'</h2><p>'+esc(item.description||'')+'</p><div class="answers">'+(item.answers||[]).map((a,i)=>'<button data-i="'+i+'">'+esc(a)+'</button>').join('')+'</div><div class="feedback" hidden></div>'; overlay.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{const idx=Number(btn.dataset.i); overlay.querySelectorAll('button').forEach((b,i)=>{b.disabled=true;if(i===Number(item.correctIndex))b.classList.add('ok');}); if(idx!==Number(item.correctIndex))btn.classList.add('no'); const f=overlay.querySelector('.feedback'); f.hidden=false; f.textContent=idx===Number(item.correctIndex)?'Richtig. Das Video läuft weiter.':'Nicht ganz. Die richtige Antwort ist markiert.'; setTimeout(()=>{overlay.hidden=true;video.play().catch(()=>{});}, idx===Number(item.correctIndex)?900:1600);};});
    <\/script></body></html>`;
  }

  function fillForm(interaction) {
    timeInput.value = interaction.time;
    questionInput.value = interaction.question;
    descriptionInput.value = interaction.description;
    answersInput.value = interaction.answers.join("\n");
    correctInput.value = String(interaction.correctIndex);
    pauseInput.checked = interaction.pause;
    saveButton.dataset.editId = interaction.id;
    questionInput.focus();
  }

  function readFormInteraction() {
    const answers = answersInput.value
      .split("\n")
      .map((answer) => answer.trim())
      .filter(Boolean);

    return normalizeInteraction({
      id: saveButton.dataset.editId || undefined,
      time: Number(timeInput.value),
      question: questionInput.value.trim() || "Frage",
      description: descriptionInput.value.trim() || "Wähle eine Antwort aus.",
      answers: answers.length ? answers : ["Antwort 1"],
      correctIndex: Math.min(Math.max(0, Number(correctInput.value) || 0), Math.max(0, answers.length - 1)),
      pause: pauseInput.checked
    });
  }

  loadVideoButton?.addEventListener("click", () => {
    if (videoFileInput?.files?.[0]) {
      const objectUrl = URL.createObjectURL(videoFileInput.files[0]);
      setVideoSource(objectUrl);
      if (videoUrlInput) videoUrlInput.value = "";
    } else {
      setVideoSource(videoUrlInput.value.trim());
    }
    saveLocal();
  });

  currentTimeButton?.addEventListener("click", () => {
    timeInput.value = video.currentTime.toFixed(1);
  });

  saveButton?.addEventListener("click", () => {
    const interaction = readFormInteraction();
    const editId = saveButton.dataset.editId;
    if (editId) {
      interactions = interactions.map((item) => item.id === editId ? interaction : item);
      delete saveButton.dataset.editId;
    } else {
      interactions.push(interaction);
    }
    interactions.sort((a, b) => a.time - b.time);
    resetTriggers();
    renderMarkers();
    saveLocal();
  });

  restartButton?.addEventListener("click", () => {
    video.currentTime = 0;
    resetTriggers();
    hideOverlay();
    video.play().catch(() => {});
  });

  jumpMarkerButton?.addEventListener("click", () => {
    const next = [...interactions].sort((a, b) => a.time - b.time).find((interaction) => interaction.time > video.currentTime + 0.2);
    if (next) {
      next.triggered = false;
      next.answered = false;
      video.currentTime = Math.max(0, next.time - 0.1);
      video.play().catch(() => {});
    }
  });

  exportButton?.addEventListener("click", () => {
    configArea.value = JSON.stringify(getExportData(), null, 2);
    configArea.focus();
    configArea.select();
  });

  downloadHtmlButton?.addEventListener("click", () => {
    downloadZip("interaktives-video.zip", buildStandaloneVideoFiles());
  });

  importButton?.addEventListener("click", () => {
    try {
      const data = JSON.parse(configArea.value);
      if (data.videoUrl && videoUrlInput) {
        videoUrlInput.value = data.videoUrl;
        setVideoSource(data.videoUrl);
      }
      if (Array.isArray(data.interactions)) {
        interactions = data.interactions.map(normalizeInteraction);
      }
      resetTriggers();
      renderMarkers();
    } catch (_error) {
      configArea.value = "Die eingefügte Konfiguration konnte nicht gelesen werden.";
    }
  });

  clearButton?.addEventListener("click", () => {
    interactions = [];
    resetTriggers();
    hideOverlay();
  });

  video.addEventListener("timeupdate", () => {
    renderTime();
    checkInteractions();
  });
  video.addEventListener("loadedmetadata", renderTime);
  video.addEventListener("seeked", () => {
    interactions.forEach((interaction) => {
      if (video.currentTime < interaction.time - 0.2) {
        interaction.triggered = false;
        interaction.answered = false;
      }
    });
    renderMarkers();
  });

  loadLocal();
  renderMarkers();
  renderTime();
})();
