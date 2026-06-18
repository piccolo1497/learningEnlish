"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useVocab, VocabItem } from "@/app/context/VocabContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import {
  BrainCircuit,
  Volume2,
  Check,
  X,
  Trash2,
  RotateCcw,
  Sparkles,
  Award
} from "lucide-react";

// Styling helpers
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

const getTabStyles = (type: string, isActive: boolean) => {
  switch (type) {
    case "all":
      return isActive
        ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-md shadow-cyan-500/5"
        : "text-slate-400 hover:text-cyan-300 border-slate-900 hover:border-cyan-500/10 hover:bg-cyan-500/5";
    case "word":
      return isActive
        ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 shadow-md shadow-indigo-500/5"
        : "text-slate-400 hover:text-indigo-300 border-slate-900 hover:border-indigo-500/10 hover:bg-indigo-500/5";
    case "phrase":
      return isActive
        ? "bg-cyan-500/15 text-cyan-305 border-cyan-500/30 shadow-md shadow-cyan-500/5"
        : "text-slate-400 hover:text-cyan-300 border-slate-900 hover:border-cyan-500/10 hover:bg-cyan-500/5";
    case "idiom":
      return isActive
        ? "bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-md shadow-purple-500/5"
        : "text-slate-400 hover:text-purple-300 border-slate-900 hover:border-purple-500/10 hover:bg-purple-500/5";
    case "native_daily_phrase":
      return isActive
        ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30 shadow-md shadow-fuchsia-500/5"
        : "text-slate-400 hover:text-fuchsia-400 border-slate-900 hover:border-fuchsia-500/10 hover:bg-fuchsia-500/5";
    default:
      return "text-slate-400 hover:text-white";
  }
};

