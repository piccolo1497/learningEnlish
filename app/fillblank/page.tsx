"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ArrowLeft, PenLine, Check, X, Lightbulb,
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
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

const cleanWordForSpeech = (str: string): string => {
  let cleaned = str;
  // Remove starting "(to) " cleanly
  cleaned = cleaned.replace(/^\s*\(to\)\s*/i, "");
  // Remove any other text inside parentheses
  cleaned = cleaned.replace(/\([^)]*\)/g, " ");
  // If it contains a slash, take the first option
  if (cleaned.includes("/")) {
    cleaned = cleaned.split("/")[0];
  }
  // Trim and normalize multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
};

const playPronunciation = (word: string, accent: "US" | "UK") => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const speak = () => {
    const cleanWord = cleanWordForSpeech(word);
    if (!cleanWord) return;

    const utterance = new SpeechSynthesisUtterance(cleanWord);
    utterance.lang = accent === "US" ? "en-US" : "en-GB";
    utterance.rate = 0.95;

    const voices = window.speechSynthesis.getVoices();
    const targetLang = accent === "US" ? "en-us" : "en-gb";

    // 1. Precise lang match (en-US or en-GB)
    let voice = voices.find(v => {
      const l = v.lang.toLowerCase().replace("_", "-");
      return l === targetLang || l.startsWith(targetLang + "-");
    });

    // 2. Keyword fallback for US/UK names
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


// ── Main ───────────────────────────────────────────────────────────────────
export default function FillBlankPage() {
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
  const [showViHint, setShowViHint] = useState(false);
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
    const loaded: Record<string, VocabItem[]> = {};
    const seen = new Set<string>();
    const unsubs = types.map((t) =>
      onSnapshot(
        collection(db!, "vocabulary", t, "items"), 
        (snap) => {
          loaded[t] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as VocabItem));
          seen.add(t);
          if (seen.size === types.length) {
            setAllWords(Object.values(loaded).flat());
            setLoading(false);
          }
        },
        (error) => {
          console.error(`Firestore loading error in fillblank for ${t}:`, error);
          const saved = localStorage.getItem("lexivault_words");
          if (saved) {
            try {
              setAllWords(JSON.parse(saved));
            } catch (e) {}
          }
          setLoading(false);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const startGame = useCallback((words: VocabItem[]) => {
    if (!words.length) return;
    setQueue(shuffle(words));
    setIndex(0); setInput(""); setResult(null); setAnswerRevealed(false);
    setScore({ correct: 0, wrong: 0 }); setStreak(0);
    setShowViHint(false); setShowLetterHint(false); setFinished(false);
  }, []);

  useEffect(() => { if (!loading && allWords.length) startGame(allWords); }, [loading, allWords, startGame]);
  useEffect(() => { if (result === null) inputRef.current?.focus(); }, [index, result]);

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
    setShowViHint(false); setShowLetterHint(false);
    if (index + 1 >= queue.length) setFinished(true);
    else setIndex((i) => i + 1);
  };

  const handleTryAgain = () => {
    setInput(""); setResult(null); setAnswerRevealed(false);
  };

  // ── Finished ─────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="min-h-screen bg-[#080d16] flex flex-col items-center justify-center p-8 gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
            <Trophy className="w-11 h-11 text-white" />
          </div>
          <h1 className="text-4xl font-black text-slate-100 tracking-tight">Round Complete!</h1>
          <p className="text-slate-500 text-sm">{queue.length} words · Best streak 🔥{bestStreak}</p>
        </div>

        <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
          {[
            { label: "Correct",  value: score.correct, color: "text-emerald-400", bg: "bg-emerald-500/8 border-emerald-500/20" },
            { label: "Wrong",    value: score.wrong,   color: "text-rose-400",    bg: "bg-rose-500/8 border-rose-500/20"       },
            { label: "Accuracy", value: `${accuracy}%`,color: "text-cyan-400",    bg: "bg-cyan-500/8 border-cyan-500/20"       },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl border p-5 text-center ${s.bg}`}>
              <div className={`text-3xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={() => startGame(allWords)}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 active:scale-95 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer">
            <RotateCcw className="w-4 h-4" /> Play Again
          </button>
          <Link href="/" className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all">
            <ArrowLeft className="w-4 h-4" /> Back Home
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading || !current) {
    return (
      <div className="min-h-screen bg-[#080d16] flex items-center justify-center gap-3">
        <div className="w-8 h-8 border-[3px] border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-semibold">Loading vocabulary…</p>
      </div>
    );
  }

  const typeStyle = TYPE_STYLE[current.type] ?? TYPE_STYLE.word;
  const diffStyle = DIFF_STYLE[current.difficulty] ?? DIFF_STYLE.medium;
  const progressPct = Math.round((index / queue.length) * 100);

  // ── Game UI ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080d16] text-slate-100 antialiased flex flex-col">

      {/* ── Top Bar ── */}
      <header className="flex items-center gap-0 h-14 border-b border-slate-900 bg-[#0a0f1d]/90 backdrop-blur-md shrink-0 sticky top-0 z-20">
        {/* Back */}
        <div className="flex items-center px-5 border-r border-slate-900 h-full">
          <Link href="/" className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-200 transition-colors group">
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            LexiVault
          </Link>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2 px-5 border-r border-slate-900 h-full">
          <PenLine className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-bold text-slate-200 tracking-wide">Fill in the Blank</span>
        </div>

        {/* Progress bar + counter */}
        <div className="flex-1 flex items-center gap-4 px-5">
          <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-[11px] font-bold text-slate-500 shrink-0">{index + 1} / {queue.length}</span>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-2 px-5 border-l border-slate-900 h-full">
          {streak >= 2 && (
            <span className="flex items-center gap-1 text-[11px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
              <Flame className="w-3 h-3 fill-amber-400" /> {streak}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <Check className="w-3 h-3 stroke-[3]" /> {score.correct}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full">
            <X className="w-3 h-3 stroke-[3]" /> {score.wrong}
          </span>
        </div>
      </header>

      {/* ── Body: 2 columns ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Hint Panel ── */}
        <aside className="hidden lg:flex flex-col w-[340px] xl:w-[400px] border-r border-slate-900 bg-[#0a0f1d]/60 p-8 gap-6 overflow-y-auto">

          {/* Word meta */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>
                {typeStyle.label}
              </span>
              <span className={`flex items-center gap-1.5 text-[11px] font-bold ${diffStyle.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${diffStyle.dot}`} />
                {current.difficulty}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <Hash className="w-3 h-3" />{current.word.replace(/\s+/g, "").length} chars
              </span>
            </div>
          </div>

          {/* Meaning (the clue) */}
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> English Meaning
            </p>
            <p className="text-lg text-slate-100 leading-relaxed font-medium">
              {current.meaning}
            </p>
          </div>

          {/* Vietnamese hint */}
          <div className="space-y-2">
            <button onClick={() => setShowViHint((v) => !v)}
              className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-600 hover:text-amber-400 transition-colors cursor-pointer">
              <Eye className="w-3.5 h-3.5" />
              {showViHint ? "Hide" : "Show"} Vietnamese
            </button>
            {showViHint && (
              <p className="text-base font-semibold text-amber-400 leading-snug">{current.vietnamese}</p>
            )}
          </div>

          {/* Letter hint */}
          <div className="space-y-2">
            <button onClick={() => setShowLetterHint((v) => !v)}
              className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-600 hover:text-cyan-400 transition-colors cursor-pointer">
              <Lightbulb className="w-3.5 h-3.5" />
              {showLetterHint ? "Hide" : "Show"} letter hint
            </button>
            {showLetterHint && (
              <p className="font-mono text-lg text-cyan-400 tracking-[0.3em] leading-relaxed">{letterBlank(current.word)}</p>
            )}
          </div>

          {/* Example — only after answer revealed */}
          {answerRevealed && current.example && (
            <div className="mt-auto pt-4 border-t border-slate-900">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">Example</p>
              <p className="text-sm text-slate-400 italic leading-relaxed">{current.example}</p>
            </div>
          )}

          {/* Stats mini */}
          <div className="mt-auto pt-4 border-t border-slate-900 grid grid-cols-3 gap-2">
            {[
              { icon: Target, label: "Accuracy", val: `${accuracy}%`, color: "text-cyan-400" },
              { icon: Check,  label: "Correct",  val: score.correct,  color: "text-emerald-400" },
              { icon: X,      label: "Wrong",    val: score.wrong,    color: "text-rose-400" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-950/50 border border-slate-900 rounded-xl p-3 text-center">
                <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wide mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── RIGHT: Input Area ── */}
        <main className="flex-1 flex flex-col p-8 lg:p-12 xl:p-16 overflow-y-auto">

          {/* Mobile: meaning shown here too */}
          <div className="lg:hidden mb-6 p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" /> Meaning
            </p>
            <p className="text-base text-slate-100 leading-relaxed">{current.meaning}</p>
          </div>

          {/* Main question area */}
          <div className="flex-1 flex flex-col justify-center max-w-2xl">

            <div className="mb-8">
              <h2 className="text-3xl xl:text-4xl font-black text-slate-300 mb-2 tracking-tight">
                What is the word?
              </h2>
              <p className="text-slate-600 text-sm">
                Type the English word or phrase that matches the meaning shown on the left.
              </p>
            </div>

            {/* Result state banner */}
            {result === "correct" && (
              <div className="flex items-center gap-3 mb-6 px-5 py-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-white stroke-[3]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
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
              <div className="flex items-start gap-3 mb-6 px-5 py-4 rounded-2xl bg-rose-950/40 border border-rose-500/30">
                <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center shrink-0 mt-0.5">
                  <X className="w-4 h-4 text-white stroke-[3]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-rose-400">{input.trim() ? "Not quite right." : "Skipped."}</p>
                      {answerRevealed ? (
                        <p className="text-sm text-slate-300 mt-1">
                          Answer: <span className="font-black text-slate-100">{current.word}</span>
                        </p>
                      ) : (
                        <button
                          onClick={() => setAnswerRevealed(true)}
                          className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 underline underline-offset-2 transition-colors cursor-pointer">
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

            {/* Input form */}
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
                      ? "bg-emerald-950/30 border-emerald-500/50 text-emerald-300 cursor-not-allowed"
                      : result === "wrong"
                      ? "bg-rose-950/20 border-rose-500/40 text-rose-300 cursor-not-allowed"
                      : "bg-slate-900/60 border-slate-700 text-slate-100 focus:border-cyan-500/60 placeholder-slate-600 hover:border-slate-600"
                    }`}
                />
              </div>

              {/* Action buttons */}
              {result === null && (
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold
                      bg-gradient-to-r from-cyan-500 to-blue-600 text-white
                      hover:from-cyan-400 hover:to-blue-500
                      disabled:opacity-30 disabled:cursor-not-allowed
                      active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-cyan-500/15">
                    <Check className="w-4 h-4 stroke-[2.5]" /> Check Answer
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="flex items-center gap-2 px-5 py-4 rounded-2xl text-sm font-bold
                      text-slate-400 bg-slate-900/70 hover:bg-slate-800 hover:text-slate-200
                      border border-slate-800 active:scale-[0.98] transition-all cursor-pointer">
                    <SkipForward className="w-4 h-4" /> Skip
                  </button>
                </div>
              )}

              {result === "correct" && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold
                    bg-gradient-to-r from-emerald-500 to-teal-600 text-white
                    hover:from-emerald-400 hover:to-teal-500
                    active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-emerald-500/15">
                  Next Word <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {result === "wrong" && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleTryAgain}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold
                      text-amber-400 bg-amber-500/10 hover:bg-amber-500/15
                      border border-amber-500/25 active:scale-[0.98] transition-all cursor-pointer">
                    <RefreshCcw className="w-4 h-4" /> Try Again
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold
                      text-slate-200 bg-slate-800 hover:bg-slate-700
                      border border-slate-700 active:scale-[0.98] transition-all cursor-pointer">
                    Next Word <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </form>

            {/* Restart */}
            <div className="mt-10">
              <button
                onClick={() => startGame(allWords)}
                className="flex items-center gap-1.5 text-[11px] text-slate-700 hover:text-slate-400 transition-colors cursor-pointer">
                <RotateCcw className="w-3 h-3" /> Restart with new shuffle
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
