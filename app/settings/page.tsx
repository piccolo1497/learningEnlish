"use client";

import React from "react";
import { useVocab } from "@/app/context/VocabContext";

export default function SettingsPage() {
  const {
    userName,
    setUserName,
    dailyGoal,
    setDailyGoal,
    wordFontSize,
    setWordFontSize
  } = useVocab();

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Preferences Settings</h2>
        <p className="text-xs text-slate-400">
          Configure targets and user profile configurations.
        </p>
      </div>

      <div className="glass-panel rounded-2xl border border-slate-900 p-5 space-y-5 bg-[#0a0f1d]/50">
        
        {/* Profile Edit */}
        <div className="space-y-1">
          <label className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Name</label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-900 focus:border-cyan-500/40 rounded-xl text-xs text-slate-200 focus:outline-none"
          />
        </div>

        {/* Daily Goal Target */}
        <div className="space-y-2">
          <label className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Daily Target Goal</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="5"
              max="30"
              step="5"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(Number(e.target.value))}
              className="flex-1 accent-cyan-500 cursor-pointer h-1.5 bg-slate-900 rounded-lg appearance-none"
            />
            <span className="w-20 text-center text-xs font-bold bg-slate-950 border border-slate-900 py-1.5 px-2 rounded-lg text-slate-200">
              {dailyGoal} words
            </span>
          </div>
        </div>

        {/* Word Font Size Preference */}
        <div className="space-y-2 pt-3 border-t border-slate-900">
          <label className="text-[12px] font-bold uppercase tracking-wider text-slate-400 block">Word Font Size</label>
          <div className="grid grid-cols-4 gap-2">
            {(["small", "medium", "large", "xlarge"] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setWordFontSize(sz)}
                className={`py-2 rounded-xl text-xs font-bold capitalize transition-all border cursor-pointer ${
                  wordFontSize === sz
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-md shadow-cyan-500/5"
                    : "bg-slate-950/60 border-slate-900 text-slate-400 hover:bg-slate-900"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        {/* Algorithmic Multipliers */}
        <div className="space-y-2 pt-3 border-t border-slate-900">
          <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400 block">SRS Spacing Algorithm</span>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 bg-slate-950/60 border border-slate-900 rounded-lg text-center">
              <span className="text-[11px] text-slate-500 font-bold block">Easy</span>
              <span className="text-xs font-extrabold text-slate-200 mt-0.5 block">x 4.0d</span>
            </div>
            <div className="p-2.5 bg-slate-950/60 border border-slate-900 rounded-lg text-center">
              <span className="text-[11px] text-slate-500 font-bold block">Medium</span>
              <span className="text-xs font-extrabold text-slate-200 mt-0.5 block">x 2.5d</span>
            </div>
            <div className="p-2.5 bg-slate-950/60 border border-slate-900 rounded-lg text-center">
              <span className="text-[11px] text-slate-500 font-bold block">Hard</span>
              <span className="text-xs font-extrabold text-slate-200 mt-0.5 block">x 1.2d</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
