"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useVocab, VocabItem } from "@/app/context/VocabContext";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  DocumentSnapshot,
  getCountFromServer
} from "firebase/firestore";
import { getTypeBadge, getDifficultyBadge, getTypeLabel, playPronunciation } from "@/lib/helpers";
import {
  Library,
  Star,
  Edit3,
  Trash2,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Plus,
  ChevronDown,
  CheckSquare,
  Square,
  Play,
  X,
  BrainCircuit,
  Hash
} from "lucide-react";

// Library-specific styling helpers

const getTabStyles = (type: string, isActive: boolean) => {
  switch (type) {
    case "all":
      return isActive
        ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-md shadow-cyan-500/5"
        : "text-slate-400 hover:text-cyan-200 border-slate-900 hover:border-cyan-400/40 hover:bg-gradient-to-r hover:from-cyan-500/20 hover:to-blue-500/10";
    case "word":
      return isActive
        ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 shadow-md shadow-indigo-500/5"
        : "text-slate-400 hover:text-indigo-200 border-slate-900 hover:border-indigo-400/40 hover:bg-gradient-to-r hover:from-indigo-500/20 hover:to-purple-500/10";
    case "phrase":
      return isActive
        ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-md shadow-cyan-500/5"
        : "text-slate-400 hover:text-cyan-200 border-slate-900 hover:border-cyan-400/40 hover:bg-gradient-to-r hover:from-cyan-500/20 hover:to-teal-500/10";
    case "idiom":
      return isActive
        ? "bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-md shadow-purple-500/5"
        : "text-slate-400 hover:text-purple-200 border-slate-900 hover:border-purple-400/40 hover:bg-gradient-to-r hover:from-purple-500/20 hover:to-pink-500/10";
    case "native_daily_phrase":
      return isActive
        ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30 shadow-md shadow-fuchsia-500/5"
        : "text-slate-400 hover:text-fuchsia-200 border-slate-900 hover:border-fuchsia-400/40 hover:bg-gradient-to-r hover:from-fuchsia-500/20 hover:to-rose-500/10";
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

const getWordFontSizeClass = (size: string) => {
  switch (size) {
    case "small":
      return "text-base";
    case "medium":
      return "text-lg";
    case "large":
      return "text-xl";
    case "xlarge":
      return "text-2xl";
    default:
      return "text-lg";
  }
};

interface Cursors {
  word: DocumentSnapshot | null;
  phrase: DocumentSnapshot | null;
  idiom: DocumentSnapshot | null;
  native_daily_phrase: DocumentSnapshot | null;
}

function LibraryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  const {
    counts,
    wordFontSize,
    toggleBookmark,
    triggerDelete,
    setIsAddModalOpen,
    setIsEditModalOpen,
    setSelectedWord,
    refreshCounts,
    reviewWords,
    lastUpdated
  } = useVocab();

  // Filters state
  const [activeTab, setActiveTab] = useState<"all" | "word" | "phrase" | "idiom" | "native_daily_phrase">("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll detection to make sticky filter bar dynamic
  useEffect(() => {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;

    const handleScroll = () => {
      const scrolled = mainEl.scrollTop > 20;
      setIsScrolled(prev => {
        if (prev !== scrolled) return scrolled;
        return prev;
      });
    };

    handleScroll();
    mainEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      mainEl.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<{ [id: string]: boolean }>({});
  const [showPracticeModal, setShowPracticeModal] = useState(false);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const clearSelection = () => {
    setSelectedIds({});
    setSelectionMode(false);
  };


  // Sorting state
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "alphabetical" | "hardest" | "medium" | "easiest">("newest");

  // Items state
  const [fetchedItems, setFetchedItems] = useState<VocabItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedPhrases, setExpandedPhrases] = useState<{ [id: string]: boolean }>({});

  // Reset page and expanded phrases on filter changes
  useEffect(() => {
    setCurrentPage(1);
    setExpandedPhrases({});
  }, [activeTab, starredOnly, searchQuery, sortBy]);

  // Combined fetch function
  const fetchItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      if (!db) {
        const saved = localStorage.getItem("lexivault_words");
        if (saved) {
          try {
            let all: VocabItem[] = JSON.parse(saved);
            if (activeTab !== "all") {
              all = all.filter(w => w.type === activeTab);
            }
            if (starredOnly) {
              all = all.filter(w => w.bookmarked);
            }
            setFetchedItems(all);
          } catch (e) {
            console.error("Local storage parse error in library:", e);
          }
        }
        return;
      }

      const types = activeTab === "all"
        ? (["word", "phrase", "idiom", "native_daily_phrase"] as const)
        : [activeTab] as const;

      const allFetched: VocabItem[] = [];
      await Promise.all(
        types.map(async (t) => {
          let q = query(
            collection(db!, "vocabulary", t, "items"),
            limit(300)
          );
          if (starredOnly) {
            q = query(
              collection(db!, "vocabulary", t, "items"),
              where("bookmarked", "==", true),
              limit(300)
            );
          }
          const snap = await getDocs(q);
          snap.forEach((d) => {
            allFetched.push({ id: d.id, ...d.data(), type: t } as VocabItem);
          });
        })
      );
      setFetchedItems(allFetched);
    } catch (err) {
      console.error("Error fetching library items:", err);
    } finally {
      setLoadingItems(false);
    }
  }, [activeTab, starredOnly, lastUpdated]);

  // Fetch items when active tab or starred toggle changes
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Helper weight function for difficulty sorting
  const getDifficultyWeight = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case "easy": return 1;
      case "medium": return 2;
      case "hard": return 3;
      default: return 2; // Default to medium weight
    }
  };

  // Helper sorting function
  const getSortedItems = useCallback((items: VocabItem[]) => {
    const sorted = [...items];
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        break;
      case "oldest":
        sorted.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
        break;
      case "alphabetical":
        sorted.sort((a, b) => (a.word || "").localeCompare(b.word || ""));
        break;
      case "hardest":
        sorted.sort((a, b) => getDifficultyWeight(b.difficulty) - getDifficultyWeight(a.difficulty));
        break;
      case "easiest":
        sorted.sort((a, b) => getDifficultyWeight(a.difficulty) - getDifficultyWeight(b.difficulty));
        break;
      case "medium":
        sorted.sort((a, b) => {
          const distA = Math.abs(getDifficultyWeight(a.difficulty) - 2);
          const distB = Math.abs(getDifficultyWeight(b.difficulty) - 2);
          if (distA !== distB) {
            return distA - distB; // Medium (0) comes first
          }
          return getDifficultyWeight(b.difficulty) - getDifficultyWeight(a.difficulty);
        });
        break;
      default:
        break;
    }
    return sorted;
  }, [sortBy]);

  // Processed, filtered, and sorted items list
  const processedItems = useMemo(() => {
    let items = [...fetchedItems];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(w =>
        w.word.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q) ||
        w.vietnamese.toLowerCase().includes(q) ||
        (w.example && w.example.toLowerCase().includes(q))
      );
    }
    return getSortedItems(items);
  }, [fetchedItems, searchQuery, getSortedItems]);

  const computedTotalItems = processedItems.length;
  const totalPages = Math.max(1, Math.ceil(computedTotalItems / 10));
  const hasMoreComputed = currentPage < totalPages;

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (currentPage > 3) {
        pages.push("...");
      }
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      let adjustedStart = start;
      let adjustedEnd = end;
      if (currentPage <= 3) {
        adjustedEnd = 4;
      }
      if (currentPage >= totalPages - 2) {
        adjustedStart = totalPages - 3;
      }
      for (let i = adjustedStart; i <= adjustedEnd; i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }
      if (currentPage < totalPages - 2) {
        pages.push("...");
      }
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(p => p - 1);
    }
  };

  const handleNextPage = () => {
    if (hasMoreComputed) {
      setCurrentPage(p => p + 1);
    }
  };

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * 10;
    return processedItems.slice(start, start + 10);
  }, [processedItems, currentPage]);

  const toggleSelectAll = () => {
    const allOnPageSelected = currentItems.length > 0 && currentItems.every(item => selectedIds[item.id]);
    setSelectedIds(prev => {
      const next = { ...prev };
      currentItems.forEach(item => {
        next[item.id] = !allOnPageSelected;
      });
      return next;
    });
  };

  const getSelectedItems = useCallback((): VocabItem[] => {
    return fetchedItems.filter(item => selectedIds[item.id]);
  }, [fetchedItems, selectedIds]);

  const selectedCount = Object.keys(selectedIds).filter(id => selectedIds[id]).length;


  const handleStartPractice = (mode: "flashcard" | "fillblank") => {
    const items = getSelectedItems();
    if (items.length === 0) return;
    sessionStorage.setItem("lexivault_custom_practice", JSON.stringify(items));
    setShowPracticeModal(false);
    if (mode === "flashcard") {
      router.push("/practice?source=library");
    } else {
      router.push("/fillblank?source=library");
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Library Title */}
      <div className="space-y-0.5">
        <h2 className="text-xl font-bold text-slate-100">Library Words</h2>
        <p className="text-[13px] text-slate-400">
          Explore and query words, phrases, and idioms. Use filters to adjust catalog.
        </p>
      </div>

      {/* Sticky Filter Bar */}
      <div 
        className={`sticky top-0 z-30 flex items-center justify-between gap-4 p-3 rounded-2xl transition-all duration-300 ease-in-out border ${
          isScrolled 
            ? "bg-[#0a0f1d]/95 backdrop-blur-xl border-cyan-400/60 shadow-[0_8px_30px_rgba(6,182,212,0.25)] scale-[0.98] translate-y-1" 
            : "bg-[#080d16]/90 backdrop-blur-md border-slate-700/80 scale-100 translate-y-0"
        } overflow-x-auto flex-nowrap scrollbar-thin`}
      >
        {/* Category Pill Filters */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 border border-slate-900 rounded-xl shrink-0 flex-nowrap">
          {(["all", "word", "phrase", "idiom", "native_daily_phrase"] as const).map((t) => {
            const isActive = activeTab === t;
            const count = counts[t as keyof typeof counts] || 0;
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border cursor-pointer whitespace-nowrap flex items-center gap-2 ${getTabStyles(t, isActive)}`}
              >
                <span>{t === "all" ? "All" : getTypeLabel(t)}</span>
                <span className={`px-2 py-0.5 text-[11px] rounded-md font-black transition-all ${getCountBadgeStyles(t, isActive)}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right side controls (Starred, Sort & Select Toggles) */}
        <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
          {/* Starred Toggle */}
          {/* Starred Toggle */}
          <button
            onClick={() => setStarredOnly(!starredOnly)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              starredOnly
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-gradient-to-r hover:from-amber-500/20 hover:to-amber-500/10 hover:border-amber-400/50"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/30 hover:bg-gradient-to-r hover:from-amber-500/15 hover:to-yellow-500/5"
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${starredOnly ? "fill-amber-400" : ""}`} />
            <span>Starred</span>
          </button>

          {/* Sort Selector */}
          <div className="relative shrink-0 flex items-center">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl text-xs font-bold border bg-slate-900 border-slate-800 text-slate-300 hover:text-cyan-200 hover:border-cyan-500/30 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-blue-500/5 transition-all cursor-pointer outline-none focus:border-cyan-500/50"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="alphabetical">A–Z</option>
              <option value="hardest">Hardest</option>
              <option value="medium">Medium</option>
              <option value="easiest">Easiest</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>

          {/* Select Toggle */}
          <button
            onClick={() => {
              if (selectionMode) {
                clearSelection();
              } else {
                setSelectionMode(true);
              }
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              selectionMode
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-500/20 hover:to-blue-500/10 hover:border-cyan-400/50"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 hover:bg-gradient-to-r hover:from-cyan-500/15 hover:to-blue-500/5"
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{selectionMode ? "Cancel" : "Select"}</span>
          </button>
        </div>
      </div>

      {/* Library Grid */}
      {loadingItems && currentItems.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[260px]">
          <div className="w-8 h-8 border-[3px] border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold text-slate-400">Loading catalog page...</p>
        </div>
      ) : currentItems.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[260px]">
          <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 mb-3">
            <Library className="w-5 h-5" />
          </div>
          <h4 className="text-slate-200 font-bold text-sm">No library elements found</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
            Try editing filters, clearing search query, or adding a new word.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-5 px-4 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 active:scale-95 transition-all cursor-pointer"
          >
            Add New Element
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Select All / Selection Status Bar */}
          {selectionMode && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/15">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  {currentItems.length > 0 && currentItems.every(item => selectedIds[item.id])
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4" />
                  }
                  <span>Select All on Page</span>
                </button>
                <span className="text-[11px] text-slate-400 font-semibold">
                  {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
                </span>
              </div>
              {selectedCount > 0 && (
                <button
                  onClick={() => setSelectedIds({})}
                  className="text-[11px] text-slate-500 hover:text-slate-300 font-bold cursor-pointer transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {currentItems.map((item) => {
              const isSelected = !!selectedIds[item.id];
              return (
              <div
                key={item.id}
                className={`liquid-card p-6 flex flex-col justify-between min-h-[230px] transition-all duration-200 ${
                  isSelected
                    ? "shadow-lg shadow-cyan-500/25 scale-[1.01]"
                    : ""
                }`}
                onClick={() => {
                  if (selectionMode) {
                    toggleSelection(item.id);
                  }
                }}
                style={{
                  cursor: selectionMode ? "pointer" : undefined,
                  borderColor: isSelected ? "#22d3ee" : undefined,
                  background: isSelected ? "rgba(6, 182, 212, 0.18)" : undefined,
                  boxShadow: isSelected ? "0 0 15px rgba(6, 182, 212, 0.25)" : undefined,
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {selectionMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelection(item.id); }}
                          className="mr-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        >
                          {isSelected
                            ? <CheckSquare className="w-4.5 h-4.5" />
                            : <Square className="w-4.5 h-4.5" />
                          }
                        </button>
                      )}
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
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await toggleBookmark(item);
                        setFetchedItems(prev => {
                          if (starredOnly) {
                            return prev.filter(w => w.id !== item.id);
                          }
                          return prev.map(w => w.id === item.id ? { ...w, bookmarked: !w.bookmarked } : w);
                        });
                      }}
                      className="text-slate-500 hover:text-amber-400 transition-colors p-0.5 rounded cursor-pointer"
                    >
                      <Star className={`w-3.5 h-3.5 ${item.bookmarked ? "fill-amber-400 text-amber-400" : ""}`} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 mb-2">
                    <h4 className={`${getWordFontSizeClass(wordFontSize)} font-black tracking-tight text-slate-100`}>{item.word}</h4>
                    
                    {/* US & UK Play Pronunciations for all types, including Native Daily Phrase */}
                    <div className="flex flex-wrap gap-2">
                      {/* US Pronunciation */}
                      <div className="flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-xl border border-slate-850">
                        <span className="text-[11px] font-black text-slate-400">US</span>
                        {item.type !== "native_daily_phrase" && (
                          <span className="text-[13px] font-semibold text-slate-200">
                            {item.pronunciationUS || "N/A"}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPronunciation(item.word, "US");
                          }}
                          className="p-1 rounded text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer hover:bg-slate-800/40"
                          title="Listen US"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* UK Pronunciation */}
                      <div className="flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-xl border border-slate-850">
                        <span className="text-[11px] font-black text-slate-400">UK</span>
                        {item.type !== "native_daily_phrase" && (
                          <span className="text-[13px] font-semibold text-slate-200">
                            {item.pronunciationUK || "N/A"}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPronunciation(item.word, "UK");
                          }}
                          className="p-1 rounded text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer hover:bg-slate-800/40"
                          title="Listen UK"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-slate-200 text-[15px] leading-relaxed line-clamp-2">{item.meaning}</p>

                  {/* Vietnamese translation display */}
                  <p className="text-emerald-400 text-[15px] font-bold mt-1.5 flex items-center gap-1">
                    <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/10">VN</span>
                    {item.vietnamese}
                  </p>

                  {item.example && (
                    <p className="text-slate-100 text-[14.5px] italic leading-relaxed border-l-2 border-cyan-400 pl-3.5 mt-3.5 py-0.5">
                      &ldquo;{item.example}&rdquo;
                    </p>
                  )}

                  {item.commonPhrases && (
                    <div className="mt-3.5 border-t border-slate-900/60 pt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedPhrases(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-black text-cyan-300 hover:text-cyan-200 transition-colors uppercase tracking-wider cursor-pointer"
                      >
                        <span>Common Phrases ({item.commonPhrases.split("\n").filter(l => l.trim()).length})</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedPhrases[item.id] ? "rotate-180" : ""}`} />
                      </button>

                      {expandedPhrases[item.id] && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5 animate-scale-up">
                          {item.commonPhrases.split("\n").filter(line => line.trim()).map((phrase, idx) => (
                            <span key={idx} className="px-2.5 py-1 rounded-lg bg-cyan-950/50 text-cyan-200 border border-cyan-500/30 text-[12px] font-semibold">
                              {phrase}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-900/60 mt-4">
                  <span className="text-[11px] text-slate-500">
                    Next review: <span className={item.nextReview === "Today" ? "text-cyan-400 font-bold" : "text-slate-450"}>{item.nextReview}</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWord(item);
                        setIsEditModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-900 cursor-pointer"
                      title="Edit"
                    >
                      <Edit3 className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerDelete(item, () => {
                          setFetchedItems(prev => prev.filter(w => w.id !== item.id));
                          refreshCounts();
                        });
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-900 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/practice?id=${item.id}&source=library`);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-slate-900 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-400 rounded-md border border-slate-800 transition-all cursor-pointer"
                    >
                      Test
                    </button>
                  </div>
                </div>
              </div>
            );
            })}
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1 || loadingItems}
              className="w-10 h-10 flex items-center justify-center rounded-xl border bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            
            <div className="flex items-center gap-2">
              {getPageNumbers().map((p, idx) => {
                if (p === "...") {
                  return (
                    <span key={`ell-${idx}`} className="w-10 h-10 flex items-center justify-center text-slate-500 text-sm font-semibold select-none">
                      ...
                    </span>
                  );
                }
                const pageNum = p as number;
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    onClick={() => {
                      if (!loadingItems) setCurrentPage(pageNum);
                    }}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                      isActive
                        ? "bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20"
                        : "bg-slate-900/60 text-slate-350 border-slate-800 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleNextPage}
              disabled={!hasMoreComputed || loadingItems}
              className="w-10 h-10 flex items-center justify-center rounded-xl border bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ChevronRight className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Selection Action Bar */}
      {selectionMode && selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-cyan-500/25 shadow-2xl shadow-cyan-500/10">
          <span className="text-sm font-bold text-slate-200">
            {selectedCount} selected
          </span>
          <div className="w-px h-6 bg-slate-800" />
          <button
            onClick={() => setShowPracticeModal(true)}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Practice Selected
          </button>
          <button
            onClick={clearSelection}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Practice Mode Selection Modal */}
      {showPracticeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPracticeModal(false)}>
          <div
            className="w-full max-w-md mx-4 p-6 rounded-2xl bg-[#0a0f1d] border border-slate-800 shadow-2xl space-y-5 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-100">Choose Practice Mode</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected for practice
                </p>
              </div>
              <button
                onClick={() => setShowPracticeModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Options */}
            <div className="grid grid-cols-1 gap-3">
              {/* Flashcard Practice */}
              <button
                onClick={() => handleStartPractice("flashcard")}
                className="group flex items-center gap-4 p-5 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all cursor-pointer text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                  <BrainCircuit className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">Flashcard Recall</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Flip cards to test your memory with spaced repetition</p>
                </div>
              </button>

              {/* Fill in the Blank */}
              <button
                onClick={() => handleStartPractice("fillblank")}
                className="group flex items-center gap-4 p-5 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all cursor-pointer text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/20 transition-colors">
                  <Hash className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">Fill in the Blank</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Type the correct word from its meaning and hints</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-cyan-500/25 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    }>
      <LibraryPageContent />
    </Suspense>
  );
}