const getCountBadgeStyles = (type: string, isActive: boolean) => {
  switch (type) {
    case "all":
      return isActive
        ? "bg-cyan-500/25 text-cyan-100 border border-cyan-500/40"
        : "bg-slate-950/80 text-cyan-400 border border-cyan-500/20";
    case "word":
      return isActive
        ? "bg-indigo-500/25 text-indigo-100 border border-indigo-500/40"
        : "bg-slate-950/80 text-indigo-400 border border-indigo-500/20";
    case "phrase":
      return isActive
        ? "bg-cyan-500/25 text-cyan-100 border border-cyan-500/40"
        : "bg-slate-950/80 text-cyan-400 border border-cyan-500/20";
    case "idiom":
      return isActive
        ? "bg-purple-500/25 text-purple-100 border border-purple-500/40"
        : "bg-slate-950/80 text-purple-400 border border-purple-500/20";
    case "native_daily_phrase":
      return isActive
        ? "bg-fuchsia-500/25 text-fuchsia-100 border border-fuchsia-500/40"
        : "bg-slate-950/80 text-fuchsia-400 border border-fuchsia-500/20";
    default:
      return "bg-slate-900 text-slate-400";
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

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function PracticePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const singleId = searchParams.get("id");
  const typeParam = searchParams.get("type") as VocabItem["type"] | null;

  const {
    words,
    reviewWords,
    dailyProgress,
    dailyGoal,
    updatePracticeProgress,
    deleteWord,
    showToast
  } = useVocab();

  // Active Practice Queue
  const [practiceQueue, setPracticeQueue] = useState<VocabItem[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });

  // Category selection (if not in single ID mode)
  const [activeTab, setActiveTab] = useState<"all" | "word" | "phrase" | "idiom" | "native_daily_phrase">("all");
  const [isStudyAllMode, setIsStudyAllMode] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const isLoadingQueueRef = useRef(false);

  // Set default active tab based on query param
  useEffect(() => {
    if (typeParam) {
      setActiveTab(typeParam);
    }
  }, [typeParam]);

  // Load / build practice queue
  const buildQueue = useCallback(async () => {
    if (isLoadingQueueRef.current) return;
    isLoadingQueueRef.current = true;
    setLoadingQueue(true);
    setSessionFinished(false);
    setPracticeIndex(0);
    setShowMeaning(false);
    setSessionStats({ correct: 0, total: 0 });

    try {
      // 1. Single card test mode
      if (singleId) {
        // Find in existing cache
        let card = words.find(w => w.id === singleId) || reviewWords.find(w => w.id === singleId);
        
        if (!card && db) {
          // Fetch from Firestore directly
          try {
            const types = ["word", "phrase", "idiom", "native_daily_phrase"];
            for (const t of types) {
              const docRef = doc(db, "vocabulary", t, "items", singleId);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                card = { id: docSnap.id, ...docSnap.data() } as VocabItem;
                break;
              }
            }
          } catch (e) {
            console.error("Failed to fetch single card for test:", e);
          }
        }

        if (card) {
          setPracticeQueue([card]);
          setIsStudyAllMode(false);
        } else {
          showToast("Card not found in database.");
          setPracticeQueue([]);
        }
        return;
      }

      // 2. Multi-card category practice mode
      // Determine target list: due words or study-all words
      let candidates: VocabItem[] = [];

      if (isStudyAllMode) {
        if (!db) {
          // Offline study all
          const saved = localStorage.getItem("lexivault_words");
          candidates = saved ? JSON.parse(saved) : [];
        } else {
          // Online study all: fetch from target subcollections
          try {
            const types = activeTab === "all"
              ? (["word", "phrase", "idiom", "native_daily_phrase"] as const)
              : [activeTab] as const;
            
            const fetched: VocabItem[] = [];
            await Promise.all(
              types.map(async (t) => {
                const snap = await getDocs(collection(db!, "vocabulary", t, "items"));
                snap.forEach((d) => {
                  fetched.push({ id: d.id, ...d.data() } as VocabItem);
                });
              })
            );
            candidates = fetched;
          } catch (e) {
            console.error("Failed to fetch all cards for study:", e);
          }
        }
      } else {
        // Standard review mode (only due cards today)
        candidates = [...reviewWords];
      }

      // Filter candidates by category tab
      if (activeTab !== "all") {
        candidates = candidates.filter(w => w.type === activeTab);
      }

      // Shuffle and set queue
      setPracticeQueue(shuffleArray(candidates));
    } finally {
      isLoadingQueueRef.current = false;
      setLoadingQueue(false);
    }
  }, [singleId, words, reviewWords, activeTab, isStudyAllMode, showToast]);

  // Re-run buildQueue when dependencies change
  useEffect(() => {
    buildQueue();
  }, [activeTab, isStudyAllMode, singleId]);

  // Handle flashcard recall click
  const handlePracticeAction = async (known: boolean) => {
    if (practiceQueue.length === 0) return;
    const currentItem = practiceQueue[practiceIndex];

    // If we are in standard review mode, update database progress
    if (!isStudyAllMode && !singleId) {
      await updatePracticeProgress(currentItem, known);
    } else {
      // Single test or study-all mode: temporary metrics update or soft progress update
      showToast(known ? "Correct!" : "Study this card again!");
    }

    // Track session stats
    setSessionStats(prev => ({
      correct: prev.correct + (known ? 1 : 0),
      total: prev.total + 1
    }));

    // Go to next card
    if (practiceIndex + 1 >= practiceQueue.length) {
      setSessionFinished(true);
    } else {
      setPracticeIndex(prev => prev + 1);
      setShowMeaning(false);
    }
  };

  const handleRestart = () => {
    setIsStudyAllMode(false);
    buildQueue();
  };

  const activeCard = practiceQueue[practiceIndex];

  // Calculate due counts dynamically for filter tabs
  const dueCounts = useMemo(() => {
    const counts = { all: 0, word: 0, phrase: 0, idiom: 0, native_daily_phrase: 0 };
    reviewWords.forEach(w => {
      counts.all++;
      if (w.type in counts) {
        counts[w.type as keyof typeof counts]++;
      }
    });
    return counts;
  }, [reviewWords]);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      
      {/* 1. Header controls */}
      {!singleId && (
        <div className="text-center space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-1.5">
              <BrainCircuit className="w-5.5 h-5.5 text-purple-400" />
              Recall Flashcards
            </h2>
            <p className="text-xs text-slate-400">
              {isStudyAllMode ? "Custom practice session: testing all cards." : "Spaced repetition practice: verifying today's due cards."}
            </p>
          </div>

          {/* Category Tabs with due counts */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 border border-slate-900 rounded-xl overflow-x-auto max-w-full justify-center">
            {(["all", "word", "phrase", "idiom", "native_daily_phrase"] as const).map((t) => {
              const isActive = activeTab === t;
              const count = dueCounts[t];
              return (
                <button
                  key={t}
                  onClick={() => {
                    setIsStudyAllMode(false);
                    setActiveTab(t);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all border cursor-pointer whitespace-nowrap flex items-center gap-2.5 ${getTabStyles(t, isActive)}`}
                >
                  <span>{t === "all" ? "All" : getTypeLabel(t)}</span>
                  <span className={`px-2 py-0.5 text-[13px] rounded-md font-black transition-all ${getCountBadgeStyles(t, isActive)}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Loading state */}
      {loadingQueue ? (
        <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-8 h-8 border-[3px] border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold text-slate-400">Preparing practice session...</p>
        </div>
      ) : sessionFinished ? (
        /* 3. Session Complete state */
        <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[300px] space-y-6">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-450 border border-emerald-500/25">
            <Award className="w-6 h-6" />
          </div>
          
          <div className="space-y-1">
            <h4 className="text-lg font-black text-slate-100">Practice Session Complete!</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              {singleId
                ? `You completed the test for "${practiceQueue[0]?.word || "the card"}".`
                : `Retained ${sessionStats.correct} out of ${sessionStats.total} cards in this round.`
              }
            </p>
          </div>

          <div className="flex justify-center gap-3">
            {singleId ? (
              <button
                onClick={() => router.push("/library")}
                className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all cursor-pointer"
              >
                Back to Library
              </button>
            ) : (
              <button
                onClick={handleRestart}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 shadow active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Practice Again
              </button>
            )}
          </div>
        </div>
      ) : practiceQueue.length === 0 ? (
        /* 4. Empty Queue State - Offers "Practice All" */
        <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[300px] space-y-5">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/25">
            <Check className="w-6 h-6 stroke-[3]" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-100">Flashcards Queue Empty!</h4>
            <p className="text-xs text-slate-450 max-w-xs mx-auto leading-relaxed">
              All words due for review in this category today have been resolved. Would you like to launch a review session with all elements?
            </p>
          </div>
          <button
            onClick={() => setIsStudyAllMode(true)}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 shadow active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Practice All Cards
          </button>
        </div>
      ) : (
        /* 5. Active Practice UI */
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[13px] text-slate-400 font-semibold px-0.5">
            <span>
              {singleId ? "Single Card Test Mode" : `Card ${practiceIndex + 1} of ${practiceQueue.length} due`}
            </span>
            {!singleId && (
              <span>Daily Progress: {dailyProgress}/{dailyGoal} words</span>
            )}
          </div>

          {/* Compact Flashcard Grid */}
          <div
            onClick={() => setShowMeaning(!showMeaning)}
            className={`relative w-full min-h-[300px] rounded-2xl glass-panel border border-slate-900 flex flex-col justify-between p-6 text-center cursor-pointer transition-all duration-300 select-none ${
              showMeaning
                ? "bg-gradient-to-b from-[#0e1625] to-[#070b13]"
                : "hover:scale-[1.002] hover:border-cyan-500/20"
            }`}
          >
            {/* Top row */}
            <div className="flex items-center justify-between w-full" onClick={(e) => e.stopPropagation()}>
              <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded-md ${getTypeBadge(activeCard.type)}`}>
                {getTypeLabel(activeCard.type)}
              </span>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded-md ${getDifficultyBadge(activeCard.difficulty)}`}>
                  {activeCard.difficulty}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteWord(activeCard);
                    setPracticeQueue(prev => prev.filter(w => w.id !== activeCard.id));
                    if (practiceIndex >= practiceQueue.length - 1) {
                      setSessionFinished(true);
                    }
                  }}
                  className="p-1.5 rounded text-slate-500 hover:text-rose-455 transition-colors cursor-pointer"
                  title="Delete Card"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col justify-center items-center py-4">
              {!showMeaning ? (
                <div className="space-y-3 flex flex-col items-center">
                  <h3 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight glow-cyan max-w-[340px] break-words">
                    {activeCard.word}
                  </h3>
                  
                  {/* Speech synthesis play buttons (US and UK) - enabled for all types including native speaker */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {/* US Play Button */}
                    <div className="flex items-center gap-1 bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-800">
                      <span className="text-[9px] font-black text-slate-500">US</span>
                      {activeCard.type !== "native_daily_phrase" && (
                        <span className="text-[12px] font-medium text-slate-400">
                          {activeCard.pronunciationUS || "N/A"}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playPronunciation(activeCard.word, "US");
                        }}
                        className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        title="Listen US"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* UK Play Button */}
                    <div className="flex items-center gap-1 bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-800">
                      <span className="text-[9px] font-black text-slate-500">UK</span>
                      {activeCard.type !== "native_daily_phrase" && (
                        <span className="text-[12px] font-medium text-slate-400">
                          {activeCard.pronunciationUK || "N/A"}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playPronunciation(activeCard.word, "UK");
                        }}
                        className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        title="Listen UK"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-cyan-400/70 animate-pulse-slow font-bold pt-1 uppercase">
                    Click to flip card
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-w-sm animate-scale-up">
                  <div>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase block mb-0.5 tracking-wider">English Meaning</span>
                    <p className="text-[15px] font-medium text-slate-200 leading-snug">
                      {activeCard.meaning}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase block mb-0.5 tracking-wider">Nghĩa Tiếng Việt</span>
                    <p className="text-[16px] font-black text-emerald-400">
                      {activeCard.vietnamese}
                    </p>
                  </div>
                  {activeCard.example && (
                    <div>
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase block mb-0.5 tracking-wider">Usage Example</span>
                      <p className="text-[13px] text-slate-400 italic leading-relaxed">
                        &ldquo;{activeCard.example}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom info */}
            <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest border-t border-slate-900/60 pt-3">
              {showMeaning ? "Flip to word front" : "Recall definition & click to check"}
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handlePracticeAction(false)}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-xs text-rose-455 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[3]" />
              Forgot / Study again
            </button>
            <button
              onClick={() => handlePracticeAction(true)}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              Correct / Recalled
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-cyan-500/25 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    }>
      <PracticePageContent />
    </Suspense>
  );
}
