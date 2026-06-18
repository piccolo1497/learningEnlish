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
  DocumentSnapshot
} from "firebase/firestore";
import {
  Library,
  Star,
  Edit3,
  Trash2,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Plus
} from "lucide-react";

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
        : "text-slate-400 hover:text-fuchsia-300 border-slate-900 hover:border-fuchsia-500/10 hover:bg-fuchsia-500/5";
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
    deleteWord,
    setIsAddModalOpen,
    setIsEditModalOpen,
    setSelectedWord,
    refreshCounts,
    reviewWords
  } = useVocab();

  // Filters state
  const [activeTab, setActiveTab] = useState<"all" | "word" | "phrase" | "idiom" | "native_daily_phrase">("all");
  const [starredOnly, setStarredOnly] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState<{ [page: number]: VocabItem[] }>({});
  
  // Performance optimized pagination controls (using refs to avoid hook dependency triggers)
  const cursorsRef = useRef<{ [page: number]: Cursors }>({
    0: { word: null, phrase: null, idiom: null, native_daily_phrase: null }
  });
  const isLoadingRef = useRef(false);

  const [hasMore, setHasMore] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);

  // Clear cache and reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
    setPageData({});
    cursorsRef.current = {
      0: { word: null, phrase: null, idiom: null, native_daily_phrase: null }
    };
    setHasMore(true);
  }, [activeTab, starredOnly, searchQuery]);

  // Combined fetch function
  const fetchPage = useCallback(async (page: number) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoadingItems(true);

    try {
      const prevCursors = cursorsRef.current[page - 1] || { word: null, phrase: null, idiom: null, native_daily_phrase: null };

      // Offline / Local storage fallback check
      if (!db) {
        const saved = localStorage.getItem("lexivault_words");
        if (saved) {
          try {
            let all: VocabItem[] = JSON.parse(saved);
            
            // Apply filters
            if (activeTab !== "all") {
              all = all.filter(w => w.type === activeTab);
            }
            if (starredOnly) {
              all = all.filter(w => w.bookmarked);
            }
            if (searchQuery.trim()) {
              const q = searchQuery.toLowerCase().trim();
              all = all.filter(w =>
                w.word.toLowerCase().includes(q) ||
                w.meaning.toLowerCase().includes(q) ||
                w.vietnamese.toLowerCase().includes(q) ||
                w.example?.toLowerCase().includes(q)
              );
            }

            // Sort by creation date desc
            all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            const startIndex = (page - 1) * 10;
            const sliced = all.slice(startIndex, startIndex + 10);

            setPageData(prev => ({ ...prev, [page]: sliced }));
            setHasMore(startIndex + 10 < all.length);
          } catch (e) {
            console.error("Local storage parse error in library:", e);
          }
        }
        return;
      }

      // 1. Search Mode: Fetch all (up to 100) and paginate client-side to allow deep text search
      if (searchQuery.trim()) {
        const types = activeTab === "all"
          ? (["word", "phrase", "idiom", "native_daily_phrase"] as const)
          : [activeTab] as const;

        const allFetched: VocabItem[] = [];
        await Promise.all(
          types.map(async (t) => {
            let q = query(
              collection(db!, "vocabulary", t, "items"),
              orderBy("createdAt", "desc"),
              limit(100)
            );
            if (starredOnly) {
              q = query(
                collection(db!, "vocabulary", t, "items"),
                where("bookmarked", "==", true),
                orderBy("createdAt", "desc"),
                limit(100)
              );
            }
            const snap = await getDocs(q);
            snap.forEach((d) => {
              allFetched.push({ id: d.id, ...d.data() } as VocabItem);
            });
          })
        );

        // Sort combined search list
        allFetched.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

        // Apply client side substring filter
        const q = searchQuery.toLowerCase().trim();
        const filtered = allFetched.filter(w =>
          w.word.toLowerCase().includes(q) ||
          w.meaning.toLowerCase().includes(q) ||
          w.vietnamese.toLowerCase().includes(q) ||
          (w.example && w.example.toLowerCase().includes(q))
        );

        const startIndex = (page - 1) * 10;
        const sliced = filtered.slice(startIndex, startIndex + 10);

        setPageData(prev => ({ ...prev, [page]: sliced }));
        setHasMore(startIndex + 10 < filtered.length);
        return;
      }

      // 2. Normal Mode: Server-side pagination
      const typesToQuery = activeTab === "all"
        ? (["word", "phrase", "idiom", "native_daily_phrase"] as const)
        : [activeTab] as const;

      const collectionsDocs: { [key: string]: { doc: DocumentSnapshot; item: VocabItem }[] } = {};

      await Promise.all(
        typesToQuery.map(async (t) => {
          let q = query(
            collection(db!, "vocabulary", t, "items"),
            orderBy("createdAt", "desc"),
            limit(10)
          );

          if (starredOnly) {
            q = query(
              collection(db!, "vocabulary", t, "items"),
              where("bookmarked", "==", true),
              orderBy("createdAt", "desc"),
              limit(10)
            );
          }

          // Apply pagination cursor
          const currentCursor = prevCursors[t];
          if (currentCursor) {
            if (starredOnly) {
              q = query(
                collection(db!, "vocabulary", t, "items"),
                where("bookmarked", "==", true),
                orderBy("createdAt", "desc"),
                startAfter(currentCursor),
                limit(10)
              );
            } else {
              q = query(
                collection(db!, "vocabulary", t, "items"),
                orderBy("createdAt", "desc"),
                startAfter(currentCursor),
                limit(10)
              );
            }
          }

          const snap = await getDocs(q);
          const docsArr: { doc: DocumentSnapshot; item: VocabItem }[] = [];
          snap.forEach((d) => {
            docsArr.push({
              doc: d,
              item: { id: d.id, ...d.data() } as VocabItem
            });
          });
          collectionsDocs[t] = docsArr;
        })
      );

      // Merge and sort
      let merged: { doc: DocumentSnapshot; item: VocabItem; type: string }[] = [];
      Object.keys(collectionsDocs).forEach((typeKey) => {
        collectionsDocs[typeKey].forEach((entry) => {
          merged.push({ ...entry, type: typeKey });
        });
      });

      // Sort combined results by createdAt desc
      merged.sort((a, b) => new Date(b.item.createdAt || 0).getTime() - new Date(a.item.createdAt || 0).getTime());

      // Slice the top 10
      const selectedTop10 = merged.slice(0, 10);
      const itemsToRender = selectedTop10.map(m => m.item);

      // Calculate next cursors
      const nextCursors: Cursors = { ...prevCursors };
      selectedTop10.forEach((m) => {
        nextCursors[m.type as keyof Cursors] = m.doc;
      });

      cursorsRef.current[page] = nextCursors;
      setPageData(prev => ({ ...prev, [page]: itemsToRender }));

      // If we got exactly 10 merged items, check if there might be more
      setHasMore(selectedTop10.length === 10);
    } catch (err) {
      console.error("Firestore pagination error:", err);
    } finally {
      isLoadingRef.current = false;
      setLoadingItems(false);
    }
  }, [activeTab, starredOnly, searchQuery]);

  // Fetch page if not cached
  useEffect(() => {
    if (!pageData[currentPage]) {
      fetchPage(currentPage);
    }
  }, [currentPage, pageData, fetchPage]);

  // Navigations
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(p => p - 1);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage(p => p + 1);
    }
  };

  const currentItems = pageData[currentPage] || [];

  return (
    <div className="space-y-6">
      
      {/* Library Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/40 border border-slate-900">
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold text-slate-100">Library Words</h2>
          <p className="text-[13px] text-slate-400">
            Explore and query words, phrases, and idioms. Use filters to adjust catalog.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Category Pill Filters with counts */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 border border-slate-900 rounded-xl overflow-x-auto max-w-full">
            {(["all", "word", "phrase", "idiom", "native_daily_phrase"] as const).map((t) => {
              const isActive = activeTab === t;
              const count = counts[t as keyof typeof counts] || 0;
              return (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
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

          {/* Starred Toggle */}
          <button
            onClick={() => setStarredOnly(!starredOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
              starredOnly
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${starredOnly ? "fill-amber-450" : ""}`} />
            <span>Starred</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {currentItems.map((item) => (
              <div
                key={item.id}
                className="glass-panel glass-panel-hover rounded-2xl p-6 border border-slate-900 flex flex-col justify-between min-h-[230px]"
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
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
                    <button
                      onClick={async () => {
                        await toggleBookmark(item);
                        // Refresh the current page's bookmark representation locally
                        setPageData(prev => ({
                          ...prev,
                          [currentPage]: prev[currentPage].map(w => w.id === item.id ? { ...w, bookmarked: !w.bookmarked } : w)
                        }));
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
                      <div className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded-lg border border-slate-850">
                        <span className="text-[9px] font-black text-slate-500">US</span>
                        {item.type !== "native_daily_phrase" && (
                          <span className="text-[11px] font-medium text-slate-400">
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
                          <Volume2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* UK Pronunciation */}
                      <div className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded-lg border border-slate-850">
                        <span className="text-[9px] font-black text-slate-500">UK</span>
                        {item.type !== "native_daily_phrase" && (
                          <span className="text-[11px] font-medium text-slate-400">
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
                          <Volume2 className="w-3 h-3" />
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
                    <p className="text-slate-350 text-[14px] italic leading-relaxed border-l-2 border-cyan-500/30 pl-3 mt-3.5 py-0.5">
                      &ldquo;{item.example}&rdquo;
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-900/60 mt-4">
                  <span className="text-[11px] text-slate-500">
                    Next review: <span className={item.nextReview === "Today" ? "text-cyan-400 font-bold" : "text-slate-450"}>{item.nextReview}</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setSelectedWord(item);
                        setIsEditModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-900 cursor-pointer"
                      title="Edit"
                    >
                      <Edit3 className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={async () => {
                        await deleteWord(item);
                        // Refresh state after deletion
                        setPageData(prev => ({
                          ...prev,
                          [currentPage]: prev[currentPage].filter(w => w.id !== item.id)
                        }));
                        refreshCounts();
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-900 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={() => {
                        router.push(`/practice?id=${item.id}`);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-slate-900 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-400 rounded-md border border-slate-800 transition-all cursor-pointer"
                    >
                      Test
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/40 border border-slate-900">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1 || loadingItems}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>
            <span className="text-xs font-bold text-slate-400">
              Page {currentPage} {loadingItems && <span className="text-cyan-500 animate-pulse ml-1">(loading...)</span>}
            </span>
            <button
              onClick={handleNextPage}
              disabled={!hasMore || loadingItems}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
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
