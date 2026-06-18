"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useVocab, VocabItem } from "@/app/context/VocabContext";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Award, Info, Award as Trophy } from "lucide-react";

export default function StatisticsPage() {
  const { counts, accuracyHistory } = useVocab();

  const [difficultyStats, setDifficultyStats] = useState({
    easy: 0,
    medium: 0,
    hard: 0,
    total: 0
  });
  const [loading, setLoading] = useState(true);

  // Fetch all items once to compute difficulty counters
  useEffect(() => {
    let active = true;

    const fetchStats = async () => {
      setLoading(true);
      let allItems: VocabItem[] = [];

      if (!db) {
        // Offline mode
        const saved = localStorage.getItem("lexivault_words");
        if (saved) {
          try {
            allItems = JSON.parse(saved);
          } catch (e) {}
        }
      } else {
        // Online mode: fetch from all subcollections
        try {
          const types = ["word", "phrase", "idiom", "native_daily_phrase"] as const;
          await Promise.all(
            types.map(async (t) => {
              const snap = await getDocs(collection(db!, "vocabulary", t, "items"));
              snap.forEach((d) => {
                allItems.push({ id: d.id, ...d.data() } as VocabItem);
              });
            })
          );
        } catch (e) {
          console.error("Failed to load difficulty stats:", e);
        }
      }

      if (!active) return;

      const diffs = { easy: 0, medium: 0, hard: 0, total: allItems.length };
      allItems.forEach((w) => {
        if (w.difficulty === "easy") diffs.easy++;
        else if (w.difficulty === "medium") diffs.medium++;
        else if (w.difficulty === "hard") diffs.hard++;
      });

      setDifficultyStats(diffs);
      setLoading(false);
    };

    fetchStats();

    return () => {
      active = false;
    };
  }, []);

  // Compute accuracy ratio safely
  const accuracyPercent = useMemo(() => {
    if (accuracyHistory.total === 0) return 0;
    return Math.round((accuracyHistory.correct / accuracyHistory.total) * 100);
  }, [accuracyHistory]);

  const totalWords = counts.all || difficultyStats.total;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Performance Analytics</h2>
        <p className="text-xs text-slate-400 font-medium">
          Detailed retention curve indicators and vocabulary distributions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* 1. Recall strength circular indicator */}
        <div className="glass-panel rounded-xl p-5 border border-slate-900 bg-[#0a0f1d]/50 flex flex-col justify-between items-center text-center">
          <span className="text-[12px] font-bold text-slate-505 uppercase tracking-wider text-slate-400">Active Recall Strength</span>

          <div className="relative w-28 h-28 my-4 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="46"
                className="stroke-slate-900"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="56"
                cy="56"
                r="46"
                className="stroke-cyan-500"
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 46}
                strokeDashoffset={2 * Math.PI * 46 * (1 - (accuracyHistory.total > 0 ? accuracyHistory.correct / accuracyHistory.total : 0.8))}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute">
              <span className="text-2xl font-black text-slate-100">
                {accuracyHistory.total > 0 ? accuracyPercent : 85}%
              </span>
              <span className="block text-[9px] text-slate-500 uppercase font-bold tracking-wider">Accuracy</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Accuracy measured over the last {accuracyHistory.total || 0} recall tests.
          </p>
        </div>

        {/* 2. Category Mix distribution */}
        <div className="glass-panel rounded-xl p-5 border border-slate-900 bg-[#0a0f1d]/50 flex flex-col justify-between">
          <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Category Mix</span>

          <div className="space-y-3">
            {/* Words */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-slate-300">Words</span>
                <span className="text-slate-450">{counts.word} cards</span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${totalWords ? (counts.word / totalWords * 100) : 0}%` }} />
              </div>
            </div>
            {/* Phrases */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-slate-300">Phrases</span>
                <span className="text-slate-455">{counts.phrase} cards</span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500" style={{ width: `${totalWords ? (counts.phrase / totalWords * 100) : 0}%` }} />
              </div>
            </div>
            {/* Idioms */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-slate-300">Idioms</span>
                <span className="text-slate-455">{counts.idiom} cards</span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500" style={{ width: `${totalWords ? (counts.idiom / totalWords * 100) : 0}%` }} />
              </div>
            </div>
            {/* Native Speaker */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-slate-300">Native Speaker</span>
                <span className="text-slate-455">{counts.native_daily_phrase} cards</span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500" style={{ width: `${totalWords ? (counts.native_daily_phrase / totalWords * 100) : 0}%` }} />
              </div>
            </div>
          </div>

          <div className="pt-2 text-[10px] text-slate-500 font-semibold leading-relaxed">
            Balanced study targets improve reading comprehension metrics.
          </div>
        </div>

        {/* 3. Difficulty levels distribution */}
        <div className="glass-panel rounded-xl p-5 border border-slate-900 bg-[#0a0f1d]/50 flex flex-col justify-between">
          <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Difficulty Levels</span>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-cyan-500/25 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-300">Easy</span>
                  <span className="text-slate-455">{difficultyStats.easy} cards</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${difficultyStats.total ? (difficultyStats.easy / difficultyStats.total * 100) : 0}%` }} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-300">Medium</span>
                  <span className="text-slate-455">{difficultyStats.medium} cards</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${difficultyStats.total ? (difficultyStats.medium / difficultyStats.total * 100) : 0}%` }} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-300">Hard</span>
                  <span className="text-slate-455">{difficultyStats.hard} cards</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500" style={{ width: `${difficultyStats.total ? (difficultyStats.hard / difficultyStats.total * 100) : 0}%` }} />
                </div>
              </div>
            </div>
          )}
          <div className="pt-2 text-[10px] text-slate-500 font-semibold">
            Spacing scheduler prompts hard cards more frequently.
          </div>
        </div>
      </div>

      {/* 4. Weekly Learning Chart */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-900 bg-[#0a0f1d]/50 space-y-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Cards Completed This Week</span>

        <div className="w-full h-44 relative pt-3">
          <svg className="w-full h-full" viewBox="0 0 700 200" preserveAspectRatio="none">
            <line x1="0" y1="50" x2="700" y2="50" className="stroke-slate-900" strokeDasharray="4,4" />
            <line x1="0" y1="100" x2="700" y2="100" className="stroke-slate-900" strokeDasharray="4,4" />
            <line x1="0" y1="150" x2="700" y2="150" className="stroke-slate-900" strokeDasharray="4,4" />

            <defs>
              <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 50,170 Q 150,140 250,150 T 450,80 T 650,40 L 650,180 L 50,180 Z"
              fill="url(#chartGlow)"
            />

            <path
              d="M 50,170 Q 150,140 250,150 T 450,80 T 650,40"
              fill="none"
              className="stroke-cyan-400"
              strokeWidth="2.5"
            />

            <circle cx="50" cy="170" r="4.5" className="fill-[#080d16] stroke-cyan-400" strokeWidth="2" />
            <circle cx="150" cy="140" r="4.5" className="fill-[#080d16] stroke-cyan-400" strokeWidth="2" />
            <circle cx="250" cy="150" r="4.5" className="fill-[#080d16] stroke-cyan-400" strokeWidth="2" />
            <circle cx="350" cy="120" r="4.5" className="fill-[#080d16] stroke-cyan-400" strokeWidth="2" />
            <circle cx="450" cy="80" r="4.5" className="fill-[#080d16] stroke-cyan-400" strokeWidth="2" />
            <circle cx="550" cy="60" r="4.5" className="fill-[#080d16] stroke-cyan-400" strokeWidth="2" />
            <circle cx="650" cy="40" r="4.5" className="fill-[#080d16] stroke-cyan-400" strokeWidth="2" />
          </svg>

          <div className="flex justify-between text-[11px] text-slate-500 font-bold uppercase mt-3 px-3">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </div>
      </div>
    </div>
  );
}
