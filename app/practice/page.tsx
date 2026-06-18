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
  Award,
  BookOpen,
  Star,
  Settings2,
  Play,
  Sliders,
  ChevronLeft
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
  const librarySource = searchParams.get("source") === "library";

  const {
    words,
    reviewWords,
    dailyProgress,
    dailyGoal,
    updatePracticeProgress,
    deleteWord,
    showToast
  } = useVocab();

  // Setup options states
  const [isConfigured, setIsConfigured] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"due" | "all" | "starred">("due");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "word" | "phrase" | "idiom" | "native_daily_phrase">("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [sessionLimit, setSessionLimit] = useState<number>(20);

  // Active Practice Queue
  const [practiceQueue, setPracticeQueue] = useState<VocabItem[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });

  const [loadingQueue, setLoadingQueue] = useState(false);
  const isLoadingQueueRef = useRef(false);

  // Local catalog cache for counting and quick filter setup
  const [allCatalog, setAllCatalog] = useState<VocabItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      if (!db) {
        const saved = localStorage.getItem("lexivault_words");
        setAllCatalog(saved ? JSON.parse(saved) : []);
      } else {
        const types = ["word", "phrase", "idiom", "native_daily_phrase"] as const;
        const fetched: VocabItem[] = [];
        await Promise.all(
          types.map(async (t) => {
            const snap = await getDocs(collection(db!, "vocabulary", t, "items"));
            snap.forEach((d) => {
              fetched.push({ id: d.id, ...d.data() } as VocabItem);
            });
          })
        );
        setAllCatalog(fetched);
      }
    } catch (e) {
      console.error("Failed to load catalog:", e);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog, words]);

  // Compute matching count in real time for config preview
  const matchingCount = useMemo(() => {
    let candidates = selectedMode === "due" ? [...reviewWords] : [...allCatalog];
    
    if (selectedMode === "starred") {
      candidates = candidates.filter(w => w.bookmarked === true);
    }
    if (selectedCategory !== "all") {
      candidates = candidates.filter(w => w.type === selectedCategory);
    }
    if (selectedDifficulty !== "all") {
      candidates = candidates.filter(w => w.difficulty === selectedDifficulty);
    }
    return candidates.length;
  }, [allCatalog, reviewWords, selectedMode, selectedCategory, selectedDifficulty]);

  // Load single card test mode on mount if id is in query params
  useEffect(() => {
    if (singleId) {
      setIsConfigured(true);
      buildSingleQueue(singleId);
    }
  }, [singleId]);

  // Load custom library selection on mount if source=library
  useEffect(() => {
    if (librarySource && !singleId) {
      try {
        const raw = sessionStorage.getItem("lexivault_custom_practice");
        if (raw) {
          const items: VocabItem[] = JSON.parse(raw);
          if (items.length > 0) {
            setIsConfigured(true);
            setLoadingQueue(false);
            setSessionFinished(false);
            setPracticeIndex(0);
            setShowMeaning(false);
            setSessionStats({ correct: 0, total: 0 });
            setPracticeQueue(shuffleArray(items));
            sessionStorage.removeItem("lexivault_custom_practice");
            return;
          }
        }
      } catch (e) {
        console.error("Failed to load custom practice queue:", e);
      }
    }
  }, [librarySource, singleId]);

  const buildSingleQueue = async (id: string) => {
    setLoadingQueue(true);
    setSessionFinished(false);
    setPracticeIndex(0);
    setShowMeaning(false);
    setSessionStats({ correct: 0, total: 0 });

    let card = words.find(w => w.id === id) || reviewWords.find(w => w.id === id);
    if (!card && db) {
      try {
        const types = ["word", "phrase", "idiom", "native_daily_phrase"];
        for (const t of types) {
          const docRef = doc(db, "vocabulary", t, "items", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            card = { id: docSnap.id, ...docSnap.data() } as VocabItem;
            break;
          }
        }
      } catch (e) {
        console.error("Failed to fetch single card:", e);
      }
    }

    if (card) {
      setPracticeQueue([card]);
    } else {
      showToast("Card not found in database.");
      setPracticeQueue([]);
      setIsConfigured(false);
    }
    setLoadingQueue(false);
  };

  // Build queue based on configured parameters
  const startSession = async () => {
    if (isLoadingQueueRef.current) return;
    isLoadingQueueRef.current = true;
    setLoadingQueue(true);
    setSessionFinished(false);
    setPracticeIndex(0);
    setShowMeaning(false);
    setSessionStats({ correct: 0, total: 0 });
    setIsConfigured(true);

    try {
      let candidates = selectedMode === "due" ? [...reviewWords] : [...allCatalog];

      // Filter by Mode
      if (selectedMode === "starred") {
        candidates = candidates.filter(w => w.bookmarked === true);
      }

      // Filter by Category Scope
      if (selectedCategory !== "all") {
        candidates = candidates.filter(w => w.type === selectedCategory);
      }

      // Filter by Difficulty
      if (selectedDifficulty !== "all") {
        candidates = candidates.filter(w => w.difficulty === selectedDifficulty);
      }

      // Shuffle
      let finalQueue = shuffleArray(candidates);

      // Slice to Session Size Limit
      if (sessionLimit > 0 && finalQueue.length > sessionLimit) {
        finalQueue = finalQueue.slice(0, sessionLimit);
      }

      setPracticeQueue(finalQueue);
    } catch (e) {
      console.error("Failed to start session:", e);
      showToast("Error starting practice session.");
      setIsConfigured(false);
    } finally {
      isLoadingQueueRef.current = false;
      setLoadingQueue(false);
    }
  };

  // Handle flashcard recall click
  const handlePracticeAction = async (known: boolean) => {
    if (practiceQueue.length === 0) return;
    const currentItem = practiceQueue[practiceIndex];

    // Spaced Repetition logic only updates database on due reviews
    if (selectedMode === "due" && !singleId) {
      await updatePracticeProgress(currentItem, known);
    } else {
      showToast(known ? "Correct!" : "Soft flagged for review.");
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
    setIsConfigured(false);
    setSessionFinished(false);
  };

  const activeCard = practiceQueue[practiceIndex];

  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full px-2">
      {!isConfigured ? (
        /* PRACTICE SETUP CONFIGURATION VIEW */
        <div className="space-y-6 animate-scale-up">
          {/* Header Dashboard Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d1424] to-[#080d19] border border-slate-900 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <BrainCircuit className="w-6 h-6" />
                  </span>
                  <h2 className="text-2xl font-black text-slate-100 tracking-tight">Practice Arena</h2>
                </div>
                <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                  Tailor your flashcard practice session. Target due reviews to stay on top of your learning schedule, or customize a review session for specific categories.
                </p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 px-4 py-3 rounded-2xl flex items-center gap-5 self-start md:self-auto shadow-inner">
                <div className="text-left">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider">Due Today</span>
                  <span className="text-xl font-black text-cyan-400">{reviewWords.length} cards</span>
                </div>
                <div className="h-8 w-px bg-slate-800" />
                <div className="text-left">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider">Total Catalog</span>
                  <span className="text-xl font-black text-purple-400">{allCatalog.length} cards</span>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* COLUMN 1: PRACTICE MODE */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-900 bg-[#0a101d]/60 space-y-4 flex flex-col">
              <h3 className="text-sm font-extrabold text-slate-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" /> Session Mode
              </h3>
              
              <div className="space-y-3 flex-1">
                {/* Due Mode */}
                <button
                  type="button"
                  onClick={() => setSelectedMode("due")}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                    selectedMode === "due"
                      ? "bg-cyan-500/5 border-cyan-500/40 text-slate-100 shadow-sm"
                      : "bg-slate-950/40 border-slate-900 text-slate-400 hover:bg-slate-900 hover:text-slate-355"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`p-1.5 rounded-lg border mt-0.5 ${selectedMode === "due" ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-slate-900 border-slate-800 text-slate-500"}`}>
                      <BrainCircuit className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider">Due Cards</h4>
                      <p className="text-[11px] text-slate-450 mt-1 leading-snug">
                        Review cards scheduled for today using spaced repetition rules.
                      </p>
                    </div>
                  </div>
                  <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold bg-cyan-500/10 text-cyan-400 rounded-md border border-cyan-500/10">
                    {reviewWords.length}
                  </span>
                </button>

                {/* Starred Mode */}
                <button
                  type="button"
                  onClick={() => setSelectedMode("starred")}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                    selectedMode === "starred"
                      ? "bg-amber-500/5 border-amber-500/40 text-slate-100 shadow-sm"
                      : "bg-slate-950/40 border-slate-900 text-slate-400 hover:bg-slate-900 hover:text-slate-355"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`p-1.5 rounded-lg border mt-0.5 ${selectedMode === "starred" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-slate-900 border-slate-800 text-slate-500"}`}>
                      <Star className="w-4 h-4 fill-current" />
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider">Bookmarked Only</h4>
                      <p className="text-[11px] text-slate-450 mt-1 leading-snug">
                        Focus practice sessions exclusively on starred items.
                      </p>
                    </div>
                  </div>
                  <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400 rounded-md border border-amber-500/10">
                    {allCatalog.filter(w => w.bookmarked).length}
                  </span>
                </button>

                {/* Custom/All Mode */}
                <button
                  type="button"
                  onClick={() => setSelectedMode("all")}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                    selectedMode === "all"
                      ? "bg-purple-500/5 border-purple-500/40 text-slate-100 shadow-sm"
                      : "bg-slate-950/40 border-slate-900 text-slate-400 hover:bg-slate-900 hover:text-slate-355"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`p-1.5 rounded-lg border mt-0.5 ${selectedMode === "all" ? "bg-purple-500/10 border-purple-500/20 text-purple-400" : "bg-slate-900 border-slate-800 text-slate-500"}`}>
                      <BookOpen className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider">Study All</h4>
                      <p className="text-[11px] text-slate-450 mt-1 leading-snug">
                        Practice custom reviews using all elements in database.
                      </p>
                    </div>
                  </div>
                  <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold bg-purple-500/10 text-purple-400 rounded-md border border-purple-500/10">
                    {allCatalog.length}
                  </span>
                </button>
              </div>
            </div>

            {/* COLUMN 2: CATEGORY & DIFFICULTY */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-900 bg-[#0a101d]/60 space-y-6 flex flex-col justify-between">
              {/* Category selector */}
              <div className="space-y-3">
                <h3 className="text-sm font-extrabold text-slate-200 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-400" /> Category Scope
                </h3>
                
                <div className="grid grid-cols-2 gap-2">
                  {(["all", "word", "phrase", "idiom", "native_daily_phrase"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
                        selectedCategory === cat
                          ? "bg-slate-900 text-cyan-400 border-cyan-500/40 shadow-sm"
                          : "bg-slate-950/45 border-slate-900 text-slate-400 hover:bg-slate-900 hover:text-slate-350"
                      } ${cat === "all" ? "col-span-2" : ""}`}
                    >
                      {cat === "all" ? "All Categories" : getTypeLabel(cat)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty selector */}
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-extrabold text-slate-200 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-amber-400" /> Difficulty Level
                </h3>
                
                <div className="grid grid-cols-2 gap-2">
                  {(["all", "easy", "medium", "hard"] as const).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setSelectedDifficulty(diff)}
                      className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
                        selectedDifficulty === diff
                          ? "bg-slate-900 text-amber-400 border-amber-500/40 shadow-sm"
                          : "bg-slate-950/45 border-slate-900 text-slate-400 hover:bg-slate-900 hover:text-slate-350"
                      }`}
                    >
                      {diff === "all" ? "All Levels" : diff}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* COLUMN 3: SESSION SIZE */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-900 bg-[#0a101d]/60 space-y-4 flex flex-col">
              <h3 className="text-sm font-extrabold text-slate-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" /> Session Size
              </h3>
              
              <div className="space-y-2.5 flex-1">
                {([10, 20, 50, 0] as const).map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => setSessionLimit(limit)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      sessionLimit === limit
                        ? "bg-emerald-500/5 border-emerald-500/45 text-slate-100 shadow-sm"
                        : "bg-slate-950/40 border-slate-900 text-slate-450 hover:bg-slate-900 hover:text-slate-350"
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider">
                        {limit === 0 ? "Unlimited" : `${limit} Cards`}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {limit === 0 ? "Review all matching cards" : `Review up to ${limit} items`}
                      </p>
                    </div>
                    {sessionLimit === limit && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/50" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Launch Control Panel */}
          <div className="flex flex-col items-center gap-3.5 pt-4">
            <button
              onClick={startSession}
              disabled={matchingCount === 0}
              className={`px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 flex items-center gap-2 shadow-lg ${
                matchingCount === 0
                  ? "bg-slate-900 border border-slate-950 text-slate-500 cursor-not-allowed opacity-50"
                  : "bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-450 text-slate-950 hover:scale-[1.01] active:scale-95 shadow-cyan-500/10 cursor-pointer"
              }`}
            >
              <Play className="w-4 h-4 fill-current stroke-[2.5]" />
              Start Recall Session
            </button>
            <span className="text-xs text-slate-400 font-bold">
              {matchingCount === 0
                ? "No matching vocabulary cards found. Adjust selections to start."
                : `${matchingCount} vocabulary ${matchingCount === 1 ? "item matches" : "items match"} current selection.`
              }
            </span>
          </div>
        </div>
      ) : (
        /* ACTIVE PRACTICE SESSION OR FINISHED VIEW */
        <div className="space-y-6">
          {/* Breadcrumb back control */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleRestart}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-450 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
              <span>Back to Practice Setup</span>
            </button>
            
            {!singleId && !sessionFinished && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400">
                Daily Progress: <span className="text-cyan-400 font-extrabold">{dailyProgress}/{dailyGoal}</span>
              </span>
            )}
          </div>

          {loadingQueue ? (
            /* Loading State */
            <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[360px]">
              <div className="w-8 h-8 border-[3px] border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-3" />
              <p className="text-xs font-semibold text-slate-400">Preparing session cards...</p>
            </div>
          ) : sessionFinished ? (
            /* Session Finished Results Panel */
            <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[380px] space-y-6 max-w-xl mx-auto">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-450 border border-emerald-500/20 shadow-sm animate-bounce-slow">
                <Award className="w-7 h-7" />
              </div>
              
              <div className="space-y-2">
                <h4 className="text-xl font-black text-slate-100">Practice Session Complete!</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  {singleId
                    ? `You finished reviewing the card for "${practiceQueue[0]?.word || "the item"}".`
                    : `You successfully recalled ${sessionStats.correct} out of ${sessionStats.total} cards in this round.`
                  }
                </p>
              </div>

              {/* Accuracy score circle */}
              {sessionStats.total > 0 && (
                <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
                  <svg className="w-32 h-32 transform -rotate-90 absolute top-0 left-0" viewBox="0 0 128 128">
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      className="stroke-slate-900"
                      strokeWidth="8"
                      fill="transparent"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      className="stroke-emerald-400"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={339.3}
                      strokeDashoffset={339.3 - (339.3 * (sessionStats.correct / sessionStats.total))}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 pointer-events-none">
                    <span className="block text-2xl font-black text-slate-100 leading-none">
                      {Math.round((sessionStats.correct / sessionStats.total) * 100)}%
                    </span>
                    <span className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mt-1.5">Accuracy</span>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3.5 pt-2">
                <button
                  onClick={handleRestart}
                  className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all cursor-pointer"
                >
                  Configure New Session
                </button>
                {!singleId && (
                  <button
                    onClick={startSession}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 shadow active:scale-95 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Practice Again
                  </button>
                )}
              </div>
            </div>
          ) : practiceQueue.length === 0 ? (
            /* Empty Queue State */
            <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[360px] space-y-5 max-w-xl mx-auto">
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-405 border border-cyan-500/20">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-100">No cards in queue!</h4>
                <p className="text-xs text-slate-450 max-w-xs mx-auto leading-relaxed">
                  No cards match the current practice configuration rules. Try choosing another category or mode.
                </p>
              </div>
              <button
                onClick={handleRestart}
                className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all cursor-pointer"
              >
                Go Back to Setup
              </button>
            </div>
          ) : (
            /* ACTIVE PRACTICE VIEW */
            <div className="space-y-4">
              {/* Progress Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-455 font-bold px-0.5">
                  <span>
                    {singleId ? "Single Card Recall Test" : `Item ${practiceIndex + 1} of ${practiceQueue.length}`}
                  </span>
                  {!singleId && (
                    <span className="text-cyan-400 font-extrabold">
                      Accuracy: {sessionStats.total > 0 ? Math.round((sessionStats.correct / sessionStats.total) * 100) : 100}%
                    </span>
                  )}
                </div>
                {/* Custom Progress Bar */}
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                    style={{ width: `${((practiceIndex + (showMeaning ? 1 : 0)) / practiceQueue.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Large, Redesigned stage card */}
              <div
                onClick={() => setShowMeaning(!showMeaning)}
                className={`relative w-full min-h-[380px] rounded-3xl glass-panel border border-slate-900 flex flex-col justify-between p-6 lg:p-8 text-center cursor-pointer transition-all duration-300 select-none ${
                  showMeaning
                    ? "bg-gradient-to-b from-[#0b1220]/80 to-[#050812]/90 border-slate-850"
                    : "hover:scale-[1.002] hover:border-cyan-500/20 bg-slate-950/20"
                }`}
              >
                {/* Top header row */}
                <div className="flex items-center justify-between w-full" onClick={(e) => e.stopPropagation()}>
                  <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md ${getTypeBadge(activeCard.type)}`}>
                    {getTypeLabel(activeCard.type)}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md ${getDifficultyBadge(activeCard.difficulty)}`}>
                      {activeCard.difficulty}
                    </span>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteWord(activeCard);
                        setPracticeQueue(prev => prev.filter(w => w.id !== activeCard.id));
                        setAllCatalog(prev => prev.filter(w => w.id !== activeCard.id));
                        if (practiceIndex >= practiceQueue.length - 1) {
                          setSessionFinished(true);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-455 hover:bg-slate-900/60 transition-all cursor-pointer"
                      title="Delete Card"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Content Stage */}
                <div className="flex-1 flex flex-col justify-center items-center py-6 w-full">
                  {!showMeaning ? (
                    /* Front State (Unflipped) */
                    <div className="space-y-4 flex flex-col items-center">
                      <h3 className="text-3.5xl lg:text-4.5xl font-black text-slate-100 tracking-tight glow-cyan max-w-[500px] break-words leading-none mb-1">
                        {activeCard.word}
                      </h3>
                      
                      {/* Audio controls */}
                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                        {/* US Accent */}
                        <div className="flex items-center gap-1 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-800">
                          <span className="text-[9px] font-black text-slate-505 uppercase">US</span>
                          {activeCard.type !== "native_daily_phrase" && (
                            <span className="text-[12px] font-semibold text-slate-400">
                              {activeCard.pronunciationUS || "N/A"}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playPronunciation(activeCard.word, "US");
                            }}
                            className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                            title="Listen US Pronunciation"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* UK Accent */}
                        <div className="flex items-center gap-1 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-800">
                          <span className="text-[9px] font-black text-slate-505 uppercase">UK</span>
                          {activeCard.type !== "native_daily_phrase" && (
                            <span className="text-[12px] font-semibold text-slate-400">
                              {activeCard.pronunciationUK || "N/A"}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playPronunciation(activeCard.word, "UK");
                            }}
                            className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                            title="Listen UK Pronunciation"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-cyan-400/85 animate-pulse font-extrabold pt-2 uppercase tracking-wider">
                        Click card to flip & check definition
                      </p>
                    </div>
                  ) : (
                    /* Back State (Flipped - Balanced top-to-bottom layout) */
                    <div className="w-full space-y-6 max-w-4xl mx-auto animate-scale-up text-center">
                      {/* Top Centered Section: Word & Audio */}
                      <div className="space-y-3">
                        <h3 className="text-3xl lg:text-4xl font-black text-slate-100 tracking-tight break-words">
                          {activeCard.word}
                        </h3>
                        
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-800">
                            <span className="text-[9px] font-black text-slate-500 uppercase">US</span>
                            {activeCard.type !== "native_daily_phrase" && (
                              <span className="text-[12px] font-semibold text-slate-400">
                                {activeCard.pronunciationUS || "N/A"}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playPronunciation(activeCard.word, "US");
                              }}
                              className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                            >
                              <Volume2 className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-800">
                            <span className="text-[9px] font-black text-slate-500 uppercase">UK</span>
                            {activeCard.type !== "native_daily_phrase" && (
                              <span className="text-[12px] font-semibold text-slate-400">
                                {activeCard.pronunciationUK || "N/A"}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playPronunciation(activeCard.word, "UK");
                              }}
                              className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                            >
                              <Volume2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-px w-full bg-slate-900/60" />

                      {/* Bottom Section: Split details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                        {/* Left Column: Meanings */}
                        <div className="space-y-4">
                          {/* English Meaning */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">English Meaning</span>
                            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-900/80 leading-relaxed text-[13.5px] font-medium text-slate-200">
                              {activeCard.meaning}
                            </div>
                          </div>

                          {/* Vietnamese Translation */}
                          <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-1 shadow-sm">
                            <span className="text-[10px] font-black text-emerald-550 uppercase tracking-wider block">Vietnamese Meaning</span>
                            <p className="text-[15px] font-black text-emerald-400">
                              {activeCard.vietnamese}
                            </p>
                          </div>
                        </div>

                        {/* Right Column: Examples & Phrases */}
                        <div className="space-y-4">
                          {/* Usage Example */}
                          {activeCard.example && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest block">Usage Example</span>
                              <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-900 border-l-2 border-l-cyan-500/40 text-[13px] text-slate-350 italic leading-relaxed">
                                &ldquo;{activeCard.example}&rdquo;
                              </div>
                            </div>
                          )}

                          {/* Common Phrases */}
                          {activeCard.commonPhrases && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest block">Common Phrases</span>
                              <div className="flex flex-wrap gap-1.5">
                                {activeCard.commonPhrases.split("\n").filter(line => line.trim()).map((phrase, idx) => (
                                  <span key={idx} className="px-2.5 py-1 rounded bg-cyan-500/5 text-cyan-400 border border-cyan-500/10 text-[11px] font-semibold">
                                    {phrase}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom navigation info */}
                <div className="text-[10px] text-slate-505 font-extrabold uppercase tracking-widest border-t border-slate-900/60 pt-3">
                  {showMeaning ? "Click anywhere on card to flip back" : "Recall the meaning, then click card to check details"}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto pt-2">
                <button
                  onClick={() => handlePracticeAction(false)}
                  className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl font-black text-xs text-rose-455 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 active:scale-95 transition-all cursor-pointer shadow-sm shadow-rose-950/20"
                >
                  <X className="w-4 h-4 stroke-[3]" />
                  Forgot / Study again
                </button>
                <button
                  onClick={() => handlePracticeAction(true)}
                  className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl font-black text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 active:scale-95 transition-all cursor-pointer shadow-sm shadow-emerald-950/20"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  Correct / Recalled
                </button>
              </div>
            </div>
          )}
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
