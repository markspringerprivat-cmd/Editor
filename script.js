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



  toggle?.addEventListener("click", () => setVorlesemodus(!readModeActive));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") stopSpeech();
  });

  attachReadMode();
  if (new URLSearchParams(window.location.search).get("vorlesemodus") === "1") {
    setVorlesemodus(true, false);
  }
})();
