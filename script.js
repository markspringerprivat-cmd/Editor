(() => {
  let readModeActive = false;
  let activeSpeechKey = null;
  let activeSpeechElement = null;
  let speechRunId = 0;

  const toggle = document.getElementById("blindModeToggle");
  const hint = document.getElementById("blindModeHint");

  function supportsSpeech() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function readables() {
    return [...document.querySelectorAll(".blind-readable")];
  }

  function clearSpeakingState(runId = null) {
    if (runId !== null && runId !== speechRunId) return;
    readables().forEach((element) => element.classList.remove("is-speaking"));
    activeSpeechKey = null;
    activeSpeechElement = null;
  }

  function stopSpeech() {
    speechRunId += 1;
    if (supportsSpeech()) window.speechSynthesis.cancel();
    clearSpeakingState();
  }

  function speak(text, key, visualElement = null) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    if (!supportsSpeech()) {
      if (hint) {
        hint.hidden = false;
        hint.textContent = "Vorlesen wird von diesem Browser nicht unterstützt.";
      }
      return;
    }

    if (activeSpeechKey === key) {
      stopSpeech();
      return;
    }

    stopSpeech();
    const currentRunId = speechRunId + 1;
    speechRunId = currentRunId;
    activeSpeechKey = key;
    activeSpeechElement = visualElement;

    if (visualElement) visualElement.classList.add("is-speaking");
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = "de-DE";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => clearSpeakingState(currentRunId);
    utterance.onerror = () => clearSpeakingState(currentRunId);
    window.speechSynthesis.speak(utterance);
  }

  function setVorlesemodus(enabled, announce = true) {
    readModeActive = Boolean(enabled);
    document.body.classList.toggle("blind-mode-active", readModeActive);
    toggle?.classList.toggle("is-active", readModeActive);
    toggle?.setAttribute("aria-pressed", String(readModeActive));
    if (toggle) toggle.textContent = `Vorlesemodus: ${readModeActive ? "an" : "aus"}`;
    if (hint) {
      hint.hidden = true;
      hint.textContent = "";
    }

    const url = new URL(window.location.href);
    if (readModeActive) url.searchParams.set("vorlesemodus", "1");
    else url.searchParams.delete("vorlesemodus");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash || ""}`);

    document.querySelectorAll("a[href]").forEach((link) => {
      if (!link.dataset.originalHref) link.dataset.originalHref = link.getAttribute("href") || "";
      const original = link.dataset.originalHref;
      if (!original || original.startsWith("http") || original.startsWith("mailto:") || original.startsWith("tel:")) return;
      const next = new URL(original, window.location.href);
      if (readModeActive) next.searchParams.set("vorlesemodus", "1");
      else next.searchParams.delete("vorlesemodus");
      link.setAttribute("href", `${next.pathname}${next.search}${next.hash || ""}`);
    });

    if (readModeActive && announce) {
      speak("Vorlesemodus aktiviert. Drücke einmal auf ein Feld, um es vorlesen zu lassen. Drücke dasselbe Feld erneut, um das Vorlesen zu stoppen. Mit einem Doppelklick öffnest du das ausgewählte Feld.", "readmode-hint");
    }
    if (!readModeActive) stopSpeech();
  }

  function activate(element) {
    const href = element.getAttribute("href");
    if (!href) return;
    window.location.href = href;
  }

  function attachReadMode() {
    readables().forEach((element, index) => {
      if (element.dataset.readListenerAttached === "true") return;
      element.dataset.readListenerAttached = "true";
      element.addEventListener("click", (event) => {
        if (!readModeActive) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        speak(element.textContent, `${element.dataset.blindTarget || "field"}-${index}-${element.getAttribute("href") || "main"}`, element);
      });
      element.addEventListener("dblclick", (event) => {
        if (!readModeActive) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        stopSpeech();
        activate(element);
      });
    });
  }



  function attachHtmlPreview() {
    const code = document.getElementById("htmlPreviewCode");
    const file = document.getElementById("htmlPreviewFile");
    const renderButton = document.getElementById("renderHtmlPreview");
    const clearButton = document.getElementById("clearHtmlPreview");
    const frame = document.getElementById("htmlPreviewFrame");
    const status = document.getElementById("htmlPreviewStatus");
    if (!code || !file || !renderButton || !frame) return;

    let previewUrls = [];
    const setStatus = (text) => { if (status) status.textContent = text; };
    const revokePreviewUrls = () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      previewUrls = [];
    };

    function readStoredZip(buffer) {
      const view = new DataView(buffer);
      const decoder = new TextDecoder();
      const files = new Map();
      let offset = 0;
      while (offset + 30 <= view.byteLength) {
        const signature = view.getUint32(offset, true);
        if (signature !== 0x04034b50) break;
        const flags = view.getUint16(offset + 6, true);
        const method = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const fileNameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        const nameStart = offset + 30;
        const dataStart = nameStart + fileNameLength + extraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > view.byteLength) throw new Error("ZIP-Datei ist unvollständig.");
        const name = decoder.decode(new Uint8Array(buffer, nameStart, fileNameLength));
        if (method !== 0) throw new Error("Diese ZIP nutzt Kompression. Unterstützt werden die aus diesem Editor exportierten ZIP-Dateien.");
        if (flags & 0x08) throw new Error("Diese ZIP-Struktur wird in der lokalen Vorschau nicht unterstützt.");
        files.set(name, new Uint8Array(buffer, dataStart, compressedSize));
        offset = dataEnd;
      }
      return files;
    }

    function renderHtml(html) {
      revokePreviewUrls();
      frame.removeAttribute("src");
      frame.srcdoc = html;
      setStatus("Vorschau aktualisiert.");
    }

    function renderZip(files) {
      revokePreviewUrls();
      const decoder = new TextDecoder();
      const names = [...files.keys()];
      const htmlName = names.find((name) => /(^|\/)index\.html?$/i.test(name)) || names.find((name) => /\.html?$/i.test(name));
      if (!htmlName) throw new Error("In der ZIP-Datei wurde keine HTML-Datei gefunden.");
      const folder = htmlName.includes("/") ? htmlName.slice(0, htmlName.lastIndexOf("/") + 1) : "";
      const blobByRelativeName = new Map();
      for (const [name, bytes] of files.entries()) {
        if (name.endsWith("/")) continue;
        const relative = name.startsWith(folder) ? name.slice(folder.length) : name;
        const mime = /\.css$/i.test(name) ? "text/css" : /\.js$/i.test(name) ? "text/javascript" : /\.html?$/i.test(name) ? "text/html" : "application/octet-stream";
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        previewUrls.push(url);
        blobByRelativeName.set(relative, url);
      }
      let html = decoder.decode(files.get(htmlName));
      html = html.replace(/(href|src)=(['"])([^'"#][^'"]*)\2/g, (match, attr, quote, rawUrl) => {
        if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(rawUrl)) return match;
        const cleaned = rawUrl.replace(/^\.\//, "");
        const replacement = blobByRelativeName.get(cleaned) || blobByRelativeName.get(decodeURIComponent(cleaned));
        return replacement ? `${attr}=${quote}${replacement}${quote}` : match;
      });
      frame.removeAttribute("src");
      frame.srcdoc = html;
      code.value = html;
      setStatus(`ZIP-Vorschau geladen: ${htmlName}`);
    }

    const render = () => {
      const html = code.value.trim();
      if (!html) {
        frame.removeAttribute("srcdoc");
        frame.removeAttribute("src");
        setStatus("Noch kein HTML geladen.");
        return;
      }
      renderHtml(html);
    };

    file.addEventListener("change", async () => {
      const selected = file.files && file.files[0];
      if (!selected) return;
      try {
        if (/\.zip$/i.test(selected.name) || selected.type === "application/zip" || selected.type === "application/x-zip-compressed") {
          const files = readStoredZip(await selected.arrayBuffer());
          renderZip(files);
          return;
        }
        if (!/\.html?$/i.test(selected.name) && selected.type && selected.type !== "text/html") {
          setStatus("Bitte eine HTML-Datei oder eine aus diesem Editor exportierte ZIP-Datei auswählen.");
          return;
        }
        code.value = await selected.text();
        renderHtml(code.value);
      } catch (error) {
        setStatus(error?.message || "Die Datei konnte nicht gelesen werden.");
      }
    });

    renderButton.addEventListener("click", render);
    clearButton?.addEventListener("click", () => {
      revokePreviewUrls();
      code.value = "";
      file.value = "";
      frame.removeAttribute("srcdoc");
      frame.removeAttribute("src");
      setStatus("Noch kein HTML geladen.");
    });
  }

  toggle?.addEventListener("click", () => setVorlesemodus(!readModeActive));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") stopSpeech();
  });

  attachReadMode();
  attachHtmlPreview();
  if (new URLSearchParams(window.location.search).get("vorlesemodus") === "1") {
    setVorlesemodus(true, false);
  }
})();
