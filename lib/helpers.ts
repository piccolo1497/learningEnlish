// Shared helper utilities for LexiVault
// Extracted to eliminate duplication across 6 files

// ── Styling Helpers ──────────────────────────────────────────────────────

export const getTypeBadge = (type: string) => {
  switch (type) {
    case "word":
      return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
    case "phrase":
      return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
    case "idiom":
      return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
    case "native_daily_phrase":
      return "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20";
    default:
      return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
  }
};

export const getDifficultyBadge = (difficulty: string) => {
  switch (difficulty) {
    case "easy":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    case "medium":
      return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
    case "hard":
      return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
    default:
      return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
  }
};

export const getTypeLabel = (type: string) => {
  switch (type) {
    case "word":
      return "Word";
    case "phrase":
      return "Phrase";
    case "idiom":
      return "Idiom";
    case "native_daily_phrase":
      return "Native Speaker";
    default:
      return type;
  }
};

// ── Speech Helpers ───────────────────────────────────────────────────────

export const cleanWordForSpeech = (str: string): string => {
  let cleaned = str;
  cleaned = cleaned.replace(/^\s*\(to\)\s*/i, "");
  cleaned = cleaned.replace(/\([^)]*\)/g, " ");
  if (cleaned.includes("/")) {
    cleaned = cleaned.split("/")[0];
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
};

export const playPronunciation = (word: string, accent: "US" | "UK") => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const speak = () => {
    const cleanWord = cleanWordForSpeech(word);
    if (!cleanWord) return;

    const utterance = new SpeechSynthesisUtterance(cleanWord);
    utterance.lang = accent === "US" ? "en-US" : "en-GB";
    utterance.rate = 0.95;

    const voices = window.speechSynthesis.getVoices();
    const targetLang = accent === "US" ? "en-us" : "en-gb";

    let voice = voices.find(v => {
      const l = v.lang.toLowerCase().replace("_", "-");
      return l === targetLang || l.startsWith(targetLang + "-");
    });

    if (!voice) {
      voice = voices.find(v => {
        const name = v.name.toLowerCase();
        const lang = v.lang.toLowerCase();
        if (lang.startsWith("en")) {
          if (accent === "US") {
            return name.includes("us") || name.includes("united states") || name.includes("david") || name.includes("zira") || name.includes("samantha");
          } else {
            return name.includes("gb") || name.includes("uk") || name.includes("united kingdom") || name.includes("hazel") || name.includes("daniel");
          }
        }
        return false;
      });
    }

    if (voice) {
      utterance.voice = voice;
    }

    window.speechSynthesis.speak(utterance);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      speak();
      window.speechSynthesis.onvoiceschanged = null;
    };
  } else {
    speak();
  }
};

// ── Utility Functions ────────────────────────────────────────────────────

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
