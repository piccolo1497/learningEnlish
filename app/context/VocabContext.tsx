"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  getCountFromServer
} from "firebase/firestore";

export interface VocabItem {
  id: string;
  word: string;
  type: "word" | "phrase" | "idiom" | "native_daily_phrase";
  wordType?: string;    // legacy
  wordTypes?: string[]; // support multiple word types
  pronunciation?: string;   // legacy
  pronunciationUS?: string; // US pronunciation phonetic
  pronunciationUK?: string; // UK pronunciation phonetic
  meaning: string;      // English meaning
  vietnamese: string;   // Vietnamese meaning
  example: string;
  commonPhrases?: string;
  difficulty: "easy" | "medium" | "hard";
  nextReview: string;
  bookmarked: boolean;
  streak: number;
  createdAt?: string;
}

interface ToastState {
  message: string;
  visible: boolean;
}

interface VocabContextType {
  words: VocabItem[]; // Offline words or cached review list
  loading: boolean;
  dbError: string | null;
  userName: string;
  setUserName: (name: string) => void;
  streak: number;
  setStreak: React.Dispatch<React.SetStateAction<number>>;
  dailyProgress: number;
  setDailyProgress: React.Dispatch<React.SetStateAction<number>>;
  dailyGoal: number;
  setDailyGoal: (g: number) => void;
  accuracyHistory: { correct: number; total: number };
  setAccuracyHistory: React.Dispatch<React.SetStateAction<{ correct: number; total: number }>>;
  wordFontSize: "small" | "medium" | "large" | "xlarge";
  setWordFontSize: (size: "small" | "medium" | "large" | "xlarge") => void;
  
  // Modals & toast
  toast: ToastState;
  showToast: (message: string) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  isEditModalOpen: boolean;
  setIsEditModalOpen: (open: boolean) => void;
  selectedWord: VocabItem | null;
  setSelectedWord: (word: VocabItem | null) => void;

  // Custom Delete Confirm Dialog
  isDeleteConfirmOpen: boolean;
  setIsDeleteConfirmOpen: (open: boolean) => void;
  deleteTargetItem: VocabItem | null;
  triggerDelete: (item: VocabItem, onSuccess?: () => void) => void;
  onDeleteSuccess: (() => void) | null;

  // DB Actions
  createWord: (formWord: string, formType: VocabItem["type"], formMeaning: string, formVietnamese: string, formExample: string, formDifficulty: VocabItem["difficulty"], formWordTypes: string[], formPronunciationUS: string, formPronunciationUK: string, formCommonPhrases?: string) => Promise<void>;
  updateWord: (item: VocabItem, formWord: string, formType: VocabItem["type"], formMeaning: string, formVietnamese: string, formExample: string, formDifficulty: VocabItem["difficulty"], formWordTypes: string[], formPronunciationUS: string, formPronunciationUK: string, formCommonPhrases?: string) => Promise<void>;
  deleteWord: (item: VocabItem) => Promise<void>;
  toggleBookmark: (item: VocabItem) => Promise<void>;
  updatePracticeProgress: (item: VocabItem, known: boolean) => Promise<void>;
  checkDuplicate: (word: string) => Promise<VocabItem | null>;

  // Real-time Counts for sidebar and library filters
  counts: { all: number; word: number; phrase: number; idiom: number; native_daily_phrase: number };
  refreshCounts: () => Promise<void>;
  
  // Real-time review queue
  reviewWords: VocabItem[];
  refreshReviewWords: () => Promise<void>;

  // Sync / reactive updates trigger
  lastUpdated: number;
  triggerUpdate: () => void;
}

const VocabContext = createContext<VocabContextType | undefined>(undefined);

