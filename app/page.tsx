"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useVocab, VocabItem } from "@/app/context/VocabContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit as firestoreLimit, query, orderBy } from "firebase/firestore";
import { getTypeBadge, getTypeLabel, playPronunciation } from "@/lib/helpers";
import {
  BrainCircuit,
  Volume2,
  Check,
  X,
  Edit3,
  Trash2,
  Plus,
  Flame,
  Award,
  Clock,
  Sparkles,
  ChevronRight
} from "lucide-react";


export default function Home() {
  const router = useRouter();
  const {
    userName,
    streak,
    dailyProgress,
    dailyGoal,
    counts,
    reviewWords,
    accuracyHistory,
    updatePracticeProgress,
    triggerDelete,
    setIsEditModalOpen,
    setSelectedWord,
    refreshCounts
  } = useVocab();

  // Dashboard state
  const [recentWords, setRecentWords] = useState<VocabItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Quick Flashcard State
  const [quickIndex, setQuickIndex] = useState(0);
  const [showQuickMeaning, setShowQuickMeaning] = useState(false);

  // Fetch 5 most recent items
  useEffect(() => {
    let active = true;

    const fetchRecent = async () => {
      setLoadingRecent(true);
      let all: VocabItem[] = [];

      if (!db) {
        // Offline mode
        const saved = localStorage.getItem("lexivault_words");
        if (saved) {
          try {
            all = JSON.parse(saved);
          } catch (e) {}
        }
      } else {
        // Online mode: fetch recent items from all collections
        try {
          const types = ["word", "phrase", "idiom", "native_daily_phrase"] as const;
          await Promise.all(
            types.map(async (t) => {
              const q = query(
                collection(db!, "vocabulary", t, "items"),
                orderBy("createdAt", "desc"),
                firestoreLimit(5)
              );
              const snap = await getDocs(q);
              snap.forEach((d) => {
                all.push({ id: d.id, ...d.data(), type: t } as VocabItem);
              });
            })
          );
        } catch (e) {
          console.error("Failed to fetch recent dashboard words:", e);
        }
      }

      if (!active) return;

      // Sort by createdAt desc and slice 5
      all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRecentWords(all.slice(0, 5));
      setLoadingRecent(false);
    };

    fetchRecent();

    return () => {
      active = false;
    };
  }, [counts.all]); // Refresh when counts change (implies add/delete)

  const accuracyPercent = useMemo(() => {
    if (accuracyHistory.total === 0) return 0;
    return Math.round((accuracyHistory.correct / accuracyHistory.total) * 100);
  }, [accuracyHistory]);

  const handleQuickPracticeAction = async (known: boolean) => {
    if (reviewWords.length === 0) return;
    const currentItem = reviewWords[quickIndex % reviewWords.length];

    await updatePracticeProgress(currentItem, known);
    setShowQuickMeaning(false);
  };

  return (
    <div className="space-y-6">
      
      {/* ── GREETING HERO BANNER ────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-cyan-900/30 via-slate-950 to-blue-950/20 border border-slate-900 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[11px] font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Spaced Repetition Active
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
            Welcome back, <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">{userName}</span>!
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-lg leading-relaxed">
            Your personal vocabulary accelerator is ready. Review today&apos;s spaced repetition cards to lock new phrases into long-term memory.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0 relative z-10">
          <div className="flex flex-col items-center bg-[#070b13] border border-slate-900 rounded-2xl p-4 min-w-[100px]">
            <Flame className="w-6 h-6 text-amber-500 fill-amber-500 animate-pulse-slow" />
            <span className="text-xl font-extrabold text-slate-200 mt-1">{streak}d</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Streak</span>
          </div>
          <div className="flex flex-col items-center bg-[#070b13] border border-slate-900 rounded-2xl p-4 min-w-[100px]">
            <Award className="w-6 h-6 text-cyan-400" />
            <span className="text-xl font-extrabold text-slate-200 mt-1">{accuracyHistory.total > 0 ? accuracyPercent : 85}%</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Accuracy</span>
          </div>
        </div>

        {/* Ambient Glows */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      </div>

      {/* ── TWO-COLUMN VIEW ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Recently Added & Due Status */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-400" /> Recently Added Cards
            </h3>
            <button
              onClick={() => router.push("/library")}
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              View all Library <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingRecent ? (
            <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex items-center justify-center min-h-[300px]">
              <div className="w-6 h-6 border-2 border-cyan-500/25 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : recentWords.length === 0 ? (
            <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[300px]">
              <p className="text-xs text-slate-400">No cards in your library yet. Add your first card to begin!</p>
              <button
                onClick={() => router.push("/library")}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950"
              >
                Go to Library
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentWords.map((item) => (
                <div
                  key={item.id}
                  className="glass-panel rounded-2xl p-5 border border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-slate-800"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md ${getTypeBadge(item.type)}`}>
                        {getTypeLabel(item.type)}
                      </span>
                      {item.type !== "native_daily_phrase" && (item.wordTypes || []).map((wt) => (
                        <span key={wt} className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {wt}
                        </span>
                      ))}
                    </div>

                    <h4 className="text-lg font-black text-slate-100 truncate">{item.word}</h4>
                    <p className="text-xs text-slate-350 line-clamp-1 leading-normal">{item.meaning}</p>
                    
                    <p className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/10">VN</span>
                      {item.vietnamese}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 sm:self-center shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playPronunciation(item.word, "US");
                      }}
                      className="p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-800 text-cyan-400 transition-colors"
                      title="Listen US"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedWord(item);
                        setIsEditModalOpen(true);
                      }}
                      className="p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        triggerDelete(item, () => {
                          setRecentWords(prev => prev.filter(w => w.id !== item.id));
                          refreshCounts();
                        });
                      }}
                      className="p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-400 hover:text-rose-450 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Quick flashcard recall panel */}
        <div className="space-y-4">
          <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
            <BrainCircuit className="w-4.5 h-4.5 text-purple-400" /> Quick Recall
          </h3>

          {reviewWords.length > 0 ? (() => {
            const activeReviewItem = reviewWords[quickIndex % reviewWords.length];
            return (
              <div className="glass-panel rounded-2xl p-5 border border-slate-900 bg-[#0a101d]/60 flex flex-col justify-between min-h-[360px] relative">
                <div className="flex-1 flex flex-col justify-center items-center text-center py-4">
                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-md mb-3 ${getTypeBadge(activeReviewItem.type)}`}>
                    {getTypeLabel(activeReviewItem.type)}
                  </span>

                  <h4 className="text-xl lg:text-2xl font-black text-slate-100 tracking-tight max-w-[220px] break-words">
                    {activeReviewItem.word}
                  </h4>

                  <div className="mt-3.5 w-full min-h-[90px] flex flex-col items-center justify-center">
                    {showQuickMeaning ? (
                      <div className="space-y-1.5 animate-scale-up">
                        <p className="text-xs font-semibold text-slate-200 px-2 line-clamp-2">
                          {activeReviewItem.meaning}
                        </p>
                        <p className="text-xs font-bold text-emerald-400 px-2 line-clamp-1">
                          {activeReviewItem.vietnamese}
                        </p>
                        {activeReviewItem.example && (
                          <p className="text-[11px] text-slate-450 italic px-3 line-clamp-1">
                            &ldquo;{activeReviewItem.example}&rdquo;
                          </p>
                        )}
                        {activeReviewItem.commonPhrases && (
                          <p className="text-[11px] text-cyan-400 font-bold px-3 line-clamp-1">
                            Phrases: {activeReviewItem.commonPhrases.replace(/\n/g, ", ")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowQuickMeaning(true)}
                        className="px-4 py-2 text-[12px] font-extrabold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl transition-all cursor-pointer"
                      >
                        Show Meaning
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-900">
                  <button
                    onClick={() => handleQuickPracticeAction(false)}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-rose-455 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    Forgot
                  </button>
                  <button
                    onClick={() => handleQuickPracticeAction(true)}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-emerald-455 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 transition-all cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    Knew It
                  </button>
                </div>
              </div>
            );
          })() : (
            <div className="glass-panel rounded-2xl p-6 border border-slate-900 text-center flex flex-col items-center justify-center bg-[#0a0f1d]/30 min-h-[360px] space-y-4">
              <div className="w-11 h-11 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-450 border border-emerald-500/25">
                <Check className="w-5 h-5 stroke-[3]" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">Review queue empty</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-[180px] mx-auto leading-relaxed">
                  All cards successfully practiced! You are set for today.
                </p>
              </div>
              <button
                onClick={() => router.push("/practice")}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all cursor-pointer"
              >
                Study Custom Categories
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── STATS RECAP BAR ────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-base font-extrabold text-slate-105 flex items-center gap-2">
          <Award className="w-4.5 h-4.5 text-cyan-450" /> Performance Recap
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel rounded-2xl p-4 border border-slate-900 bg-[#0a0f1d]/30">
            <span className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Total Library Items</span>
            <div className="text-xl font-black text-slate-200 mt-1">{counts.all}</div>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-slate-900 bg-[#0a0f1d]/30">
            <span className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Recall Accuracy</span>
            <div className="text-xl font-black text-slate-200 mt-1">
              {accuracyHistory.total > 0 ? accuracyPercent : 0}%
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-slate-900 bg-[#0a0f1d]/30">
            <span className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Daily Goal</span>
            <div className="text-xl font-black text-slate-200 mt-1">{dailyProgress}/{dailyGoal} words</div>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-slate-900 bg-[#0a0f1d]/30">
            <span className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Practice Due</span>
            <div className="text-xl font-black text-cyan-400 mt-1">{reviewWords.length} items</div>
          </div>
        </div>
      </div>

    </div>
  );
}
