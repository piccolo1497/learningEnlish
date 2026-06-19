"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useVocab } from "@/app/context/VocabContext";
import { getTypeLabel, playPronunciation } from "@/lib/helpers";
import {
  LayoutDashboard,
  Library,
  Flame,
  Award,
  Settings,
  Search,
  Plus,
  Star,
  Edit3,
  Trash2,
  Check,
  X,
  Menu,
  Clock,
  BrainCircuit,
  Info,
  Volume2,
  Sparkle,
  PenLine
} from "lucide-react";

const WORD_TYPES_LIST = [
  { value: "", label: "None" },
  { value: "noun", label: "Noun" },
  { value: "verb", label: "Verb" },
  { value: "adj", label: "Adj" },
  { value: "adv", label: "Adv" },
  { value: "pronoun", label: "Pron" },
  { value: "prep", label: "Prep" },
  { value: "conj", label: "Conj" }
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    loading,
    dbError,
    userName,
    streak,
    toast,
    counts,
    reviewWords,
    isAddModalOpen,
    setIsAddModalOpen,
    isEditModalOpen,
    setIsEditModalOpen,
    selectedWord,
    setSelectedWord,
    isDeleteConfirmOpen,
    setIsDeleteConfirmOpen,
    deleteTargetItem,
    triggerDelete,
    onDeleteSuccess,
    createWord,
    updateWord,
    deleteWord,
    checkDuplicate
  } = useVocab();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");

  // Sync route query search if on library page (handles mount, pathname change, and popstate navigation)
  useEffect(() => {
    const syncWithUrl = () => {
      if (pathname === "/library") {
        const currentQuery = new URLSearchParams(window.location.search);
        const search = currentQuery.get("search") || "";
        setLocalSearch(search);
      } else {
        setLocalSearch("");
      }
    };

    syncWithUrl();

    window.addEventListener("popstate", syncWithUrl);
    return () => window.removeEventListener("popstate", syncWithUrl);
  }, [pathname]);

  // Automatically update the URL query parameter with a 300ms debounce as the user types
  useEffect(() => {
    const currentQuery = new URLSearchParams(window.location.search);
    const urlSearch = currentQuery.get("search") || "";

    if (localSearch === urlSearch) return;

    const delayDebounceFn = setTimeout(() => {
      if (localSearch.trim()) {
        router.push(`/library?search=${encodeURIComponent(localSearch)}`);
      } else {
        if (pathname === "/library") {
          router.push("/library");
        }
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [localSearch, pathname, router]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/library?search=${encodeURIComponent(localSearch)}`);
  };

  // Form states for modals
  const [formWord, setFormWord] = useState("");
  const [formType, setFormType] = useState<"word" | "phrase" | "idiom" | "native_daily_phrase">("word");
  const [formWordTypes, setFormWordTypes] = useState<string[]>([]);
  const [formPronunciationUS, setFormPronunciationUS] = useState("");
  const [formPronunciationUK, setFormPronunciationUK] = useState("");
  const [spellingWarning, setSpellingWarning] = useState(false);
  const [formMeaning, setFormMeaning] = useState("");
  const [formVietnamese, setFormVietnamese] = useState("");
  const [formExample, setFormExample] = useState("");
  const [formCommonPhrases, setFormCommonPhrases] = useState("");
  const [formDifficulty, setFormDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // Pre-submit confirmation modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ label: string; value: string }[]>([]);

  // Duplicate-word warning modal
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateFoundItem, setDuplicateFoundItem] = useState<import("@/app/context/VocabContext").VocabItem | null>(null);
  const [pendingCreateAfterDupe, setPendingCreateAfterDupe] = useState(false);

  // Auto-detect Word Type and Pronunciation
  useEffect(() => {
    if (formType !== "word") return;
    const trimmed = formWord.trim();
    if (!trimmed || trimmed.includes(" ") || trimmed.length < 2) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${trimmed}`);
        if (!response.ok) {
          setSpellingWarning(true);
          setFormWordTypes([]);
          setFormPronunciationUS("");
          setFormPronunciationUK("");
          return;
        }
        setSpellingWarning(false);
        const data = await response.json();
        if (Array.isArray(data) && data[0]) {
          if (data[0].meanings) {
            const detectedTypes = new Set<string>();
            data[0].meanings.forEach((meaning: any) => {
              const pos = meaning.partOfSpeech?.toLowerCase();
              if (pos === "noun") detectedTypes.add("noun");
              if (pos === "verb") detectedTypes.add("verb");
              if (pos === "adjective") detectedTypes.add("adj");
              if (pos === "adverb") detectedTypes.add("adv");
              if (pos === "pronoun") detectedTypes.add("pronoun");
              if (pos === "preposition") detectedTypes.add("prep");
              if (pos === "conjunction") detectedTypes.add("conj");
            });
            if (detectedTypes.size > 0) setFormWordTypes(Array.from(detectedTypes));
          }

          let detectedUS = "";
          let detectedUK = "";
          if (data[0].phonetics && data[0].phonetics.length > 0) {
            const usPhonetic = data[0].phonetics.find((p: any) => p.audio && (p.audio.includes("-us") || p.audio.includes("_us")));
            if (usPhonetic && usPhonetic.text) detectedUS = usPhonetic.text;
            
            const ukPhonetic = data[0].phonetics.find((p: any) => p.audio && (p.audio.includes("-uk") || p.audio.includes("_uk")));
            if (ukPhonetic && ukPhonetic.text) detectedUK = ukPhonetic.text;

            if (!detectedUS) {
              const firstWithText = data[0].phonetics.find((p: any) => p.text);
              if (firstWithText) detectedUS = firstWithText.text;
            }
            if (!detectedUK) {
              const remainingWithText = data[0].phonetics.filter((p: any) => p.text && p.text !== detectedUS);
              if (remainingWithText.length > 0) detectedUK = remainingWithText[0].text;
            }
          }

          if (!detectedUS && data[0].phonetic) detectedUS = data[0].phonetic;
          if (!detectedUK && data[0].phonetic) detectedUK = data[0].phonetic;
          if (!detectedUS && detectedUK) detectedUS = detectedUK;
          if (!detectedUK && detectedUS) detectedUK = detectedUS;

          setFormPronunciationUS(detectedUS);
          setFormPronunciationUK(detectedUK);
        }
      } catch (e) {
        console.warn("Auto-detect failed:", e);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [formWord, formType]);

  // Edit Modal form populator
  useEffect(() => {
    if (selectedWord) {
      setFormWord(selectedWord.word);
      setFormType(selectedWord.type);
      setFormWordTypes(selectedWord.wordTypes || []);
      setFormPronunciationUS(selectedWord.pronunciationUS || "");
      setFormPronunciationUK(selectedWord.pronunciationUK || "");
      setFormMeaning(selectedWord.meaning);
      setFormVietnamese(selectedWord.vietnamese);
      setFormExample(selectedWord.example);
      setFormDifficulty(selectedWord.difficulty);
      setFormCommonPhrases(selectedWord.commonPhrases || "");
      setSpellingWarning(false);
    }
  }, [selectedWord]);

  // Reset helper for adding cards
  const resetAddForm = () => {
    setFormWord("");
    setFormWordTypes([]);
    setFormPronunciationUS("");
    setFormPronunciationUK("");
    setSpellingWarning(false);
    setFormMeaning("");
    setFormVietnamese("");
    setFormExample("");
    setFormCommonPhrases("");
  };

  // Open add modal helper
  const openAddModal = () => {
    resetAddForm();
    setFormType("word");
    setFormDifficulty("medium");
    setIsAddModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWord.trim() || !formMeaning.trim() || !formVietnamese.trim()) {
      alert("Word, English meaning, and Vietnamese translation are required!");
      return;
    }

    // Check for duplicate before anything else
    if (!pendingCreateAfterDupe) {
      const dupe = await checkDuplicate(formWord);
      if (dupe) {
        setDuplicateFoundItem(dupe);
        setIsDuplicateModalOpen(true);
        return;
      }
    }
    setPendingCreateAfterDupe(false);

    if (spellingWarning) {
      const summary = [
        { label: "Word / Phrase", value: formWord },
        { label: "Type", value: getTypeLabel(formType) },
        { label: "Word Types", value: formType === "word" && formWordTypes.length > 0 ? formWordTypes.join(", ").toUpperCase() : "N/A" },
        { label: "US Pronunciation", value: formType === "word" ? (formPronunciationUS || "None") : "N/A" },
        { label: "UK Pronunciation", value: formType === "word" ? (formPronunciationUK || "None") : "N/A" },
        { label: "English Meaning", value: formMeaning },
        { label: "Vietnamese Translation", value: formVietnamese },
        { label: "Example Sentence", value: formExample || "None" },
        { label: "Common Phrases", value: formCommonPhrases || "None" },
        { label: "Difficulty", value: formDifficulty.toUpperCase() }
      ];
      setConfirmData(summary);
      setIsConfirmModalOpen(true);
    } else {
      await createWord(formWord, formType, formMeaning, formVietnamese, formExample, formDifficulty, formWordTypes, formPronunciationUS, formPronunciationUK, formCommonPhrases);
      resetAddForm();
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWord) return;
    if (!formWord.trim() || !formMeaning.trim() || !formVietnamese.trim()) return;

    await updateWord(selectedWord, formWord, formType, formMeaning, formVietnamese, formExample, formDifficulty, formWordTypes, formPronunciationUS, formPronunciationUK, formCommonPhrases);
    setIsEditModalOpen(false);
    setSelectedWord(null);
  };

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/" },
    { id: "library", label: "Library Words", icon: Library, href: "/library" },
    { id: "practice", label: "Practice", icon: BrainCircuit, href: "/practice" },
    { id: "fillblank", label: "Fill in the Blank", icon: PenLine, href: "/fillblank" },
    { id: "review", label: "Review Queue", icon: Clock, href: "/review" },
    { id: "statistics", label: "Statistics", icon: Award, href: "/statistics" },
    { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#080d16] text-slate-100 antialiased selection:bg-cyan-500/30">
      
      {/* ── SUCCESS TOAST ─────────────────────────────────── */}
      {toast.visible && (
        <div className="fixed top-5 right-5 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-2xl
          bg-emerald-950/90 border border-emerald-500/30 shadow-xl shadow-black/40
          backdrop-blur-md animate-fade-in">
          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <Check className="w-3 h-3 text-white stroke-[3]" />
          </div>
          <span className="text-sm font-semibold text-emerald-300">{toast.message}</span>
        </div>
      )}

      {/* 1. LEFT SIDEBAR */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-slate-900 bg-[#0a0f1d]/90 backdrop-blur-xl shrink-0 sticky top-0 h-screen">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-900">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-md">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-cyan-400 bg-clip-text text-transparent">
              LexiVault
            </span>
            <span className="text-[11px] font-semibold tracking-wider text-cyan-500 uppercase -mt-1">
              Word Space
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 text-cyan-350 border-l-[3px] border-cyan-400 shadow-md shadow-cyan-500/5 font-extrabold pl-4"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 hover:pl-4.5 font-medium"
                }`}
              >
                <Icon className={`w-4 h-4 transition-transform duration-200 ${isActive ? "text-cyan-400 scale-105" : "text-slate-400 group-hover:scale-105"}`} />
                <span>{item.label}</span>
                
                {/* Total words counts next to Library */}
                {item.id === "library" && counts.all > 0 && (
                  <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-md border ${isActive ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" : "bg-slate-900 text-slate-400 border-slate-800"}`}>
                    {counts.all}
                  </span>
                )}
 
                {/* Review count badge */}
                {item.id === "review" && reviewWords.length > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-cyan-500 text-[#080d16] rounded-full animate-pulse-slow">
                    {reviewWords.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info Quick Badge */}
        <div className="p-3 border-t border-slate-900 bg-[#060a12]/30">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-955/40 border border-slate-900">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-white text-xs">
                {userName.charAt(0)}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-[#080d16]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold truncate text-slate-300">{userName}</span>
              <span className="text-[11px] text-cyan-400 font-medium truncate flex items-center gap-0.5">
                <Flame className="w-2.5 h-2.5 text-amber-500 fill-amber-500" /> {streak}d Streak
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      <aside className={`fixed top-0 bottom-0 left-0 z-50 w-56 border-r border-slate-900 bg-[#0a0f1d] flex flex-col transform transition-transform duration-300 lg:hidden ${
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600">
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base text-slate-100">LexiVault</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1 rounded-lg bg-slate-905 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 text-cyan-350 border-l-[3px] border-cyan-400 shadow-md shadow-cyan-500/5 font-extrabold pl-4"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 hover:pl-4.5 font-medium"
                }`}
              >
                <Icon className={`w-4 h-4 transition-transform duration-200 ${isActive ? "text-cyan-400 scale-105" : "text-slate-400"}`} />
                <span>{item.label}</span>
                {item.id === "library" && counts.all > 0 && (
                  <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-md border ${isActive ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" : "bg-slate-900 text-slate-400 border-slate-800"}`}>
                    {counts.all}
                  </span>
                )}
                {item.id === "review" && reviewWords.length > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-cyan-500 text-[#080d16] rounded-full animate-pulse-slow">
                    {reviewWords.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* 2. TOP BAR */}
        <header className="flex items-center justify-between px-5 lg:px-6 h-16 border-b border-slate-900 bg-[#080d16]/85 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-3.5 flex-1">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-900 text-slate-305 hover:text-white lg:hidden"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Search Bar - redirects to /library */}
            <form onSubmit={handleSearchSubmit} className="relative w-full max-w-sm hidden md:block">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search globally across library..."
                className="w-full pl-9 pr-8 py-1.5 bg-slate-950/70 hover:bg-slate-950/90 focus:bg-slate-950 border border-slate-900 focus:border-cyan-500/30 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-all"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch("");
                    router.push("/library");
                  }}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          </div>

          <div className="flex items-center gap-3">
            {/* Add New Word Button */}
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2 text-xs font-extrabold text-[#080d16] bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 rounded-xl shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#080d16] stroke-[3]" />
              <span>Add Word</span>
            </button>

            {/* User Profile Avatar */}
            <div className="w-8 h-8 rounded-full border border-slate-800 p-0.5">
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-xs font-extrabold text-white">
                {userName.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* SCROLLABLE MAIN */}
        <main className="flex-1 overflow-y-auto px-5 py-6 lg:px-6 space-y-6 max-w-7xl w-full mx-auto">
          {loading && (
            <div className="fixed inset-0 z-50 bg-[#0b111e]/80 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                <p className="text-xs font-semibold text-slate-400">Syncing with LexiVault Database...</p>
              </div>
            </div>
          )}

          {dbError && (
            <div className="flex items-center gap-2.5 p-4 rounded-xl bg-[#1c1212] border border-rose-500/20 text-rose-455 text-xs font-semibold">
              <Info className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Database connection error: {dbError}. Running in Offline Fallback Mode. Please check your Firestore rules and network connectivity.
              </span>
            </div>
          )}

          {children}
        </main>
      </div>

      {/* ========================================================
          ADD NEW WORD MODAL
          ======================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto glass-panel rounded-2xl border border-slate-800 p-5 sm:p-8 space-y-6 shadow-2xl bg-[#0a0f1d] animate-scale-up scrollbar-thin">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <h3 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400 stroke-[2.5]" /> Add Vocabulary Card
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["word", "phrase", "idiom", "native_daily_phrase"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormType(t)}
                        className={`py-2.5 rounded-xl text-xs font-bold uppercase border transition-all cursor-pointer active:scale-98 ${
                          formType === t
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/40"
                            : "bg-slate-900/60 border-slate-900/60 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {getTypeLabel(t)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary Word / Phrase</label>
                  <input
                    type="text"
                    required
                    value={formWord}
                    onChange={(e) => setFormWord(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all placeholder-slate-600"
                  />
                </div>

                {spellingWarning && (
                  <div className="md:col-span-2 px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[13px] font-medium rounded-xl flex items-center gap-2 animate-fade-in">
                    <Info className="w-4.5 h-4.5 shrink-0 text-amber-400" />
                    <span>Warning: &quot;{formWord}&quot; might have a spelling mistake (not found in dictionary). You can still save it.</span>
                  </div>
                )}

                {formType === "word" ? (
                  <>
                    <div className="space-y-1.5 md:col-span-1">
                      <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">US Pronunciation</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled
                          value={formPronunciationUS}
                          className="flex-1 px-4 py-3 bg-slate-900/40 border border-slate-850/60 rounded-xl text-sm text-slate-350 cursor-not-allowed"
                        />
                        <button
                          type="button"
                          disabled={!formWord.trim()}
                          onClick={() => playPronunciation(formWord, "US")}
                          className="px-3.5 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                          title="Listen US"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 md:col-span-1">
                      <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">UK Pronunciation</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled
                          value={formPronunciationUK}
                          className="flex-1 px-4 py-3 bg-slate-900/40 border border-slate-850/60 rounded-xl text-sm text-slate-355 cursor-not-allowed"
                        />
                        <button
                          type="button"
                          disabled={!formWord.trim()}
                          onClick={() => playPronunciation(formWord, "UK")}
                          className="px-3.5 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                          title="Listen UK"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}

                {formType === "word" && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Word Type</label>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {WORD_TYPES_LIST.map((wt) => {
                        const isSelected = formWordTypes.includes(wt.value);
                        return (
                          <button
                            key={wt.value}
                            type="button"
                            onClick={() => {
                              if (wt.value === "") {
                                setFormWordTypes([]);
                              } else {
                                setFormWordTypes(prev =>
                                  prev.includes(wt.value)
                                    ? prev.filter(x => x !== wt.value)
                                    : [...prev, wt.value]
                                );
                              }
                            }}
                            className={`py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              (wt.value === "" && formWordTypes.length === 0) || isSelected
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                                : "bg-slate-900/60 border-slate-900/60 text-slate-455 hover:text-slate-200"
                            }`}
                          >
                            {wt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* English & Vietnamese Meanings in same row */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">English Meaning</label>
                    <textarea
                      rows={3}
                      required
                      value={formMeaning}
                      onChange={(e) => setFormMeaning(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all placeholder-slate-600 resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-emerald-400 block mb-1">Vietnamese Translation</label>
                    <textarea
                      rows={3}
                      required
                      value={formVietnamese}
                      onChange={(e) => setFormVietnamese(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-950/30 focus:border-emerald-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all placeholder-slate-600 resize-none"
                    />
                  </div>
                </div>

                {/* Example Sentence & Common Phrases in same row */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Example Sentence</label>
                    <textarea
                      rows={3}
                      value={formExample}
                      onChange={(e) => setFormExample(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none resize-none transition-all placeholder-slate-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Common Phrases (Optional)</label>
                    <textarea
                      rows={3}
                      value={formCommonPhrases}
                      onChange={(e) => setFormCommonPhrases(e.target.value)}
                      placeholder="Enter common phrases using this word, one per line..."
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none resize-none transition-all placeholder-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Difficulty Rating</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(["easy", "medium", "hard"] as const).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setFormDifficulty(diff)}
                        className={`py-2.5 rounded-xl text-xs font-bold uppercase border transition-all cursor-pointer active:scale-98 ${
                          formDifficulty === diff
                            ? diff === "easy"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                              : diff === "medium"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/40"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/40"
                            : "bg-slate-900/60 border-slate-900/60 text-slate-450 hover:text-slate-200"
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 shadow hover:shadow-cyan/25 active:scale-95 transition-all cursor-pointer"
                >
                  Add Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          EDIT WORD MODAL
          ======================================================== */}
      {isEditModalOpen && selectedWord && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto glass-panel rounded-2xl border border-slate-800 p-5 sm:p-8 space-y-6 shadow-2xl bg-[#0a0f1d] animate-scale-up scrollbar-thin">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <h3 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-cyan-400 stroke-[2.5]" /> Edit Vocabulary Card
              </h3>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedWord(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["word", "phrase", "idiom", "native_daily_phrase"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled
                        className={`py-2 rounded-xl text-xs font-bold uppercase border transition-all cursor-not-allowed ${
                          formType === t
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/40 opacity-100"
                            : "bg-slate-900/40 border-slate-950/40 text-slate-600 opacity-40"
                        }`}
                      >
                        {getTypeLabel(t)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Vocabulary type is locked for existing cards to preserve analytics metrics.
                  </p>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary Word / Phrase</label>
                  <input
                    type="text"
                    required
                    value={formWord}
                    onChange={(e) => setFormWord(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all"
                  />
                </div>

                {spellingWarning && (
                  <div className="md:col-span-2 px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[13px] font-medium rounded-xl flex items-center gap-2 animate-fade-in">
                    <Info className="w-4.5 h-4.5 shrink-0 text-amber-400" />
                    <span>Warning: &quot;{formWord}&quot; might have a spelling mistake (not found in dictionary). You can still save it.</span>
                  </div>
                )}

                {formType === "word" ? (
                  <>
                    <div className="space-y-1.5 md:col-span-1">
                      <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">US Pronunciation</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled
                          value={formPronunciationUS}
                          className="flex-1 px-4 py-3 bg-slate-900/40 border border-slate-850/60 rounded-xl text-sm text-slate-350 cursor-not-allowed"
                        />
                        <button
                          type="button"
                          disabled={!formWord.trim()}
                          onClick={() => playPronunciation(formWord, "US")}
                          className="px-3.5 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                          title="Listen US"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 md:col-span-1">
                      <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">UK Pronunciation</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled
                          value={formPronunciationUK}
                          className="flex-1 px-4 py-3 bg-slate-900/40 border border-slate-850/60 rounded-xl text-sm text-slate-350 cursor-not-allowed"
                        />
                        <button
                          type="button"
                          disabled={!formWord.trim()}
                          onClick={() => playPronunciation(formWord, "UK")}
                          className="px-3.5 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                          title="Listen UK"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}

                {formType === "word" && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Word Type</label>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {WORD_TYPES_LIST.map((wt) => {
                        const isSelected = formWordTypes.includes(wt.value);
                        return (
                          <button
                            key={wt.value}
                            type="button"
                            onClick={() => {
                              if (wt.value === "") {
                                setFormWordTypes([]);
                              } else {
                                setFormWordTypes(prev =>
                                  prev.includes(wt.value)
                                    ? prev.filter(x => x !== wt.value)
                                    : [...prev, wt.value]
                                );
                              }
                            }}
                            className={`py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              (wt.value === "" && formWordTypes.length === 0) || isSelected
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                                : "bg-slate-900/60 border-slate-900/60 text-slate-455 hover:text-slate-200"
                            }`}
                          >
                            {wt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* English & Vietnamese Meanings in same row */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">English Meaning</label>
                    <textarea
                      rows={3}
                      required
                      value={formMeaning}
                      onChange={(e) => setFormMeaning(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-emerald-400 block mb-1">Vietnamese Translation</label>
                    <textarea
                      rows={3}
                      required
                      value={formVietnamese}
                      onChange={(e) => setFormVietnamese(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-950/30 focus:border-emerald-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Example Sentence & Common Phrases in same row */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Example Sentence</label>
                    <textarea
                      rows={3}
                      value={formExample}
                      onChange={(e) => setFormExample(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none resize-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Common Phrases (Optional)</label>
                    <textarea
                      rows={3}
                      value={formCommonPhrases}
                      onChange={(e) => setFormCommonPhrases(e.target.value)}
                      placeholder="Enter common phrases using this word, one per line..."
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none resize-none transition-all placeholder-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Difficulty Rating</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(["easy", "medium", "hard"] as const).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setFormDifficulty(diff)}
                        className={`py-2.5 rounded-xl text-xs font-bold uppercase border transition-all cursor-pointer active:scale-98 ${
                          formDifficulty === diff
                            ? diff === "easy"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                              : diff === "medium"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/40"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/40"
                            : "bg-slate-900/60 border-slate-900/60 text-slate-455 hover:text-slate-200"
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedWord) {
                      triggerDelete(selectedWord, () => {
                        setIsEditModalOpen(false);
                        setSelectedWord(null);
                      });
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Card
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setSelectedWord(null);
                    }}
                    className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 shadow hover:shadow-cyan/25 active:scale-95 transition-all cursor-pointer"
                  >
                    Update Card
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          PRE-SUBMIT CONFIRMATION MODAL
          ======================================================== */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto glass-panel rounded-2xl border border-cyan-500/20 p-5 sm:p-6 space-y-5 shadow-2xl bg-[#080d16] animate-scale-up scrollbar-thin">
            <div className="flex items-center gap-2 border-b border-slate-900 pb-3">
              <Check className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-slate-100">Confirm Vocabulary Submission</h3>
            </div>

            <div className="space-y-3">
              <p className="text-[13px] text-slate-400">
                Please double-check the values below before submitting. Note that pronunciation fields are read-only to ensure data integrity.
              </p>

              <div className="overflow-hidden border border-slate-900 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900/40 text-slate-400 uppercase tracking-wider text-[10px] font-black border-b border-slate-900">
                      <th className="px-4 py-2">Field</th>
                      <th className="px-4 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 bg-slate-955/20">
                    {confirmData.map((row) => (
                      <tr key={row.label} className="hover:bg-slate-905/20">
                        <td className="px-4 py-2.5 font-bold text-slate-400 whitespace-nowrap">{row.label}</td>
                        <td className="px-4 py-2.5 text-slate-200 font-medium break-all">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-900">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Go Back & Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  await createWord(formWord, formType, formMeaning, formVietnamese, formExample, formDifficulty, formWordTypes, formPronunciationUS, formPronunciationUK, formCommonPhrases);
                  setIsConfirmModalOpen(false);
                  resetAddForm();
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 shadow hover:shadow-cyan/25 active:scale-95 transition-all cursor-pointer"
              >
                Accept & Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          DUPLICATE WORD WARNING MODAL
          ======================================================== */}
      {isDuplicateModalOpen && duplicateFoundItem && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md glass-panel rounded-2xl border border-amber-500/30 p-6 space-y-5 shadow-2xl bg-[#0a0f1d] animate-scale-up">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-100">Duplicate Word Detected</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">This word already exists in your library.</p>
              </div>
            </div>

            {/* Existing entry preview */}
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">Existing Entry</p>
              <p className="text-lg font-black text-slate-100">{duplicateFoundItem.word}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {getTypeLabel(duplicateFoundItem.type)}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20">
                  {duplicateFoundItem.difficulty}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{duplicateFoundItem.meaning}</p>
              <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <span className="text-[9px] px-1 rounded bg-emerald-500/10 border border-emerald-500/10 font-bold">VN</span>
                {duplicateFoundItem.vietnamese}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsDuplicateModalOpen(false);
                  setDuplicateFoundItem(null);
                }}
                className="flex-1 py-2.5 text-xs font-bold text-slate-300 hover:text-slate-100 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all cursor-pointer"
              >
                Go Back & Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsDuplicateModalOpen(false);
                  setDuplicateFoundItem(null);
                  setPendingCreateAfterDupe(true);
                  // Trigger the submit flow again, this time skipping dupe check
                  await createWord(formWord, formType, formMeaning, formVietnamese, formExample, formDifficulty, formWordTypes, formPronunciationUS, formPronunciationUK, formCommonPhrases);
                  setPendingCreateAfterDupe(false);
                  resetAddForm();
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 active:scale-95 transition-all cursor-pointer shadow-md shadow-amber-500/10"
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          DELETE CONFIRMATION MODAL
          ======================================================== */}
      {isDeleteConfirmOpen && deleteTargetItem && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-rose-500/20 p-6 space-y-6 shadow-2xl bg-[#080d16] animate-scale-up text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 border border-rose-500/20">
              <Trash2 className="w-6 h-6 animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-100">Delete Vocabulary Card?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Are you sure you want to delete <span className="text-slate-200 font-bold">"{deleteTargetItem.word}"</span>? This action is permanent and cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                }}
                className="flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all cursor-pointer"
              >
                No, Keep It
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = deleteTargetItem;
                  setIsDeleteConfirmOpen(false);
                  await deleteWord(target);
                  if (onDeleteSuccess) {
                    onDeleteSuccess();
                  }
                }}
                className="flex-1 py-3 rounded-xl text-xs font-extrabold bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white shadow-lg shadow-rose-500/10 active:scale-95 transition-all cursor-pointer"
              >
                Yes, Delete Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
