"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useVocab, VocabItem } from "@/app/context/VocabContext";
import { Clock, Check, Volume2 } from "lucide-react";

// Styling Helpers
const getTypeBadge = (type: string) => {
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

const getDifficultyBadge = (difficulty: string) => {
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

const getTypeLabel = (type: string) => {
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

const cleanWordForSpeech = (str: string): string => {
  let cleaned = str;
  cleaned = cleaned.replace(/^\s*\(to\)\s*/i, "");
  cleaned = cleaned.replace(/\([^)]*\)/g, " ");
  if (cleaned.includes("/")) {
    cleaned = cleaned.split("/")[0];
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
};

const playPronunciation = (word: string, accent: "US" | "UK") => {
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

import { db } from "@/lib/firebase";
import { collection, getDocs, writeBatch, doc } from "firebase/firestore";

export default function ReviewPage() {
  const router = useRouter();
  const { reviewWords, refreshReviewWords, showToast } = useVocab();

  const handleResetForDemo = async () => {
    if (!db) {
      const saved = localStorage.getItem("lexivault_words");
      if (saved) {
        try {
          const all: VocabItem[] = JSON.parse(saved);
          const updated = all.map(w => ({ ...w, nextReview: "Today" }));
          localStorage.setItem("lexivault_words", JSON.stringify(updated));
          showToast("All local cards reset to due today!");
          refreshReviewWords();
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

    try {
      showToast("Resetting database reviews...");
      const types = ["word", "phrase", "idiom", "native_daily_phrase"] as const;
      await Promise.all(
        types.map(async (type) => {
          const coll = collection(db!, "vocabulary", type, "items");
          const snap = await getDocs(coll);
          const batch = writeBatch(db!);
          snap.forEach((d) => {
            batch.update(doc(db!, "vocabulary", type, "items", d.id), { nextReview: "Today" });
          });
          await batch.commit();
        })
      );
      showToast("All database cards reset to due today!");
      refreshReviewWords();
    } catch (e) {
      console.error(e);
      showToast("Reset failed. Verify Firestore rules.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/40 border border-slate-900">
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-1.5">
            <Clock className="w-5 h-5 text-cyan-400" />
            Review Queue ({reviewWords.length} items due)
          </h2>
          <p className="text-xs text-slate-400">
            Spaced-repetition scheduled items waiting for your practice check today.
          </p>
        </div>
        {reviewWords.length > 0 && (
          <button
            onClick={() => router.push("/practice")}
            className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 active:scale-95 transition-all cursor-pointer shadow-md"
          >
            Launch Interactive Flashcards
          </button>
        )}
      </div>

      {reviewWords.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviewWords.map((item) => (
            <div
              key={item.id}
              className="glass-panel glass-panel-hover rounded-xl p-4 border border-slate-900 flex flex-col justify-between min-h-[180px]"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${getTypeBadge(item.type)}`}>
                      {getTypeLabel(item.type)}
                    </span>
                    {item.type !== "native_daily_phrase" && (item.wordTypes || []).map((wt) => (
                      <span key={wt} className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {wt}
                      </span>
                    ))}
                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${getDifficultyBadge(item.difficulty)}`}>
                      {item.difficulty}
                    </span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                </div>

                <div className="flex flex-col gap-1.5 mb-1">
                  <h4 className="text-base font-bold text-slate-100">{item.word}</h4>
                  
                  {/* Pronunciation play buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {/* US Pronunciation */}
                    <div className="flex items-center gap-1 bg-slate-900/50 px-1.5 py-0.5 rounded-lg border border-slate-850">
                      <span className="text-[8px] font-black text-slate-500">US</span>
                      {item.type !== "native_daily_phrase" && (
                        <span className="text-[10px] font-medium text-slate-400">
                          {item.pronunciationUS || "N/A"}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playPronunciation(item.word, "US");
                        }}
                        className="p-0.5 rounded text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        title="Listen US"
                      >
                        <Volume2 className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    {/* UK Pronunciation */}
                    <div className="flex items-center gap-1 bg-slate-900/50 px-1.5 py-0.5 rounded-lg border border-slate-850">
                      <span className="text-[8px] font-black text-slate-500">UK</span>
                      {item.type !== "native_daily_phrase" && (
                        <span className="text-[10px] font-medium text-slate-400">
                          {item.pronunciationUK || "N/A"}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playPronunciation(item.word, "UK");
                        }}
                        className="p-0.5 rounded text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        title="Listen UK"
                      >
                        <Volume2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                </div>
                
                <p className="text-slate-300 text-xs leading-relaxed line-clamp-2">{item.meaning}</p>

                {/* Vietnamese translation display */}
                <p className="text-emerald-400 text-xs font-semibold mt-1 flex items-center gap-1">
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/10">VN</span>
                  {item.vietnamese}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-900/60 mt-3">
                <span className="text-[11px] text-cyan-400/80 font-semibold">
                  Recall level: {item.streak}
                </span>

                <button
                  onClick={() => {
                    router.push(`/practice?id=${item.id}`);
                  }}
                  className="px-2.5 py-1 rounded-md text-[12px] font-bold bg-slate-950 hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-400 border border-slate-900 hover:border-cyan-500/20 transition-all cursor-pointer"
                >
                  Practice Card
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[260px]">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
            <Check className="w-5 h-5 stroke-[3]" />
          </div>
          <h4 className="text-sm font-bold text-slate-200">No Review Tasks</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-[260px] mx-auto leading-relaxed">
            All clear! Review stack complete. Reset the queue to demo practice again.
          </p>
          <button
            onClick={handleResetForDemo}
            className="mt-5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-350 border border-slate-800 transition-all cursor-pointer"
          >
            Reset Reviews for Demo
          </button>
        </div>
      )}
    </div>
  );
}