export function VocabProvider({ children }: { children: React.ReactNode }) {
  const [words, setWords] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Sync / reactive state
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const triggerUpdate = () => setLastUpdated(Date.now());

  // Settings states
  const [userName, setUserNameState] = useState("Cody");
  const [streak, setStreak] = useState(5);
  const [dailyProgress, setDailyProgress] = useState(7);
  const [dailyGoal, setDailyGoalState] = useState(15);
  const [accuracyHistory, setAccuracyHistory] = useState({ correct: 24, total: 28 });
  const [wordFontSize, setWordFontSizeState] = useState<"small" | "medium" | "large" | "xlarge">("medium");

  // Modals & Toast
  const [toast, setToast] = useState<ToastState>({ message: "", visible: false });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState<VocabItem | null>(null);

  // Custom Delete Confirm Dialog States
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteTargetItem, setDeleteTargetItem] = useState<VocabItem | null>(null);
  const [onDeleteSuccess, setOnDeleteSuccess] = useState<(() => void) | null>(null);

  const triggerDelete = (item: VocabItem, onSuccess?: () => void) => {
    setDeleteTargetItem(item);
    setOnDeleteSuccess(() => onSuccess || null);
    setIsDeleteConfirmOpen(true);
  };

  // Counts state
  const [counts, setCounts] = useState({ all: 0, word: 0, phrase: 0, idiom: 0, native_daily_phrase: 0 });
  
  // Review stack state
  const [reviewWords, setReviewWords] = useState<VocabItem[]>([]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, visible: true });
    toastTimerRef.current = setTimeout(() => setToast({ message: "", visible: false }), 3000);
  };

  // Load username, streak, goals, and font preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedName = localStorage.getItem("lexivault_username");
      if (savedName) setUserNameState(savedName);
      
      const savedGoal = localStorage.getItem("lexivault_daily_goal");
      if (savedGoal) setDailyGoalState(Number(savedGoal));
      
      const savedFontSize = localStorage.getItem("lexivault_word_font_size");
      if (savedFontSize) setWordFontSizeState(savedFontSize as any);

      const savedStreak = localStorage.getItem("lexivault_streak");
      if (savedStreak) setStreak(Number(savedStreak));

      const savedProgress = localStorage.getItem("lexivault_daily_progress");
      if (savedProgress) setDailyProgress(Number(savedProgress));

      const savedAccuracy = localStorage.getItem("lexivault_accuracy_history");
      if (savedAccuracy) {
        try { setAccuracyHistory(JSON.parse(savedAccuracy)); } catch(e) {}
      }
    }
  }, []);

  const setUserName = (name: string) => {
    setUserNameState(name);
    localStorage.setItem("lexivault_username", name);
  };

  const setDailyGoal = (g: number) => {
    setDailyGoalState(g);
    localStorage.setItem("lexivault_daily_goal", String(g));
  };

  const setWordFontSize = (size: "small" | "medium" | "large" | "xlarge") => {
    setWordFontSizeState(size);
    localStorage.setItem("lexivault_word_font_size", size);
  };

  // Sync settings when they change
  useEffect(() => {
    localStorage.setItem("lexivault_streak", String(streak));
  }, [streak]);

  useEffect(() => {
    localStorage.setItem("lexivault_daily_progress", String(dailyProgress));
  }, [dailyProgress]);

  useEffect(() => {
    localStorage.setItem("lexivault_accuracy_history", JSON.stringify(accuracyHistory));
  }, [accuracyHistory]);

  // Fetch counts from Firestore or local storage
  const refreshCounts = async () => {
    if (!isFirebaseConfigured || !db) {
      // Offline mode: count from localStorage
      const saved = localStorage.getItem("lexivault_words");
      if (saved) {
        try {
          const all: VocabItem[] = JSON.parse(saved);
          const newCounts = { all: all.length, word: 0, phrase: 0, idiom: 0, native_daily_phrase: 0 };
          all.forEach(item => {
            if (item.type in newCounts) {
              newCounts[item.type as keyof typeof newCounts]++;
            }
          });
          setCounts(newCounts);
        } catch (e) {}
      }
      return;
    }

    try {
      const types = ["word", "phrase", "idiom", "native_daily_phrase"] as const;
      const newCounts = { all: 0, word: 0, phrase: 0, idiom: 0, native_daily_phrase: 0 };
      
      await Promise.all(
        types.map(async (t) => {
          const coll = collection(db!, "vocabulary", t, "items");
          const snap = await getCountFromServer(coll);
          const count = snap.data().count;
          newCounts[t] = count;
        })
      );
      
      newCounts.all = newCounts.word + newCounts.phrase + newCounts.idiom + newCounts.native_daily_phrase;
      setCounts(newCounts);
    } catch (err) {
      console.error("Failed to fetch counts from firestore:", err);
    }
  };

  // Fetch review words (due today)
  const refreshReviewWords = async () => {
    if (!isFirebaseConfigured || !db) {
      // Offline mode
      const saved = localStorage.getItem("lexivault_words");
      if (saved) {
        try {
          const all: VocabItem[] = JSON.parse(saved);
          const review = all.filter(w => w.nextReview === "Today");
          setReviewWords(review);
          setWords(all);
        } catch (e) {}
      }
      setLoading(false);
      return;
    }

    try {
      const types = ["word", "phrase", "idiom", "native_daily_phrase"] as const;
      const reviewList: VocabItem[] = [];

      await Promise.all(
        types.map(async (type) => {
          const q = query(
            collection(db!, "vocabulary", type, "items"),
            where("nextReview", "==", "Today")
          );
          const snap = await getDocs(q);
          snap.forEach((d) => {
            reviewList.push({ id: d.id, ...d.data(), type } as VocabItem);
          });
        })
      );

      // Sort review list
      reviewList.sort((a, b) => a.word.localeCompare(b.word));
      setReviewWords(reviewList);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch review words:", err);
      setDbError("Permissions/Database error");
      setLoading(false);
    }
  };

  // Run counts + review in parallel to avoid waterfall
  const refreshAll = async () => {
    await Promise.all([refreshCounts(), refreshReviewWords()]);
  };

  // Initial Sync
  useEffect(() => {
    refreshAll();
  }, []);

  // Actions
  const createWord = async (
    formWord: string,
    formType: VocabItem["type"],
    formMeaning: string,
    formVietnamese: string,
    formExample: string,
    formDifficulty: VocabItem["difficulty"],
    formWordTypes: string[],
    formPronunciationUS: string,
    formPronunciationUK: string,
    formCommonPhrases?: string
  ) => {
    const newId = Math.random().toString(36).substring(2, 9);
    const newItem: VocabItem = {
      id: newId,
      word: formWord.trim(),
      type: formType,
      meaning: formMeaning.trim(),
      vietnamese: formVietnamese.trim(),
      example: formExample.trim(),
      difficulty: formDifficulty,
      nextReview: "Today",
      bookmarked: false,
      streak: 0,
      createdAt: new Date().toISOString()
    };

    if (formCommonPhrases && formCommonPhrases.trim()) {
      newItem.commonPhrases = formCommonPhrases.trim();
    }

    if (formType !== "native_daily_phrase" && formWordTypes.length > 0) {
      newItem.wordTypes = formWordTypes;
    }
    if (formType !== "native_daily_phrase") {
      if (formPronunciationUS.trim()) newItem.pronunciationUS = formPronunciationUS.trim();
      if (formPronunciationUK.trim()) newItem.pronunciationUK = formPronunciationUK.trim();
    }

    if (!db) {
      // Offline fallback
      const saved = localStorage.getItem("lexivault_words");
      const currentList: VocabItem[] = saved ? JSON.parse(saved) : [];
      const updated = [...currentList, newItem];
      localStorage.setItem("lexivault_words", JSON.stringify(updated));
      setWords(updated);
      showToast(`"${formWord}" added successfully (local)!`);
      refreshAll();
      triggerUpdate();
      return;
    }

    try {
      await setDoc(doc(db!, "vocabulary", formType, "items", newId), newItem);
      showToast(`"${formWord}" added successfully!`);
      refreshAll();
      triggerUpdate();
    } catch (err) {
      console.error("Firestore create error:", err);
      showToast("Failed to write to database.");
    }
  };

  const checkDuplicate = async (word: string): Promise<VocabItem | null> => {
    const normalized = word.trim().toLowerCase();
    if (!normalized) return null;

    if (!db) {
      const saved = localStorage.getItem("lexivault_words");
      if (!saved) return null;
      try {
        const all: VocabItem[] = JSON.parse(saved);
        return all.find(w => w.word.trim().toLowerCase() === normalized) || null;
      } catch { return null; }
    }

    try {
      const types = ["word", "phrase", "idiom", "native_daily_phrase"] as const;
      for (const t of types) {
        const snap = await getDocs(collection(db!, "vocabulary", t, "items"));
        for (const d of snap.docs) {
          const data = d.data();
          if (((data.word as string) || "").trim().toLowerCase() === normalized) {
            return { ...data, id: d.id, type: t } as VocabItem;
          }
        }
      }
    } catch (err) {
      console.error("checkDuplicate error:", err);
    }
    return null;
  };

  const updateWord = async (
    item: VocabItem,
    formWord: string,
    formType: VocabItem["type"],
    formMeaning: string,
    formVietnamese: string,
    formExample: string,
    formDifficulty: VocabItem["difficulty"],
    formWordTypes: string[],
    formPronunciationUS: string,
    formPronunciationUK: string,
    formCommonPhrases?: string
  ) => {
    const updatedItem: VocabItem = {
      ...item,
      word: formWord.trim(),
      type: formType,
      meaning: formMeaning.trim(),
      vietnamese: formVietnamese.trim(),
      example: formExample.trim(),
      difficulty: formDifficulty,
    };

    if (formCommonPhrases && formCommonPhrases.trim()) {
      updatedItem.commonPhrases = formCommonPhrases.trim();
    } else {
      delete updatedItem.commonPhrases;
    }

    if (formType !== "native_daily_phrase" && formWordTypes.length > 0) {
      updatedItem.wordTypes = formWordTypes;
    } else {
      updatedItem.wordTypes = [];
    }

    if (formType !== "native_daily_phrase") {
      if (formPronunciationUS.trim()) updatedItem.pronunciationUS = formPronunciationUS.trim();
      else delete updatedItem.pronunciationUS;
      
      if (formPronunciationUK.trim()) updatedItem.pronunciationUK = formPronunciationUK.trim();
      else delete updatedItem.pronunciationUK;
    } else {
      delete updatedItem.pronunciationUS;
      delete updatedItem.pronunciationUK;
    }

    // Clean legacy values
    delete updatedItem.wordType;
    delete updatedItem.pronunciation;

    if (!db) {
      const saved = localStorage.getItem("lexivault_words");
      const currentList: VocabItem[] = saved ? JSON.parse(saved) : [];
      const updated = currentList.map(w => w.id === item.id ? updatedItem : w);
      localStorage.setItem("lexivault_words", JSON.stringify(updated));
      setWords(updated);
      showToast(`"${formWord}" updated successfully (local)!`);
      refreshAll();
      triggerUpdate();
      return;
    }

    try {
      if (item.type !== formType) {
        // Delete from old path if type changed
        await deleteDoc(doc(db!, "vocabulary", item.type, "items", item.id));
      }
      await setDoc(doc(db!, "vocabulary", formType, "items", item.id), updatedItem);
      showToast(`"${formWord}" updated successfully!`);
      refreshAll();
      triggerUpdate();
    } catch (err) {
      console.error("Firestore update error:", err);
      showToast("Failed to update database.");
    }
  };

  const deleteWord = async (item: VocabItem) => {
    if (!db) {
      const saved = localStorage.getItem("lexivault_words");
      const currentList: VocabItem[] = saved ? JSON.parse(saved) : [];
      const updated = currentList.filter(w => w.id !== item.id);
      localStorage.setItem("lexivault_words", JSON.stringify(updated));
      setWords(updated);
      showToast(`"${item.word}" deleted successfully (local)!`);
      refreshAll();
      triggerUpdate();
      return;
    }

    try {
      await deleteDoc(doc(db!, "vocabulary", item.type, "items", item.id));
      showToast(`"${item.word}" deleted successfully!`);
      refreshAll();
      triggerUpdate();
    } catch (err) {
      console.error("Firestore delete error:", err);
      showToast("Failed to delete card.");
    }
  };

  const toggleBookmark = async (item: VocabItem) => {
    const updatedItem = { ...item, bookmarked: !item.bookmarked };

    if (!db) {
      const saved = localStorage.getItem("lexivault_words");
      const currentList: VocabItem[] = saved ? JSON.parse(saved) : [];
      const updated = currentList.map(w => w.id === item.id ? updatedItem : w);
      localStorage.setItem("lexivault_words", JSON.stringify(updated));
      setWords(updated);
      showToast(item.bookmarked ? "Removed bookmark" : "Bookmarked!");
      refreshReviewWords();
      triggerUpdate();
      return;
    }

    try {
      await setDoc(doc(db!, "vocabulary", item.type, "items", item.id), updatedItem);
      showToast(item.bookmarked ? "Removed bookmark" : "Bookmarked!");
      refreshReviewWords();
      triggerUpdate();
    } catch (err) {
      console.error("Firestore bookmark error:", err);
    }
  };

  const updatePracticeProgress = async (item: VocabItem, known: boolean) => {
    const newStreak = known ? item.streak + 1 : 0;
    let days = 1;
    if (newStreak === 1) days = 1;
    else if (newStreak === 2) days = 3;
    else if (newStreak === 3) days = 7;
    else if (newStreak > 3) days = 14;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + (known ? days : 0));
    const reviewLabel = known ? futureDate.toISOString().split("T")[0] : "Today";

    const updatedItem = {
      ...item,
      streak: newStreak,
      nextReview: reviewLabel,
    };

    if (!db) {
      const saved = localStorage.getItem("lexivault_words");
      const currentList: VocabItem[] = saved ? JSON.parse(saved) : [];
      const updated = currentList.map(w => w.id === item.id ? updatedItem : w);
      localStorage.setItem("lexivault_words", JSON.stringify(updated));
      setWords(updated);
    } else {
      try {
        await setDoc(doc(db!, "vocabulary", item.type, "items", item.id), updatedItem);
      } catch (err) {
        console.error("Firestore practice action error:", err);
        return;
      }
    }

    // Update global metrics
    if (known) {
      setDailyProgress((prev) => Math.min(prev + 1, dailyGoal));
      setAccuracyHistory((prev) => ({
        correct: prev.correct + 1,
        total: prev.total + 1,
      }));
      if (dailyProgress + 1 === dailyGoal) {
        setStreak((prev) => prev + 1);
      }
    } else {
      setAccuracyHistory((prev) => ({
        ...prev,
        total: prev.total + 1,
      }));
    }

    refreshReviewWords();
    triggerUpdate();
  };

  return (
    <VocabContext.Provider
      value={{
        words,
        loading,
        dbError,
        userName,
        setUserName,
        streak,
        setStreak,
        dailyProgress,
        setDailyProgress,
        dailyGoal,
        setDailyGoal,
        accuracyHistory,
        setAccuracyHistory,
        wordFontSize,
        setWordFontSize,
        toast,
        showToast,
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
        toggleBookmark,
        updatePracticeProgress,
        checkDuplicate,
        counts,
        refreshCounts,
        reviewWords,
        refreshReviewWords,
        lastUpdated,
        triggerUpdate
      }}
    >
      {children}
    </VocabContext.Provider>
  );
}

export function useVocab() {
  const context = useContext(VocabContext);
  if (context === undefined) {
    throw new Error("useVocab must be used within a VocabProvider");
  }
  return context;
}
