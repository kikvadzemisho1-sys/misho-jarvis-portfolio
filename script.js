(() => {
  "use strict";

  const activateButton = document.querySelector("#activate-btn");
  const introScreen = document.querySelector("#intro-screen");
  const introStatus = document.querySelector("#intro-status");
  const portfolio = document.querySelector("#portfolio-content");
  const greeting = document.querySelector("#jarvis-greeting");
  const systemMessage = document.querySelector("#system-message");
  const voiceLanguage = document.querySelector("#voice-language");
  const year = document.querySelector("#current-year");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  const speechSynthesis = window.speechSynthesis;
  const supportsIntersectionObserver = "IntersectionObserver" in window;
  const stateTransitions = {
    intro: ["diagnostics"],
    diagnostics: ["typing"],
    typing: ["dashboard"],
    dashboard: [],
  };
  const stateLabels = {
    intro: "SYSTEM OFFLINE",
    diagnostics: "RUNNING DIAGNOSTICS",
    typing: "INITIALIZING VOICE",
    dashboard: "SYSTEM ONLINE",
  };
  const greetings = {
    "ka-GE": (timeOfDay) =>
      `მშვიდობიანი ${timeOfDay}ა. მე ვარ J.A.R.V.I.S. — მიშო კიკვაძის ასისტენტი. სისტემა მზადაა.`,
    "en-US": (timeOfDay) =>
      `Good ${timeOfDay}. I am J.A.R.V.I.S., Misho Kikvadze's assistant. All systems are ready.`,
  };

  let currentState = "intro";
  let audioContext = null;
  let typingTimer = 0;
  let hasInitialized = false;

  if (year) year.textContent = new Date().getFullYear();
  document.documentElement.dataset.systemState = currentState;
  introScreen.dataset.state = currentState;

  function setState(nextState) {
    if (!stateTransitions[currentState].includes(nextState)) {
      throw new Error(`Invalid JARVIS state transition: ${currentState} -> ${nextState}`);
    }

    currentState = nextState;
    document.documentElement.dataset.systemState = currentState;
    introScreen.dataset.state = currentState;

    if (introStatus) introStatus.textContent = stateLabels[currentState];
  }

  function getTimeOfDay(locale) {
    const hour = new Date().getHours();

    if (locale === "en-US") {
      return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    }

    return hour < 12 ? "დილა" : hour < 18 ? "შუადღე" : "საღამო";
  }

  function playTone(frequency, duration = 0.075, volume = 0.035) {
    if (!audioContext || audioContext.state !== "running") return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startTime = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  function enableAudio() {
    if (!AudioContextConstructor || audioContext) return;

    try {
      audioContext = new AudioContextConstructor();
      if (audioContext.state === "suspended") {
        audioContext.resume().catch((error) => {
          console.warn("JARVIS sound effects could not be enabled.", error);
          audioContext = null;
        });
      }
    } catch (error) {
      console.warn("JARVIS sound effects are unavailable.", error);
    }
  }

  function getVoices() {
    if (!speechSynthesis) return Promise.resolve([]);

    const availableVoices = speechSynthesis.getVoices();
    if (availableVoices.length > 0) return Promise.resolve(availableVoices);

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(speechSynthesis.getVoices());
      }, 1000);

      function onVoicesChanged() {
        window.clearTimeout(timeout);
        speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(speechSynthesis.getVoices());
      }

      speechSynthesis.addEventListener("voiceschanged", onVoicesChanged, { once: true });
    });
  }

  async function speakGreeting(selectedLocale) {
    if (!speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      systemMessage.textContent = "SYSTEM STATUS: READY // VOICE SYNTHESIS UNAVAILABLE";
      systemMessage.classList.add("is-complete");
      return;
    }

    speechSynthesis.cancel();

    try {
      const voices = await getVoices();
      const requestedLanguage = selectedLocale.toLowerCase();
      const requestedVoice = voices.find(
        (voice) => voice.lang.toLowerCase() === requestedLanguage,
      ) || voices.find((voice) => voice.lang.toLowerCase().startsWith(`${requestedLanguage.split("-")[0]}-`));
      const isGeorgianFallback = selectedLocale === "ka-GE" && !requestedVoice;
      const locale = isGeorgianFallback ? "en-US" : selectedLocale;
      const language = locale.toLowerCase();
      const voice =
        requestedVoice ||
        voices.find((item) => item.lang.toLowerCase() === language) ||
        voices.find((item) => item.lang.toLowerCase().startsWith(`${language.split("-")[0]}-`));
      const greetingText = greetings[locale](getTimeOfDay(locale));
      const utterance = new SpeechSynthesisUtterance(greetingText);

      utterance.lang = voice?.lang || locale;
      utterance.pitch = locale === "ka-GE" ? 0.96 : 0.88;
      utterance.rate = locale === "ka-GE" ? 0.88 : 0.92;
      utterance.volume = 0.9;
      if (voice) {
        try {
          utterance.voice = voice;
        } catch (error) {
          console.warn("JARVIS voice selection failed; using the browser's default voice.", error);
        }
      }

      if (isGeorgianFallback) {
        systemMessage.textContent = "SYSTEM STATUS: GEORGIAN VOICE UNAVAILABLE // USING ENGLISH";
      }

      utterance.onend = () => {
        if (currentState === "dashboard") {
          systemMessage.textContent = "SYSTEM STATUS: DIAGNOSTICS COMPLETE";
        }
      };
      utterance.onerror = (event) => {
        if (event.error !== "canceled" && event.error !== "interrupted") {
          console.warn("JARVIS voice output failed.", event.error);
          systemMessage.textContent = "SYSTEM STATUS: READY // VOICE OUTPUT FAILED";
        }
      };

      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("JARVIS voice initialization failed.", error);
      systemMessage.textContent = "SYSTEM STATUS: READY // VOICE OUTPUT FAILED";
    }
  }

  function revealSections() {
    const revealElements = document.querySelectorAll(".reveal");

    if (motionPreference.matches || !supportsIntersectionObserver) {
      revealElements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -36px 0px" },
    );

    revealElements.forEach((element) => observer.observe(element));
  }

  function typeGreeting(text, onComplete) {
    window.clearTimeout(typingTimer);
    greeting.textContent = "";

    if (motionPreference.matches) {
      greeting.textContent = text;
      onComplete();
      return;
    }

    let index = 0;

    function typeNextCharacter() {
      if (index >= text.length) {
        onComplete();
        return;
      }

      greeting.textContent += text.charAt(index);
      index += 1;

      if (index % 5 === 0) playTone(480 + (index % 3) * 55, 0.025, 0.012);
      typingTimer = window.setTimeout(typeNextCharacter, 43);
    }

    typeNextCharacter();
  }

  async function initializeDashboard() {
    if (hasInitialized) return;
    hasInitialized = true;
    setState("diagnostics");
    enableAudio();
    playTone(620, 0.12, 0.045);
    introScreen.classList.add("is-leaving");
    introScreen.setAttribute("aria-hidden", "true");
    activateButton.disabled = true;

    window.setTimeout(() => {
      introScreen.classList.add("hidden");
      portfolio.classList.remove("hidden");
      portfolio.focus({ preventScroll: true });
      setState("typing");
      systemMessage.textContent = "SYSTEM STATUS: RUNNING DIAGNOSTICS...";
      systemMessage.classList.remove("is-complete");

      const selectedLocale = voiceLanguage.value;
      const greetingText = greetings[selectedLocale](getTimeOfDay(selectedLocale));

      typeGreeting(greetingText, () => {
        setState("dashboard");
        revealSections();
        systemMessage.textContent = "SYSTEM STATUS: DIAGNOSTICS COMPLETE";
        systemMessage.classList.add("is-complete");
        playTone(740, 0.16, 0.045);
        void speakGreeting(selectedLocale);
      });
    }, motionPreference.matches ? 0 : 700);
  }

  activateButton.addEventListener("click", initializeDashboard);

  document.addEventListener("pointerover", (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest("button, a");
    if (!target || target.contains(event.relatedTarget)) return;
    playTone(880, 0.045, 0.018);
  });
})();
