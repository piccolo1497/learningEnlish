"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { playPronunciation, shuffleArray } from "@/lib/helpers";
import {
  ArrowLeft, Check, X, Lightbulb,
  SkipForward, RotateCcw, Trophy, BookOpen,
  ChevronRight, Eye, Flame, Target, Hash,
  RefreshCcw, Volume2
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface VocabItem {
  id: string;
  word: string;
  type: "word" | "phrase" | "idiom" | "native_daily_phrase";
  meaning: string;
  vietnamese: string;
  example?: string;
  difficulty: "easy" | "medium" | "hard";
}
type Result = "correct" | "wrong" | null;

// ── Helpers ────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] { return shuffleArray(arr); }

function letterBlank(word: string) {
  return word.split("").map((c, i) => (i === 0 || c === " " ? c.toUpperCase() : "·")).join("  ");
}

const TYPE_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  word:               { bg: "bg-indigo-500/10",  text: "text-indigo-400",  border: "border-indigo-500/25",  label: "Word"             },
  phrase:             { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/25",    label: "Phrase"           },
  idiom:              { bg: "bg-purple-500/10",  text: "text-purple-400",  border: "border-purple-500/25",  label: "Idiom"            },
  native_daily_phrase:{ bg: "bg-fuchsia-500/10", text: "text-fuchsia-400", border: "border-fuchsia-500/25", label: "Native Daily"     },
};

const DIFF_STYLE: Record<string, { dot: string; text: string }> = {
  easy:   { dot: "bg-emerald-400", text: "text-emerald-400" },
  medium: { dot: "bg-amber-400",   text: "text-amber-400"   },
  hard:   { dot: "bg-rose-400",    text: "text-rose-400"    },
};


// ── Main ───────────────────────────────────────────────────────────────────
function FillBlankContent() {
  const searchParams = useSearchParams();
  const librarySource = searchParams.get("source") === "library";
  const [allWords, setAllWords] = useState<VocabItem[]>([]);
  const [loading, setLoading]  = useState(true);

  // Game state
  const [queue, setQueue]           = useState<VocabItem[]>([]);
  const [index, setIndex]           = useState(0);
  const [input, setInput]           = useState("");
  const [result, setResult]         = useState<Result>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [score, setScore]           = useState({ correct: 0, wrong: 0 });
  const [streak, setStreak]         = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [showViHint, setShowViHint] = useState(true);
  const [showLetterHint, setShowLetterHint] = useState(false);
  const [finished, setFinished]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Firebase load
  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      // Offline fallback: load from localStorage
      const saved = localStorage.getItem("lexivault_words");
      if (saved) {
        try {
          setAllWords(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse local storage words in fillblank:", e);
        }
      } else {
        // Load default starter words
        const defaultWords: VocabItem[] = [
          {
            id: "default-1",
            word: "ephemeral",
            type: "word",
            meaning: "lasting for a very short time",
            vietnamese: "phù du, chóng tàn",
            difficulty: "hard",
          },
          {
            id: "default-2",
            word: "serendipity",
            type: "word",
            meaning: "the occurrence of events by chance in a happy or beneficial way",
            vietnamese: "sự tình cờ may mắn",
            difficulty: "medium",
          },
          {
            id: "default-3",
            word: "break a leg",
            type: "idiom",
            meaning: "good luck",
            vietnamese: "chúc may mắn",
            difficulty: "easy",
          }
        ];
        setAllWords(defaultWords);
      }
      setLoading(false);
      return;
    }

    const types = ["word", "phrase", "idiom", "native_daily_phrase"] as const;
    
    const fetchAll = async () => {
      try {
        const fetched: VocabItem[] = [];
        await Promise.all(
          types.map(async (t) => {
            const snap = await getDocs(collection(db!, "vocabulary", t, "items"));
            snap.docs.forEach((d) => {
              fetched.push({ id: d.id, ...d.data() } as VocabItem);
            });
          })
        );
        setAllWords(fetched);
      } catch (error) {
        console.error("Firestore loading error in fillblank:", error);
        const saved = localStorage.getItem("lexivault_words");
        if (saved) {
          try {
            setAllWords(JSON.parse(saved));
          } catch (e) {}
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  const startGame = useCallback((words: VocabItem[]) => {
    if (!words.length) return;
    setQueue(shuffle(words));
    setIndex(0); setInput(""); setResult(null); setAnswerRevealed(false);
    setScore({ correct: 0, wrong: 0 }); setStreak(0);
    setShowViHint(true); setShowLetterHint(false); setFinished(false);
  }, []);

  // If navigated from library with custom selection, use those items
  useEffect(() => {
    if (librarySource) {
      try {
        const raw = sessionStorage.getItem("lexivault_custom_practice");
        if (raw) {
          const items: VocabItem[] = JSON.parse(raw);
          if (items.length > 0) {
            setAllWords(items);
            setLoading(false);
            sessionStorage.removeItem("lexivault_custom_practice");
            return;
          }
        }
      } catch (e) {
        console.error("Failed to load custom fillblank queue:", e);
      }
    }
  }, [librarySource]);

  useEffect(() => { if (!loading && allWords.length) startGame(allWords); }, [loading, allWords, startGame]);
  useEffect(() => { if (result === null) inputRef.current?.focus(); }, [index, result]);

  // Listen for Enter key to advance to next card when answer is checked
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && result !== null && !finished) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [result, finished, index, queue.length]);

  const current = queue[index];
  const total   = score.correct + score.wrong;
  const accuracy = total ? Math.round((score.correct / total) * 100) : 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (result !== null || !current || !input.trim()) return;
    const ok = input.trim().toLowerCase() === current.word.trim().toLowerCase();
    setResult(ok ? "correct" : "wrong");
    if (ok) {
      const ns = streak + 1;
      setStreak(ns); setBestStreak((b) => Math.max(b, ns));
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
    } else {
      setStreak(0);
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
  };

  const handleSkip = () => {
    if (result !== null) return;
    setStreak(0);
    setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    setResult("wrong");
  };

  const handleNext = () => {
    setInput(""); setResult(null); setAnswerRevealed(false);
    setShowViHint(true); setShowLetterHint(false);
    if (index + 1 >= queue.length) setFinished(true);
    else setIndex((i) => i + 1);
  };

  const handleTryAgain = () => {
    setInput(""); setResult(null); setAnswerRevealed(false);
  };

  // ── Finished ─────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="max-w-xl mx-auto space-y-6 text-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
            <Trophy className="w-11 h-11 text-white animate-bounce" />
          </div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Round Complete!</h1>
          <p className="text-slate-400 text-sm">{queue.length} words · Best streak 🔥{bestStreak}</p>
        </div>

        <div className="grid grid-cols-3 gap-4 w-full max-w-sm mx-auto">
          {[
            { label: "Correct",  value: score.correct, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { label: "Wrong",    value: score.wrong,   color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/20"       },
            { label: "Accuracy", value: `${accuracy}%`,color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20"       },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl border p-4 text-center ${s.bg}`}>
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-3">
          <button onClick={() => startGame(allWords)}
            className="flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-black bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:from-cyan-300 hover:to-blue-400 active:scale-95 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer">
            <RotateCcw className="w-4 h-4 text-slate-950 stroke-[2.5]" /> Play Again
          </button>
          <Link href="/" className="flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-black bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> Back Home
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading || !current) {
    return (
      <div className="flex items-center justify-center gap-3 py-20">
        <div className="w-8 h-8 border-[3px] border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-semibold">Preparing game queue…</p>
      </div>
    );
  }

  const typeStyle = TYPE_STYLE[current.type] ?? TYPE_STYLE.word;
  const diffStyle = DIFF_STYLE[current.difficulty] ?? DIFF_STYLE.medium;
  const progressPct = Math.round((index / queue.length) * 100);

  // ── Game UI ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full px-2">
      
      {/* Game Header: Progress & Scores */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-950/40 border border-slate-900">
        <div className="flex-1 flex flex-col gap-1.5 min-w-[200px]">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span>Round Progress</span>
            <span>{index + 1} / {queue.length}</span>
          </div>
          <div className="h-2 bg-slate-950 border border-slate-900 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {streak >= 2 && (
            <span className="flex items-center gap-1.5 text-xs font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
              <Flame className="w-3.5 h-3.5 fill-amber-400" /> {streak} Streak
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
            <Check className="w-3.5 h-3.5 stroke-[3]" /> {score.correct} Correct
          </span>
          <span className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl">
            <X className="w-3.5 h-3.5 stroke-[3]" /> {score.wrong} Wrong
          </span>
          <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-xl">
            <Target className="w-3.5 h-3.5" /> {accuracy}% Accuracy
          </span>
        </div>
      </div>

      {/* Main Game Card */}
      <div className="glass-panel rounded-3xl border border-slate-900 p-6 md:p-8 space-y-6 bg-gradient-to-b from-[#0a0f1d]/40 to-slate-950/20 backdrop-blur-md w-full shadow-xl">
        
        {/* Card Header: Meta + word type */}
        <div className="flex items-center justify-between border-b border-slate-900/60 pb-4">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>
              {typeStyle.label}
            </span>
            <span className={`flex items-center gap-1.5 text-[11px] font-bold ${diffStyle.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${diffStyle.dot}`} />
              {current.difficulty}
            </span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <Hash className="w-3.5 h-3.5" /> {current.word.replace(/\s+/g, "").length} characters
          </span>
        </div>

        {/* English Meaning (clue) */}
        <div className="space-y-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" /> English Meaning
          </p>
          <p className="text-xl md:text-2xl text-slate-100 font-black leading-relaxed">
            {current.meaning}
          </p>
        </div>

        {/* Hints Panel: Vietnamese & Letter Hints side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Vietnamese hint */}
          <div
            onClick={() => setShowViHint((v) => !v)}
            className="p-4 rounded-2xl bg-slate-950/30 border border-slate-900 space-y-2.5 cursor-pointer hover:bg-slate-900/40 hover:border-slate-800 transition-all select-none"
          >
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-amber-400 transition-colors">
              <Eye className="w-3.5 h-3.5" />
              {showViHint ? "Hide" : "Show"} Vietnamese Hint
            </div>
            {showViHint && (
              <p className="text-base font-extrabold text-amber-400 transition-all animate-fade-in">{current.vietnamese}</p>
            )}
          </div>

          {/* Letter hint */}
          <div
            onClick={() => setShowLetterHint((v) => !v)}
            className="p-4 rounded-2xl bg-slate-950/30 border border-slate-900 space-y-2.5 cursor-pointer hover:bg-slate-900/40 hover:border-slate-800 transition-all select-none"
          >
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-cyan-400 transition-colors">
              <Lightbulb className="w-3.5 h-3.5" />
              {showLetterHint ? "Hide" : "Show"} Letter Hint
            </div>
            {showLetterHint && (
              <p className="font-mono text-base font-bold text-cyan-400 tracking-[0.25em] leading-relaxed transition-all animate-fade-in">{letterBlank(current.word)}</p>
            )}
          </div>
        </div>

        {/* Input & feedback section */}
        <div className="space-y-4 pt-2">
          {/* Result state banner */}
          {result === "correct" && (
            <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 animate-scale-up">
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-white stroke-[3]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-emerald-400">Correct! 🎉</p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {streak > 1 ? `🔥 ${streak} in a row!` : "Keep it up!"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => playPronunciation(current.word, "US")}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-350 hover:text-emerald-400 hover:bg-slate-800 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> US
                    </button>
                    <button
                      type="button"
                      onClick={() => playPronunciation(current.word, "UK")}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-350 hover:text-emerald-400 hover:bg-slate-800 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> UK
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {result === "wrong" && (
            <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-rose-955/40 border border-rose-500/30 animate-scale-up">
              <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center shrink-0 mt-0.5">
                <X className="w-4 h-4 text-white stroke-[3]" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-rose-455">{input.trim() ? "Not quite right." : "Skipped."}</p>
                    {answerRevealed ? (
                      <p className="text-sm text-slate-300 mt-1">
                        Answer: <span className="font-black text-slate-100">{current.word}</span>
                      </p>
                    ) : (
                      <button
                        onClick={() => setAnswerRevealed(true)}
                        className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 underline underline-offset-2 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> Reveal answer
                      </button>
                    )}
                  </div>
                  {answerRevealed && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => playPronunciation(current.word, "US")}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-350 hover:text-rose-400 hover:bg-slate-800 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" /> US
                      </button>
                      <button
                        type="button"
                        onClick={() => playPronunciation(current.word, "UK")}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-350 hover:text-rose-400 hover:bg-slate-800 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" /> UK
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={result !== null}
                placeholder="Type your answer here…"
                autoComplete="off"
                className={`w-full px-5 py-4 text-base font-semibold rounded-2xl border-2 focus:outline-none transition-all duration-200
                  ${result === "correct"
                    ? "bg-emerald-955/20 border-emerald-500/50 text-emerald-300 cursor-not-allowed"
                    : result === "wrong"
                    ? "bg-rose-955/20 border-rose-500/40 text-rose-300 cursor-not-allowed"
                    : "bg-slate-900/40 border-slate-800 text-slate-100 focus:border-cyan-500/60 placeholder-slate-600 hover:border-slate-700"
                  }`}
              />
            </div>

            {/* Action buttons */}
            {result === null && (
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold
                    bg-gradient-to-r from-cyan-550 to-blue-600 text-white
                    hover:from-cyan-400 hover:to-blue-500
                    disabled:opacity-30 disabled:cursor-not-allowed
                    active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-cyan-500/15"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" /> Check Answer
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="flex items-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-bold
                    text-slate-400 bg-slate-900/70 hover:bg-slate-800 hover:text-slate-200
                    border border-slate-800 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" /> Skip
                </button>
              </div>
            )}

            {result === "correct" && (
              <button
                type="button"
                onClick={handleNext}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold
                  bg-gradient-to-r from-emerald-500 to-teal-605 text-white
                  hover:from-emerald-400 hover:to-teal-500
                  active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-emerald-500/15"
              >
                Next Word <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {result === "wrong" && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleTryAgain}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold
                    text-amber-400 bg-amber-500/10 hover:bg-amber-500/15
                    border border-amber-500/25 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <RefreshCcw className="w-4 h-4" /> Try Again
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold
                    text-slate-200 bg-slate-800 hover:bg-slate-700
                    border border-slate-700 active:scale-[0.98] transition-all cursor-pointer"
                >
                  Next Word <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Example revealed at the bottom */}
        {answerRevealed && current.example && (
          <div className="pt-6 border-t border-slate-900/80 space-y-2 animate-fade-in">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Example Sentence</p>
            <p className="text-sm md:text-base text-slate-300 italic leading-relaxed">{current.example}</p>
          </div>
        )}

        {/* Restart */}
        <div className="pt-4 text-center">
          <button
            onClick={() => startGame(allWords)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-650 hover:text-slate-400 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restart with new shuffle
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FillBlankPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-cyan-500/25 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    }>
      <FillBlankContent />
    </Suspense>
  );
}
