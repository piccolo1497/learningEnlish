"use client";

import React, { useState, useMemo, useEffect } from "react";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import {
  LayoutDashboard,
  Library,
  Flame,
  Award,
  Sparkles,
  Settings,
  Search,
  Plus,
  Star,
  Edit3,
  Trash2,
  RotateCcw,
  Check,
  X,
  ChevronRight,
  TrendingUp,
  Menu,
  Clock,
  BrainCircuit,
  Info,
  Calendar,
  Bookmark,
  Volume2,
  Sparkle,
  PenLine
} from "lucide-react";
import Link from "next/link";

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

interface VocabItem {
  id: string;
  word: string;
  type: "word" | "phrase" | "idiom" | "native_daily_phrase";
  wordType?: string;    // e.g. noun, adj, adv, verb...
  wordTypes?: string[]; // support multiple word types
  pronunciation?: string;   // legacy
  pronunciationUS?: string; // US pronunciation phonetic
  pronunciationUK?: string; // UK pronunciation phonetic
  meaning: string;      // English meaning
  vietnamese: string;   // Vietnamese meaning
  example: string;
  difficulty: "easy" | "medium" | "hard";
  nextReview: string;
  bookmarked: boolean;
  streak: number;
  createdAt?: string;
}

const INITIAL_WORDS: VocabItem[] = [];

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

export default function Home() {
  const [words, setWords] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Sync with Firebase Firestore
  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      // Offline fallback: load from localStorage
      const saved = localStorage.getItem("lexivault_words");
      if (saved) {
        try {
          setWords(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse local storage words:", e);
        }
      } else {
        // Load default starter words
        const defaultWords: VocabItem[] = [
          {
            id: "default-1",
            word: "ephemeral",
            type: "word",
            wordTypes: ["adj"],
            pronunciationUS: "/ɪˈfemərəl/",
            pronunciationUK: "/ɪˈfemərəl/",
            meaning: "lasting for a very short time",
            vietnamese: "phù du, chóng tàn",
            example: "Fame in the world of pop music is often ephemeral.",
            difficulty: "hard",
            nextReview: "Today",
            bookmarked: true,
            streak: 0,
            createdAt: new Date().toISOString()
          },
          {
            id: "default-2",
            word: "serendipity",
            type: "word",
            wordTypes: ["noun"],
            pronunciationUS: "/ˌserənˈdɪpədi/",
            pronunciationUK: "/ˌserənˈdɪpɪti/",
            meaning: "the occurrence of events by chance in a happy or beneficial way",
            vietnamese: "sự tình cờ may mắn",
            example: "We found the charming little restaurant by pure serendipity.",
            difficulty: "medium",
            nextReview: "Today",
            bookmarked: false,
            streak: 0,
            createdAt: new Date().toISOString()
          },
          {
            id: "default-3",
            word: "break a leg",
            type: "idiom",
            meaning: "good luck",
            vietnamese: "chúc may mắn",
            example: "Go out there and break a leg tonight!",
            difficulty: "easy",
            nextReview: "Today",
            bookmarked: false,
            streak: 0,
            createdAt: new Date().toISOString()
          }
        ];
        setWords(defaultWords);
        localStorage.setItem("lexivault_words", JSON.stringify(defaultWords));
      }
      setLoading(false);
      setDbError(null);
      return;
    }

    const types: VocabItem["type"][] = ["word", "phrase", "idiom", "native_daily_phrase"];
    const loadedTypes = new Set<string>();
    const typeWords: Record<string, VocabItem[]> = {};

    const unsubscribes = types.map((type) => {
      return onSnapshot(
        collection(db!, "vocabulary", type, "items"),
        (snapshot) => {
          const items: VocabItem[] = [];
          snapshot.forEach((d) => {
            items.push({ id: d.id, ...d.data() } as VocabItem);
          });
          typeWords[type] = items;
          loadedTypes.add(type);

          // Once we have heard from all collections at least once, combine them
          if (loadedTypes.size === types.length) {
            const allWords = Object.values(typeWords).flat();
            // Sort to ensure consistent order (e.g. alphabetical or by ID)
            allWords.sort((a, b) => {
              const idA = parseInt(a.id);
              const idB = parseInt(b.id);
              if (!isNaN(idA) && !isNaN(idB)) {
                return idA - idB;
              }
              return a.word.localeCompare(b.word);
            });
            setWords(allWords);
            setLoading(false);
            setDbError(null);
          }
        },
        (error) => {
          console.error(`Firestore loading error for type ${type}:`, error);
          setDbError("Missing or insufficient permissions / configuration");
          setLoading(false);
        }
      );
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, []);
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>("Cody");

  // Library Words filters
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<"all" | "word" | "phrase" | "idiom" | "native_daily_phrase">("all");
  const [libraryStarredOnly, setLibraryStarredOnly] = useState<boolean>(false);

  // Font size settings
  const [wordFontSize, setWordFontSize] = useState<"small" | "medium" | "large" | "xlarge">("medium");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("lexivault_word_font_size");
    if (saved) {
      setWordFontSize(saved as "small" | "medium" | "large" | "xlarge");
    }
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("lexivault_word_font_size", wordFontSize);
    }
  }, [wordFontSize, isMounted]);

  const getWordFontSizeClass = (size: "small" | "medium" | "large" | "xlarge") => {
    switch (size) {
      case "small": return "text-[18px]";
      case "large": return "text-[30px]";
      case "xlarge": return "text-[36px]";
      case "medium":
      default:
        return "text-[24px]";
    }
  };

  // Modal forms
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedWord, setSelectedWord] = useState<VocabItem | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });
  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: "", visible: false }), 3000);
  };
  // Form states
  const [formWord, setFormWord] = useState("");
  const [formType, setFormType] = useState<"word" | "phrase" | "idiom" | "native_daily_phrase">("word");
  const [formWordTypes, setFormWordTypes] = useState<string[]>([]);
  const [formPronunciationUS, setFormPronunciationUS] = useState("");
  const [formPronunciationUK, setFormPronunciationUK] = useState("");
  const [spellingWarning, setSpellingWarning] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmData, setConfirmData] = useState<{ label: string; value: string }[]>([]);
  const [formMeaning, setFormMeaning] = useState("");
  const [formVietnamese, setFormVietnamese] = useState("");
  const [formExample, setFormExample] = useState("");
  const [formDifficulty, setFormDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // Auto-detect Word Type and Pronunciation using Free Dictionary API
  useEffect(() => {
    if (formType !== "word") return;
    const trimmed = formWord.trim();
    if (!trimmed || trimmed.includes(" ") || trimmed.length < 2) {
      return;
    }

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
          // Detect Word Types
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
            if (detectedTypes.size > 0) {
              setFormWordTypes(Array.from(detectedTypes));
            }
          }

          // Detect Phonetic Pronunciations (US and UK)
          let detectedUS = "";
          let detectedUK = "";
          if (data[0].phonetics && data[0].phonetics.length > 0) {
            // Find US by audio filename matching -us or _us
            const usPhonetic = data[0].phonetics.find((p: any) => p.audio && (p.audio.includes("-us") || p.audio.includes("_us")));
            if (usPhonetic && usPhonetic.text) {
              detectedUS = usPhonetic.text;
            }
            // Find UK by audio filename matching -uk or _uk
            const ukPhonetic = data[0].phonetics.find((p: any) => p.audio && (p.audio.includes("-uk") || p.audio.includes("_uk")));
            if (ukPhonetic && ukPhonetic.text) {
              detectedUK = ukPhonetic.text;
            }

            // Fallback selection within phonetics
            if (!detectedUS) {
              const firstWithText = data[0].phonetics.find((p: any) => p.text);
              if (firstWithText) detectedUS = firstWithText.text;
            }
            if (!detectedUK) {
              const remainingWithText = data[0].phonetics.filter((p: any) => p.text && p.text !== detectedUS);
              if (remainingWithText.length > 0) {
                detectedUK = remainingWithText[0].text;
              }
            }
          }

          // Global fallbacks if US/UK are still empty (e.g. phonetics exists but only contains audio urls)
          if (!detectedUS && data[0].phonetic) {
            detectedUS = data[0].phonetic;
          }
          if (!detectedUK && data[0].phonetic) {
            detectedUK = data[0].phonetic;
          }
          if (!detectedUS && detectedUK) {
            detectedUS = detectedUK;
          }
          if (!detectedUK && detectedUS) {
            detectedUK = detectedUS;
          }

          setFormPronunciationUS(detectedUS);
          setFormPronunciationUK(detectedUK);
        }
      } catch (e) {
        console.warn("Auto-detect failed:", e);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [formWord, formType]);

  // Practice session states
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [showPracticeMeaning, setShowPracticeMeaning] = useState(false);

  // Stats
  const [dailyProgress, setDailyProgress] = useState(7);
  const [dailyGoal, setDailyGoal] = useState(15);
  const [streak, setStreak] = useState(5);
  const [accuracyHistory, setAccuracyHistory] = useState({ correct: 24, total: 28 });

  // Filter words by search query globally
  const filteredWords = useMemo(() => {
    return words.filter((w) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        w.word.toLowerCase().includes(query) ||
        w.meaning.toLowerCase().includes(query) ||
        w.vietnamese.toLowerCase().includes(query) ||
        w.example.toLowerCase().includes(query)
      );
    });
  }, [words, searchQuery]);

  // Words that need review today
  const reviewWords = useMemo(() => {
    return words.filter((w) => w.nextReview === "Today");
  }, [words]);

  // Sort words by creation date (newest first) for snippet
  const newestWords = useMemo(() => {
    return [...words].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (dateA === dateB) {
        return b.id.localeCompare(a.id);
      }
      return dateB - dateA;
    });
  }, [words]);

  // Precomputed stats for category mix and difficulty levels
  const stats = useMemo(() => {
    let wordCount = 0;
    let phraseCount = 0;
    let idiomCount = 0;
    let nativeCount = 0;
    let easyCount = 0;
    let mediumCount = 0;
    let hardCount = 0;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.type === "word") wordCount++;
      else if (w.type === "phrase") phraseCount++;
      else if (w.type === "idiom") idiomCount++;
      else if (w.type === "native_daily_phrase") nativeCount++;

      if (w.difficulty === "easy") easyCount++;
      else if (w.difficulty === "medium") mediumCount++;
      else if (w.difficulty === "hard") hardCount++;
    }

    return {
      word: wordCount,
      phrase: phraseCount,
      idiom: idiomCount,
      native: nativeCount,
      easy: easyCount,
      medium: mediumCount,
      hard: hardCount,
    };
  }, [words]);

  // Memoized Library Words (filtered and sorted)
  const sortedLibrary = useMemo(() => {
    const filtered = filteredWords.filter((w) => {
      if (libraryTypeFilter !== "all" && w.type !== libraryTypeFilter) return false;
      if (libraryStarredOnly && !w.bookmarked) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (a.bookmarked && !b.bookmarked) return -1;
      if (!a.bookmarked && b.bookmarked) return 1;
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [filteredWords, libraryTypeFilter, libraryStarredOnly]);

  // Toggle bookmark / saved status in Firestore
  const handleToggleBookmark = async (id: string) => {
    const item = words.find((w) => w.id === id);
    if (!item) return;

    if (!db) {
      const updatedWords = words.map((w) =>
        w.id === id ? { ...w, bookmarked: !w.bookmarked } : w
      );
      setWords(updatedWords);
      localStorage.setItem("lexivault_words", JSON.stringify(updatedWords));
      showToast(item.bookmarked ? "Removed bookmark" : "Bookmarked!");
      return;
    }

    try {
      await setDoc(doc(db!, "vocabulary", item.type, "items", id), {
        ...item,
        bookmarked: !item.bookmarked
      });
    } catch (err) {
      console.error("Error updating bookmark in Firebase:", err);
    }
  };

  // Delete a word in Firestore
  const handleDeleteWord = async (item: VocabItem) => {
    if (typeof window !== "undefined" && window.confirm("Are you sure you want to delete this vocabulary item?")) {
      if (!db) {
        const updatedWords = words.filter((w) => w.id !== item.id);
        setWords(updatedWords);
        localStorage.setItem("lexivault_words", JSON.stringify(updatedWords));
        showToast(`"${item.word}" deleted successfully!`);
        return;
      }

      try {
        await deleteDoc(doc(db!, "vocabulary", item.type, "items", item.id));
      } catch (err) {
        console.error("Error deleting word from Firebase:", err);
      }
    }
  };

  // Open add modal
  const openAddModal = () => {
    setFormWord("");
    setFormType("word");
    setFormWordTypes([]);
    setFormPronunciationUS("");
    setFormPronunciationUK("");
    setSpellingWarning(false);
    setFormMeaning("");
    setFormVietnamese("");
    setFormExample("");
    setFormDifficulty("medium");
    setIsAddModalOpen(true);
  };

  // Actual database creation executor
  const executeCreateWord = async () => {
    const newId = Math.random().toString(36).substring(2, 9);
    const newItem: VocabItem = {
      id: newId,
      word: formWord,
      type: formType,
      meaning: formMeaning,
      vietnamese: formVietnamese,
      example: formExample,
      difficulty: formDifficulty,
      nextReview: "Today",
      bookmarked: false,
      streak: 0,
      createdAt: new Date().toISOString()
    };

    if (formType !== "native_daily_phrase" && formWordTypes.length > 0) {
      newItem.wordTypes = formWordTypes;
    }
    if (formType !== "native_daily_phrase") {
      if (formPronunciationUS.trim()) newItem.pronunciationUS = formPronunciationUS.trim();
      if (formPronunciationUK.trim()) newItem.pronunciationUK = formPronunciationUK.trim();
    }

    if (!db) {
      const updatedWords = [...words, newItem];
      setWords(updatedWords);
      localStorage.setItem("lexivault_words", JSON.stringify(updatedWords));
      setIsAddModalOpen(false);
      setCurrentTab("dashboard");
      setAccuracyHistory(prev => ({ ...prev, total: prev.total + 1 }));
      showToast(`"${formWord}" added successfully!`);
      return;
    }

    try {
      await setDoc(doc(db!, "vocabulary", formType, "items", newId), newItem);
      setIsAddModalOpen(false);
      setCurrentTab("dashboard");
      setAccuracyHistory(prev => ({ ...prev, total: prev.total + 1 }));
      showToast(`"${formWord}" added successfully!`);
    } catch (err) {
      console.error("Error adding word to Firebase:", err);
    }
  };

  // Handle create new word trigger
  // — if spelling warning: show confirmation modal
  // — if word is valid: submit directly, show toast, go to dashboard
  const handleCreateWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWord.trim() || !formMeaning.trim() || !formVietnamese.trim()) {
      alert("Word, English meaning, and Vietnamese translation are required!");
      return;
    }

    if (spellingWarning) {
      // Word might be misspelled — ask user to confirm
      const summary = [
        { label: "Word / Phrase", value: formWord },
        { label: "Type", value: getTypeLabel(formType) },
        { label: "Word Types", value: formType !== "native_daily_phrase" && formWordTypes.length > 0 ? formWordTypes.join(", ").toUpperCase() : "N/A" },
        { label: "US Pronunciation", value: formType !== "native_daily_phrase" ? (formPronunciationUS || "None") : "N/A" },
        { label: "UK Pronunciation", value: formType !== "native_daily_phrase" ? (formPronunciationUK || "None") : "N/A" },
        { label: "English Meaning", value: formMeaning },
        { label: "Vietnamese Translation", value: formVietnamese },
        { label: "Example Sentence", value: formExample || "None" },
        { label: "Difficulty", value: formDifficulty.toUpperCase() }
      ];
      setConfirmData(summary);
      setConfirmAction(() => executeCreateWord);
      setIsConfirmModalOpen(true);
    } else {
      // Word is valid — submit immediately
      await executeCreateWord();
    }
  };

  // Open edit modal
  const openEditModal = (item: VocabItem) => {
    setSelectedWord(item);
    setFormWord(item.word);
    setFormType(item.type);
    setFormWordTypes(item.wordTypes || (item.wordType ? [item.wordType] : []));
    setFormPronunciationUS(item.pronunciationUS || item.pronunciation || "");
    setFormPronunciationUK(item.pronunciationUK || item.pronunciation || "");
    setSpellingWarning(false);
    setFormMeaning(item.meaning);
    setFormVietnamese(item.vietnamese);
    setFormExample(item.example);
    setFormDifficulty(item.difficulty);
    setIsEditModalOpen(true);
  };

  // Actual database update executor
  const executeUpdateWord = async () => {
    if (!selectedWord) return;

    const updatedItem: VocabItem = {
      ...selectedWord,
      word: formWord,
      type: formType,
      meaning: formMeaning,
      vietnamese: formVietnamese,
      example: formExample,
      difficulty: formDifficulty,
    };

    if (formType !== "native_daily_phrase" && formWordTypes.length > 0) {
      updatedItem.wordTypes = formWordTypes;
    } else {
      updatedItem.wordTypes = [];
    }
    delete updatedItem.wordType;

    if (formType !== "native_daily_phrase") {
      if (formPronunciationUS.trim()) {
        updatedItem.pronunciationUS = formPronunciationUS.trim();
      } else {
        delete updatedItem.pronunciationUS;
      }
      if (formPronunciationUK.trim()) {
        updatedItem.pronunciationUK = formPronunciationUK.trim();
      } else {
        delete updatedItem.pronunciationUK;
      }
    } else {
      delete updatedItem.pronunciationUS;
      delete updatedItem.pronunciationUK;
    }
    delete updatedItem.pronunciation;

    if (!db) {
      const updatedWords = words.map((w) => w.id === selectedWord.id ? updatedItem : w);
      setWords(updatedWords);
      localStorage.setItem("lexivault_words", JSON.stringify(updatedWords));
      setIsEditModalOpen(false);
      setSelectedWord(null);
      setCurrentTab("dashboard");
      showToast(`"${formWord}" updated successfully!`);
      return;
    }

    try {
      if (selectedWord.type !== formType) {
        // Type changed, delete from old subcollection
        await deleteDoc(doc(db!, "vocabulary", selectedWord.type, "items", selectedWord.id));
      }

      await setDoc(doc(db!, "vocabulary", formType, "items", selectedWord.id), updatedItem);
      setIsEditModalOpen(false);
      setSelectedWord(null);
      setCurrentTab("dashboard");
      showToast(`"${formWord}" updated successfully!`);
    } catch (err) {
      console.error("Error updating word in Firebase:", err);
    }
  };

  // Handle edit word — submit directly (no confirm modal needed)
  const handleUpdateWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWord) return;
    if (!formWord.trim() || !formMeaning.trim() || !formVietnamese.trim()) return;
    await executeUpdateWord();
  };



  // Practice Card Actions in Firestore
  const handlePracticeAction = async (known: boolean) => {
    if (reviewWords.length === 0) return;

    const currentPracticeItem = reviewWords[practiceIndex % reviewWords.length];
    const newStreak = known ? currentPracticeItem.streak + 1 : 0;
    let days = 1;
    if (newStreak === 1) days = 1;
    else if (newStreak === 2) days = 3;
    else if (newStreak === 3) days = 7;
    else if (newStreak > 3) days = 14;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + (known ? days : 0));
    const reviewLabel = known
      ? futureDate.toISOString().split("T")[0]
      : "Today";

    const updatedItem = {
      ...currentPracticeItem,
      streak: newStreak,
      nextReview: reviewLabel,
    };

    if (!db) {
      const updatedWords = words.map((w) => w.id === currentPracticeItem.id ? updatedItem : w);
      setWords(updatedWords);
      localStorage.setItem("lexivault_words", JSON.stringify(updatedWords));

      // Update metrics
      if (known) {
        setDailyProgress((prev) => Math.min(prev + 1, dailyGoal));
        setAccuracyHistory((prev) => ({
          correct: prev.correct + 1,
          total: prev.total + 1,
        }));
      } else {
        setAccuracyHistory((prev) => ({
          ...prev,
          total: prev.total + 1,
        }));
      }

      // Move next
      setShowPracticeMeaning(false);
      if (reviewWords.length > 1) {
        setPracticeIndex((prev) => (prev + 1) % reviewWords.length);
      } else {
        setPracticeIndex(0);
      }

      if (dailyProgress + 1 === dailyGoal) {
        setStreak((prev) => prev + 1);
      }
      return;
    }

    try {
      await setDoc(doc(db!, "vocabulary", currentPracticeItem.type, "items", currentPracticeItem.id), updatedItem);

      // Update metrics
      if (known) {
        setDailyProgress((prev) => Math.min(prev + 1, dailyGoal));
        setAccuracyHistory((prev) => ({
          correct: prev.correct + 1,
          total: prev.total + 1,
        }));
      } else {
        setAccuracyHistory((prev) => ({
          ...prev,
          total: prev.total + 1,
        }));
      }

      // Move next
      setShowPracticeMeaning(false);
      if (reviewWords.length > 1) {
        setPracticeIndex((prev) => (prev + 1) % reviewWords.length);
      } else {
        setPracticeIndex(0);
      }

      if (dailyProgress + 1 === dailyGoal) {
        setStreak((prev) => prev + 1);
      }
    } catch (err) {
      console.error("Error updating practice action in Firebase:", err);
    }
  };

  // Sidebar Menu Items - Cleaned & Fitter
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "library", label: "Library Words", icon: Library },
    { id: "practice", label: "Practice", icon: BrainCircuit },
    { id: "fillblank", label: "Fill in the Blank", icon: PenLine, href: "/fillblank" },
    { id: "review", label: "Review Queue", icon: Clock },
    { id: "statistics", label: "Statistics", icon: Award },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  // Badges helper
  const getTypeBadge = (type: "word" | "phrase" | "idiom" | "native_daily_phrase") => {
    switch (type) {
      case "word":
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
      case "phrase":
        return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
      case "idiom":
        return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
      case "native_daily_phrase":
        return "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/25";
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
        return "Native Daily Phrase";
      default:
        return type;
    }
  };

  const getDifficultyBadge = (difficulty: "easy" | "medium" | "hard") => {
    switch (difficulty) {
      case "easy":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "medium":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "hard":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
    }
  };

  return (
    <div className="flex min-h-screen bg-[#080d16] text-slate-100 antialiased selection:bg-cyan-500/30">

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

      {/* 1. LEFT SIDEBAR - Cleaner & Fitter */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-slate-900 bg-[#0a0f1d]/90 backdrop-blur-xl shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-900">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-md">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-cyan-400 bg-clip-text text-transparent">
              LexiVault
            </span>
            <span className="text-[11px] font-semibold tracking-wider text-cyan-550 uppercase -mt-1">
              Word Space
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const sharedClasses = `flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${isActive
              ? "bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`;

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={sharedClasses}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentTab(item.id);
                  setSearchQuery("");
                }}
                className={sharedClasses}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                {item.label}
                {item.id === "review" && reviewWords.length > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[12px] font-bold bg-cyan-500 text-[#080d16] rounded-full animate-pulse-slow">
                    {reviewWords.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Info Quick Badge */}
        <div className="p-3 border-t border-slate-900 bg-[#060a12]/30">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/40 border border-slate-900">
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

      {/* MOBILE DRAWER BACKDROP */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* MOBILE DRAWER */}
      <aside className={`fixed top-0 bottom-0 left-0 z-50 w-56 border-r border-slate-900 bg-[#0a0f1d] flex flex-col transform transition-transform duration-300 lg:hidden ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
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
            className="p-1 rounded-lg bg-slate-900 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const sharedClasses = `flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${isActive
              ? "bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`;

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={sharedClasses}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentTab(item.id);
                  setSearchQuery("");
                  setMobileMenuOpen(false);
                }}
                className={sharedClasses}
              >
                <Icon className="w-4 h-4" />
                {item.label}
                {item.id === "review" && reviewWords.length > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[12px] font-bold bg-cyan-500 text-[#080d16] rounded-full">
                    {reviewWords.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* 2. TOP BAR - Fitter Height */}
        <header className="flex items-center justify-between px-5 lg:px-6 h-16 border-b border-slate-900 bg-[#080d16]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-3.5 flex-1">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-900 text-slate-300 hover:text-white lg:hidden"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Search Bar - Global */}
            <div className="relative w-full max-w-sm hidden md:block">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search globally across library..."
                className="w-full pl-9 pr-8 py-1.5 bg-slate-950/70 hover:bg-slate-950/90 focus:bg-slate-950 border border-slate-900 focus:border-cyan-500/30 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-550 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Add New Word Button */}
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4.5 py-2.5 text-sm font-extrabold text-[#080d16] bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 rounded-xl shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4.5 h-4.5 text-[#080d16] stroke-[3.5]" />
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

        {/* SCROLLABLE MAIN - Tightened padding */}
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
            <div className="flex items-center gap-2.5 p-4 rounded-xl bg-[#1c1212] border border-rose-500/20 text-rose-400 text-xs font-semibold">
              <Info className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Database connection error: {dbError}. Running in Offline Fallback Mode. Please check your Firestore rules and network connectivity.
              </span>
            </div>
          )}

          {!isFirebaseConfigured && (
            <div className="flex items-start gap-3.5 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
              <Info className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="font-extrabold text-[13px]">LexiVault Database Connection Not Configured</p>
                <p className="text-slate-300 leading-relaxed">
                  The application is running in <strong>Offline Demo Mode</strong> using LocalStorage. Any vocabulary you add, edit, bookmark, or practice will be saved locally in your browser.
                </p>
                <p className="text-slate-400 leading-relaxed">
                  To connect your persistent LexiVault Cloud database on Vercel:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                  <li>Go to <strong>Project Settings &rarr; Environment Variables</strong> in your Vercel Dashboard.</li>
                  <li>Add the following variables with values from your Firebase Console:
                    <code className="block mt-1 p-2 bg-slate-950/75 border border-slate-900 rounded-lg text-[10px] text-cyan-400 font-mono space-y-0.5">
                      NEXT_PUBLIC_FIREBASE_API_KEY<br />
                      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN<br />
                      NEXT_PUBLIC_FIREBASE_PROJECT_ID<br />
                      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET<br />
                      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID<br />
                      NEXT_PUBLIC_FIREBASE_APP_ID<br />
                      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
                    </code>
                  </li>
                  <li>Redeploy your application.</li>
                </ol>
              </div>
            </div>
          )}

          {/* MOBILE SEARCH */}
          <div className="relative w-full md:hidden">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vocabulary..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950/60 border border-slate-900 rounded-xl text-xs text-slate-200 focus:outline-none"
            />
          </div>

          {/* ========================================================
              TAB: DASHBOARD
              ======================================================== */}
          {currentTab === "dashboard" && (
            <>
              {/* DASHBOARD HERO SECTION - Fitter & cleaner */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Hero card */}
                <div className="lg:col-span-2 relative overflow-hidden rounded-2xl glass-panel p-5 lg:p-6 flex flex-col justify-between min-h-[170px] border border-slate-900 bg-gradient-to-r from-[#0a1220]/90 to-[#0d1b32]/75">
                  <div className="absolute -right-10 -top-10 w-36 h-36 bg-cyan-500/5 rounded-full blur-2xl" />

                  <div className="relative z-10 space-y-1">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <Sparkle className="w-2.5 h-2.5 text-cyan-400 fill-cyan-400" />
                      Daily Smart Review
                    </div>
                    <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
                      Welcome back, {userName}
                    </h2>
                    <p className="text-slate-400 text-xs max-w-sm">
                      Your vocabulary queue is calibrated. Spend 5 minutes today to protect your long-term memory.
                    </p>
                  </div>

                  <div className="relative z-10 flex items-center justify-between mt-5 pt-3.5 border-t border-slate-900">
                    <div className="flex items-center gap-2.5">
                      <div className="text-2xl font-black text-cyan-400 glow-cyan">
                        {reviewWords.length}
                      </div>
                      <div className="text-[12px] text-slate-400 leading-tight">
                        words ready<br />to review today
                      </div>
                    </div>
                    <button
                      onClick={() => setCurrentTab("review")}
                      disabled={reviewWords.length === 0}
                      className="px-4 py-2 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    >
                      Start Practice
                    </button>
                  </div>
                </div>

                {/* Streak Card */}
                <div className="rounded-2xl glass-panel p-5 border border-slate-900 flex flex-col justify-between bg-[#0a0f1d]/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Streak Progress</span>
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                      <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
                    </div>
                  </div>

                  <div className="my-2.5">
                    <div className="text-3xl font-extrabold text-slate-100 flex items-baseline gap-1">
                      <span>{streak}</span>
                      <span className="text-xs font-semibold text-slate-450">days</span>
                    </div>
                  </div>

                  {/* Progress Bar & Mini Checks */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[11px] text-slate-400 font-bold uppercase">
                      <span>Goal: {dailyProgress}/{dailyGoal} words</span>
                      <span>{Math.round((dailyProgress / dailyGoal) * 100)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
                        style={{ width: `${(dailyProgress / dailyGoal) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between gap-1 mt-1">
                      {["M", "T", "W", "T", "F", "S", "S"].map((day, idx) => {
                        const isDone = idx < 5;
                        const isCurrent = idx === 5;
                        return (
                          <div key={idx} className="flex flex-col items-center gap-1 flex-1">
                            <div
                              className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${isDone
                                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                : isCurrent
                                  ? "bg-slate-900 text-slate-200 border border-cyan-400 border-dashed animate-pulse-slow"
                                  : "bg-slate-950 text-slate-600 border border-slate-900"
                                }`}
                            >
                              {isDone ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : day}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* VOCABULARY AND QUICK FLASHCARD ROW */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* SAVED VOCABULARY PREVIEW (Combined preview from Library) */}
                <div className="xl:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                        <Bookmark className="w-4 h-4 text-cyan-400" />
                        Vocabulary Snippet
                      </h3>
                      <p className="text-[12px] text-slate-550">Recent words featuring English & Vietnamese translations.</p>
                    </div>
                    <button
                      onClick={() => {
                        setCurrentTab("library");
                        setLibraryTypeFilter("all");
                      }}
                      className="text-[13px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 group transition-colors cursor-pointer"
                    >
                      Open Library
                      <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>

                  {/* Fitter grid padding, smaller card heights */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {newestWords.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="glass-panel glass-panel-hover rounded-xl p-4.5 border border-slate-900 flex flex-col justify-between min-h-[175px]"
                      >
                        <div>
                          {/* 1. Difficulty rating & Star bookmark button */}
                          <div className="flex items-center justify-between mb-2">
                            <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md ${getDifficultyBadge(item.difficulty)}`}>
                              {item.difficulty}
                            </span>
                            <button
                              onClick={() => handleToggleBookmark(item.id)}
                              className="text-slate-500 hover:text-amber-400 transition-colors p-0.5 rounded cursor-pointer"
                            >
                              <Star className={`w-3.5 h-3.5 ${item.bookmarked ? "fill-amber-400 text-amber-400" : ""}`} />
                            </button>
                          </div>

                          {/* 2. Word */}
                          <h4 className={`${getWordFontSizeClass(wordFontSize)} font-black tracking-tight text-slate-100 mb-1`}>{item.word}</h4>

                          {/* 3. Pronunciation */}
                          {item.type !== "native_daily_phrase" ? (
                            <div className="flex flex-wrap gap-1.5 mb-2.5">
                              {/* US Pronunciation */}
                              <div className="flex items-center gap-1 bg-slate-900/50 px-1.5 py-0.5 rounded-lg border border-slate-850">
                                <span className="text-[8px] font-black text-slate-500">US</span>
                                <span className="text-[10px] font-medium text-slate-400">
                                  {item.pronunciationUS || item.pronunciation || "N/A"}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPronunciation(item.word, "US");
                                  }}
                                  className="p-0.5 rounded text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                  title="Listen US"
                                >
                                  <Volume2 className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              {/* UK Pronunciation */}
                              <div className="flex items-center gap-1 bg-slate-900/50 px-1.5 py-0.5 rounded-lg border border-slate-850">
                                <span className="text-[8px] font-black text-slate-500">UK</span>
                                <span className="text-[10px] font-medium text-slate-400">
                                  {item.pronunciationUK || item.pronunciation || "N/A"}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPronunciation(item.word, "UK");
                                  }}
                                  className="p-0.5 rounded text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                  title="Listen UK"
                                >
                                  <Volume2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 mb-2.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playPronunciation(item.word, "US");
                                }}
                                className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-cyan-450 hover:border-cyan-500/30 bg-slate-900/30 hover:bg-slate-900 border border-slate-850 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                                title="Listen US"
                              >
                                <Volume2 className="w-2.5 h-2.5" /> US Accent
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playPronunciation(item.word, "UK");
                                }}
                                className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-cyan-455 hover:border-cyan-500/30 bg-slate-900/30 hover:bg-slate-900 border border-slate-850 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                                title="Listen UK"
                              >
                                <Volume2 className="w-2.5 h-2.5" /> UK Accent
                              </button>
                            </div>
                          )}

                          {/* 4. English meaning */}
                          <p className="text-slate-200 text-[15px] line-clamp-1 leading-normal mb-1">
                            {item.meaning}
                          </p>

                          {/* 5. Vietnamese meaning */}
                          <p className="text-emerald-400 text-[15px] font-bold line-clamp-1 flex items-center gap-1 mb-2.5">
                            <span className="text-[11px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/10">VN</span>
                            {item.vietnamese}
                          </p>

                          {/* 6. Type of words */}
                          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                            <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md ${getTypeBadge(item.type)}`}>
                              {getTypeLabel(item.type)}
                            </span>
                            {item.type !== "native_daily_phrase" && (item.wordTypes || (item.wordType ? [item.wordType] : [])).map((wt: string) => (
                              <span key={wt} className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                {wt}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Card bottom actions - compact */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-900/60 mt-auto">
                          <span className="text-[11px] text-slate-500">
                            Review: <span className={item.nextReview === "Today" ? "text-cyan-400 font-bold" : "text-slate-450"}>{item.nextReview}</span>
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openEditModal(item)}
                              className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-900 cursor-pointer"
                              title="Edit"
                            >
                              <Edit3 className="w-4.5 h-4.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteWord(item)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-900 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                            <button
                              onClick={() => {
                                setCurrentTab("practice");
                                const indexInReview = reviewWords.findIndex(w => w.id === item.id);
                                if (indexInReview !== -1) {
                                  setPracticeIndex(indexInReview);
                                }
                              }}
                              className="px-2 py-0.5 text-[12px] font-bold bg-slate-950 hover:bg-cyan-500/20 text-slate-350 hover:text-cyan-400 rounded-lg border border-slate-900 hover:border-cyan-500/20 transition-all cursor-pointer"
                            >
                              Test
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* QUICK FLASHCARD PREVIEW */}
                <div className="space-y-4 flex flex-col h-full">
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                      <BrainCircuit className="w-4 h-4 text-purple-400" />
                      Quick Recall
                    </h3>
                    <p className="text-[12px] text-slate-550">Practice flashcards directly from home.</p>
                  </div>

                  {reviewWords.length > 0 ? (
                    <div className="glass-panel rounded-2xl p-5 border border-slate-900 bg-[#0a101d]/60 flex flex-col justify-between flex-1 relative min-h-[370px]">
                      <div className="flex-1 flex flex-col justify-center items-center text-center py-4">
                        <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded-full mb-3 ${getTypeBadge(reviewWords[practiceIndex % reviewWords.length].type)}`}>
                          {getTypeLabel(reviewWords[practiceIndex % reviewWords.length].type)}
                        </span>

                        <h4 className="text-2xl font-black text-slate-100 tracking-tight max-w-[190px] break-words">
                          {reviewWords[practiceIndex % reviewWords.length].word}
                        </h4>

                        <div className="mt-3.5 w-full min-h-[75px] flex flex-col items-center justify-center">
                          {showPracticeMeaning ? (
                            <div className="space-y-1.5 animate-fade-in">
                              <p className="text-xs font-semibold text-slate-200 px-2 line-clamp-2">
                                {reviewWords[practiceIndex % reviewWords.length].meaning}
                              </p>
                              <p className="text-xs font-bold text-emerald-400 px-2 line-clamp-1">
                                {reviewWords[practiceIndex % reviewWords.length].vietnamese}
                              </p>
                              <p className="text-[12px] text-slate-400 italic px-3 line-clamp-1">
                                &ldquo;{reviewWords[practiceIndex % reviewWords.length].example}&rdquo;
                              </p>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowPracticeMeaning(true)}
                              className="px-3.5 py-1.5 text-[13px] font-bold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl transition-all cursor-pointer"
                            >
                              Show Meaning
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-900">
                        <button
                          onClick={() => handlePracticeAction(false)}
                          className="flex items-center justify-center gap-1 py-2 rounded-xl text-[13px] font-bold text-rose-450 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5 stroke-[2.5]" />
                          Forgot
                        </button>
                        <button
                          onClick={() => handlePracticeAction(true)}
                          className="flex items-center justify-center gap-1 py-2 rounded-xl text-[13px] font-bold text-emerald-450 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          Knew It
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-panel rounded-2xl p-6 border border-slate-900 text-center flex flex-col items-center justify-center flex-1 bg-[#0a0f1d]/30 min-h-[370px]">
                      <div className="w-11 h-11 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3 border border-emerald-500/25">
                        <Check className="w-5 h-5 stroke-[3]" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-100">Review queue empty</h4>
                      <p className="text-[13px] text-slate-500 mt-1 max-w-[170px] leading-relaxed">
                        All cards successfully practiced! You are set for today.
                      </p>
                      <button
                        onClick={openAddModal}
                        className="mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 transition-all cursor-pointer"
                      >
                        Add Vocabulary
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* STATS RECAP */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-cyan-400" /> Performance Recap
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="glass-panel rounded-xl p-4 border border-slate-900 bg-[#0a0f1d]/30">
                    <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Total Library Items</span>
                    <div className="text-xl font-extrabold text-slate-200 mt-1.5">{words.length}</div>
                  </div>
                  <div className="glass-panel rounded-xl p-4 border border-slate-900 bg-[#0a0f1d]/30">
                    <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Recall Accuracy</span>
                    <div className="text-xl font-extrabold text-slate-200 mt-1.5">
                      {Math.round((accuracyHistory.correct / accuracyHistory.total) * 100)}%
                    </div>
                  </div>
                  <div className="glass-panel rounded-xl p-4 border border-slate-900 bg-[#0a0f1d]/30">
                    <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Daily Goal</span>
                    <div className="text-xl font-extrabold text-slate-200 mt-1.5">{dailyProgress}/{dailyGoal} words</div>
                  </div>
                  <div className="glass-panel rounded-xl p-4 border border-slate-900 bg-[#0a0f1d]/30">
                    <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Practice Due</span>
                    <div className="text-xl font-extrabold text-cyan-400 mt-1.5">{reviewWords.length} items</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ========================================================
              TAB: LIBRARY WORDS (Combined Words, Phrases, and Idioms)
              ======================================================== */}
          {currentTab === "library" && (
            <div className="space-y-5">

              {/* Library Header Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/40 border border-slate-900">
                <div className="space-y-0.5">
                  <h2 className="text-xl font-bold text-slate-100">Library Words</h2>
                  <p className="text-[13px] text-slate-400">
                    Explore and query words, phrases, and idioms. Use filters to adjust catalog.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Category Pill Filters */}
                  <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto max-w-full">
                    {(["all", "word", "phrase", "idiom", "native_daily_phrase"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setLibraryTypeFilter(t)}
                        className={`px-3 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${libraryTypeFilter === t
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/15"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        {t === "all" ? "All" : getTypeLabel(t)}
                      </button>
                    ))}
                  </div>

                  {/* Starred Toggle */}
                  <button
                    onClick={() => setLibraryStarredOnly(!libraryStarredOnly)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${libraryStarredOnly
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${libraryStarredOnly ? "fill-amber-450" : ""}`} />
                    <span>Starred</span>
                  </button>
                </div>
              </div>

              {/* Library Grid filtered & sorted */}
              {(() => {
                if (sortedLibrary.length === 0) {
                  return (
                    <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[260px]">
                      <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 mb-3">
                        <Library className="w-5 h-5" />
                      </div>
                      <h4 className="text-slate-202 font-bold text-sm">No library elements match your criteria</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
                        Try editing filters, toggling off the starred checkbox, or generate a new card.
                      </p>
                      <button
                        onClick={openAddModal}
                        className="mt-5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white cursor-pointer"
                      >
                        Add New Element
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
                    {sortedLibrary.map((item) => (
                      <div
                        key={item.id}
                        className="glass-panel glass-panel-hover rounded-2xl p-6 border border-slate-900 flex flex-col justify-between min-h-[220px]"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md ${getTypeBadge(item.type)}`}>
                                {getTypeLabel(item.type)}
                              </span>
                              {item.type !== "native_daily_phrase" && (item.wordTypes || (item.wordType ? [item.wordType] : [])).map((wt: string) => (
                                <span key={wt} className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  {wt}
                                </span>
                              ))}
                              <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md ${getDifficultyBadge(item.difficulty)}`}>
                                {item.difficulty}
                              </span>
                            </div>
                            <button
                              onClick={() => handleToggleBookmark(item.id)}
                              className="text-slate-500 hover:text-amber-400 transition-colors p-0.5 rounded cursor-pointer"
                            >
                              <Star className={`w-3.5 h-3.5 ${item.bookmarked ? "fill-amber-400 text-amber-400" : ""}`} />
                            </button>
                          </div>

                          <div className="flex flex-col gap-1.5 mb-2">
                            <h4 className={`${getWordFontSizeClass(wordFontSize)} font-black tracking-tight text-slate-100`}>{item.word}</h4>
                            {item.type !== "native_daily_phrase" && (
                              <div className="flex flex-wrap gap-2">
                                {/* US Pronunciation */}
                                <div className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded-lg border border-slate-850">
                                  <span className="text-[9px] font-black text-slate-500">US</span>
                                  <span className="text-[11px] font-medium text-slate-400">
                                    {item.pronunciationUS || item.pronunciation || "N/A"}
                                  </span>
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
                                  <span className="text-[11px] font-medium text-slate-400">
                                    {item.pronunciationUK || item.pronunciation || "N/A"}
                                  </span>
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
                            )}
                          </div>
                          <p className="text-slate-202 text-[15px] leading-relaxed line-clamp-2">{item.meaning}</p>

                          {/* Vietnamese meaning display */}
                          <p className="text-emerald-400 text-[15px] font-bold mt-1.5 flex items-center gap-1">
                            <span className="text-[10px] px-0.8 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/10">VN</span>
                            {item.vietnamese}
                          </p>

                          {item.example && (
                            <p className="text-slate-300 text-[15px] italic leading-relaxed border-l-2 border-cyan-500/30 pl-3 mt-3.5 py-0.5">
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
                              onClick={() => openEditModal(item)}
                              className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-900 cursor-pointer"
                              title="Edit"
                            >
                              <Edit3 className="w-4.5 h-4.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteWord(item)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-900 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                            <button
                              onClick={() => {
                                setCurrentTab("practice");
                                const indexInReview = reviewWords.findIndex(w => w.id === item.id);
                                if (indexInReview !== -1) {
                                  setPracticeIndex(indexInReview);
                                }
                              }}
                              className="px-2 py-0.5 text-[12px] font-bold bg-slate-900 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-400 rounded-md border border-slate-800 transition-all cursor-pointer"
                            >
                              Test
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ========================================================
              TAB: PRACTICE (ACTIVE SESSION)
              ======================================================== */}
          {currentTab === "practice" && (
            <div className="max-w-xl mx-auto space-y-5">
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-1.5">
                  <BrainCircuit className="w-5.5 h-5.5 text-purple-400" />
                  Recall Flashcards
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Toggle the card to verify recall accuracy and English-Vietnamese translations.
                </p>
              </div>

              {reviewWords.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[13px] text-slate-400 font-semibold px-0.5">
                    <span>Card {practiceIndex + 1} of {reviewWords.length} due</span>
                    <span>Daily Progress: {dailyProgress}/{dailyGoal} words</span>
                  </div>

                  {/* Flashcard container - compact */}
                  <div
                    onClick={() => setShowPracticeMeaning(!showPracticeMeaning)}
                    className={`relative w-full min-h-[300px] rounded-2xl glass-panel border border-slate-900 flex flex-col justify-between p-6 text-center cursor-pointer transition-all duration-300 select-none ${showPracticeMeaning
                      ? "bg-gradient-to-b from-[#0e1625] to-[#070b13]"
                      : "hover:scale-[1.005] hover:border-cyan-500/20"
                      }`}
                  >
                    <div className="flex items-center justify-between w-full" onClick={(e) => e.stopPropagation()}>
                      <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded-md ${getTypeBadge(reviewWords[practiceIndex % reviewWords.length].type)}`}>
                        {getTypeLabel(reviewWords[practiceIndex % reviewWords.length].type)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded-md ${getDifficultyBadge(reviewWords[practiceIndex % reviewWords.length].difficulty)}`}>
                          {reviewWords[practiceIndex % reviewWords.length].difficulty}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const currentItem = reviewWords[practiceIndex % reviewWords.length];
                            handleDeleteWord(currentItem);
                          }}
                          className="p-1.5 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete Card"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center items-center py-4">
                      {!showPracticeMeaning ? (
                        <div className="space-y-3 flex flex-col items-center">
                          <h3 className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight glow-cyan max-w-[260px] break-words">
                            {reviewWords[practiceIndex % reviewWords.length].word}
                          </h3>
                          {reviewWords[practiceIndex % reviewWords.length].type !== "native_daily_phrase" && (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              {/* US */}
                              <div className="flex items-center gap-1 bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-800">
                                <span className="text-[9px] font-black text-slate-500">US</span>
                                <span className="text-[12px] font-medium text-slate-400">
                                  {reviewWords[practiceIndex % reviewWords.length].pronunciationUS || reviewWords[practiceIndex % reviewWords.length].pronunciation || "N/A"}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPronunciation(reviewWords[practiceIndex % reviewWords.length].word, "US");
                                  }}
                                  className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                  title="Listen US"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* UK */}
                              <div className="flex items-center gap-1 bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-800">
                                <span className="text-[9px] font-black text-slate-500">UK</span>
                                <span className="text-[12px] font-medium text-slate-400">
                                  {reviewWords[practiceIndex % reviewWords.length].pronunciationUK || reviewWords[practiceIndex % reviewWords.length].pronunciation || "N/A"}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPronunciation(reviewWords[practiceIndex % reviewWords.length].word, "UK");
                                  }}
                                  className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                  title="Listen UK"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                          <p className="text-[12px] text-cyan-400/70 animate-pulse-slow font-semibold pt-1">
                            Click to flip card
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4 max-w-sm animate-fade-in">
                          <div>
                            <span className="text-[11px] font-bold text-slate-500 uppercase block mb-0.5">English Meaning</span>
                            <p className="text-sm font-medium text-slate-205 leading-snug">
                              {reviewWords[practiceIndex % reviewWords.length].meaning}
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-500 uppercase block mb-0.5">Nghĩa Tiếng Việt</span>
                            <p className="text-base font-extrabold text-emerald-400">
                              {reviewWords[practiceIndex % reviewWords.length].vietnamese}
                            </p>
                          </div>
                          {reviewWords[practiceIndex % reviewWords.length].example && (
                            <div>
                              <span className="text-[11px] font-bold text-slate-500 uppercase block mb-0.5">Usage Example</span>
                              <p className="text-xs text-slate-400 italic leading-relaxed">
                                &ldquo;{reviewWords[practiceIndex % reviewWords.length].example}&rdquo;
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-550 font-bold uppercase tracking-wider border-t border-slate-900/60 pt-3">
                      {showPracticeMeaning ? "Flip to word front" : "Recall definition & click to check"}
                    </div>
                  </div>

                  {/* Recall Action Triggers */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handlePracticeAction(false)}
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4 stroke-[3]" />
                      Forgot / Incorrect
                    </button>
                    <button
                      onClick={() => handlePracticeAction(true)}
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      Correct / Recalled
                    </button>
                  </div>
                </div>
              ) : (
                <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-4 border border-emerald-500/25">
                    <Check className="w-6 h-6 stroke-[3]" />
                  </div>
                  <h4 className="text-base font-bold text-slate-100">Flashcards Queue Completed!</h4>
                  <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed">
                    Excellent retention results! All words due for review have been resolved.
                  </p>
                  <button
                    onClick={() => {
                      setWords(words.map(w => ({ ...w, nextReview: "Today" })));
                      setPracticeIndex(0);
                    }}
                    className="mt-5 px-4 py-2 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Queue for Demo
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              TAB: REVIEW QUEUE
              ======================================================== */}
          {currentTab === "review" && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-1.5">
                    <Clock className="w-5 h-5 text-cyan-400" />
                    Review Queue ({reviewWords.length} items due)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Spaced-repetition scheduled items waiting for your practice check today.
                  </p>
                </div>
                {reviewWords.length > 0 && (
                  <button
                    onClick={() => setCurrentTab("practice")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white cursor-pointer"
                  >
                    Launch Interactive Flashcards
                  </button>
                )}
              </div>

              {reviewWords.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reviewWords.map((item) => (
                    <div
                      key={item.id}
                      className="glass-panel glass-panel-hover rounded-xl p-4 border border-slate-900 flex flex-col justify-between min-h-[170px]"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md ${getTypeBadge(item.type)}`}>
                              {getTypeLabel(item.type)}
                            </span>
                            {item.type !== "native_daily_phrase" && (item.wordTypes || (item.wordType ? [item.wordType] : [])).map((wt: string) => (
                              <span key={wt} className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                {wt}
                              </span>
                            ))}
                            <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md ${getDifficultyBadge(item.difficulty)}`}>
                              {item.difficulty}
                            </span>
                          </div>
                          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        </div>

                        <div className="flex flex-col gap-1.5 mb-1">
                          <h4 className="text-base font-bold text-slate-100">{item.word}</h4>
                          {item.type !== "native_daily_phrase" && (
                            <div className="flex flex-wrap gap-1.5">
                              {/* US Pronunciation */}
                              <div className="flex items-center gap-1 bg-slate-900/50 px-1.5 py-0.5 rounded-lg border border-slate-850">
                                <span className="text-[8px] font-black text-slate-500">US</span>
                                <span className="text-[10px] font-medium text-slate-400">
                                  {item.pronunciationUS || item.pronunciation || "N/A"}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPronunciation(item.word, "US");
                                  }}
                                  className="p-0.5 rounded text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                  title="Listen US"
                                >
                                  <Volume2 className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              {/* UK Pronunciation */}
                              <div className="flex items-center gap-1 bg-slate-900/50 px-1.5 py-0.5 rounded-lg border border-slate-850">
                                <span className="text-[8px] font-black text-slate-500">UK</span>
                                <span className="text-[10px] font-medium text-slate-400">
                                  {item.pronunciationUK || item.pronunciation || "N/A"}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPronunciation(item.word, "UK");
                                  }}
                                  className="p-0.5 rounded text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                  title="Listen UK"
                                >
                                  <Volume2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <p className="text-slate-350 text-xs leading-relaxed">{item.meaning}</p>

                        {/* Vietnamese Translation */}
                        <p className="text-emerald-400 text-xs font-semibold mt-1 flex items-center gap-1">
                          <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/10">VN</span>
                          {item.vietnamese}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-900/60 mt-3">
                        <span className="text-[11px] text-cyan-400/80 font-semibold">
                          Recall level: {item.streak}
                        </span>

                        <button
                          onClick={() => {
                            setCurrentTab("practice");
                            const idx = reviewWords.findIndex(w => w.id === item.id);
                            if (idx !== -1) setPracticeIndex(idx);
                          }}
                          className="px-2.5 py-1 rounded-md text-[12px] font-bold bg-slate-950 hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-400 border border-slate-900 hover:border-cyan-500/20 transition-all cursor-pointer"
                        >
                          Practice Card
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="glass-panel rounded-2xl p-10 border border-slate-900 text-center flex flex-col items-center justify-center min-h-[260px]">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
                    <Check className="w-5 h-5 stroke-[3]" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-200">No Review Tasks</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-[260px] mx-auto leading-relaxed">
                    All clear! Review stack complete. Reset the queue to demo practice again.
                  </p>
                  <button
                    onClick={() => {
                      setWords(words.map(w => ({ ...w, nextReview: "Today" })));
                    }}
                    className="mt-5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all cursor-pointer"
                  >
                    Reset Review Queue
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              TAB: STATISTICS
              ======================================================== */}
          {currentTab === "statistics" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Performance Analytics</h2>
                <p className="text-xs text-slate-400 font-medium">
                  Detailed retention curve indicators and vocabulary distributions.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Recall circular indicator */}
                <div className="glass-panel rounded-xl p-5 border border-slate-900 bg-[#0a0f1d]/50 flex flex-col justify-between items-center text-center">
                  <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Active Recall Strength</span>

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
                        strokeDashoffset={2 * Math.PI * 46 * (1 - accuracyHistory.correct / accuracyHistory.total)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute">
                      <span className="text-2xl font-black text-slate-100">
                        {Math.round((accuracyHistory.correct / accuracyHistory.total) * 100)}%
                      </span>
                      <span className="block text-[10px] text-slate-500 uppercase font-bold">Accuracy</span>
                    </div>
                  </div>

                  <p className="text-[12px] text-slate-400">
                    Accuracy measured over the last {accuracyHistory.total} recall tests.
                  </p>
                </div>
                <div className="glass-panel rounded-xl p-5 border border-slate-900 bg-[#0a0f1d]/50 flex flex-col justify-between">
                  <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Category Mix</span>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] font-bold">
                        <span className="text-slate-355">Words</span>
                        <span className="text-slate-455">{stats.word} cards</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${words.length ? (stats.word / words.length * 100) : 0}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] font-bold">
                        <span className="text-slate-355">Phrases</span>
                        <span className="text-slate-455">{stats.phrase} cards</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500" style={{ width: `${words.length ? (stats.phrase / words.length * 100) : 0}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] font-bold">
                        <span className="text-slate-355">Idioms</span>
                        <span className="text-slate-455">{stats.idiom} cards</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500" style={{ width: `${words.length ? (stats.idiom / words.length * 100) : 0}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] font-bold">
                        <span className="text-slate-355">Native Phrases</span>
                        <span className="text-slate-455">{stats.native} cards</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500" style={{ width: `${words.length ? (stats.native / words.length * 100) : 0}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 text-[11px] text-slate-500 font-medium leading-relaxed">
                    Balanced study targets improve reading comprehension metrics.
                  </div>
                </div>

                {/* Difficulty Levels */}
                <div className="glass-panel rounded-xl p-5 border border-slate-900 bg-[#0a0f1d]/50 flex flex-col justify-between">
                  <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Difficulty Levels</span>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] font-bold">
                        <span className="text-slate-350">Easy</span>
                        <span className="text-slate-455">{stats.easy} cards</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${words.length ? (stats.easy / words.length * 100) : 0}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] font-bold">
                        <span className="text-slate-355">Medium</span>
                        <span className="text-slate-455">{stats.medium} cards</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${words.length ? (stats.medium / words.length * 100) : 0}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] font-bold">
                        <span className="text-slate-355">Hard</span>
                        <span className="text-slate-455">{stats.hard} cards</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500" style={{ width: `${words.length ? (stats.hard / words.length * 100) : 0}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 text-[11px] text-slate-500 font-medium">
                    Spacing scheduler prompts hard cards more frequently.
                  </div>
                </div>
              </div>

              {/* Weekly Learning Chart */}
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
          )}

          {/* ========================================================
              TAB: SETTINGS
              ======================================================== */}
          {currentTab === "settings" && (
            <div className="max-w-xl mx-auto space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Preferences Settings</h2>
                <p className="text-xs text-slate-400">
                  Configure targets and user profile configurations.
                </p>
              </div>

              <div className="glass-panel rounded-2xl border border-slate-900 p-5 space-y-5 bg-[#0a0f1d]/50">
                {/* Profile Edit */}
                <div className="space-y-1">
                  <label className="text-[12px] font-bold uppercase tracking-wider text-slate-550">Name</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-900 focus:border-cyan-500/40 rounded-xl text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                {/* Daily Goal Target */}
                <div className="space-y-2">
                  <label className="text-[12px] font-bold uppercase tracking-wider text-slate-555">Daily Target Goal</label>
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
                    <span className="w-16 text-center text-xs font-bold bg-slate-950 border border-slate-900 py-1 px-2 rounded-lg text-slate-205">
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
                        className={`py-2 rounded-xl text-xs font-bold capitalize transition-all border cursor-pointer ${wordFontSize === sz
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
                  <span className="text-[12px] font-bold uppercase tracking-wider text-slate-555 block">SRS Spacing Algorithm</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-slate-950/60 border border-slate-900 rounded-lg text-center">
                      <span className="text-[11px] text-slate-500 font-bold block">Easy</span>
                      <span className="text-xs font-extrabold text-slate-205 mt-0.5 block">x 4.0d</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/60 border border-slate-900 rounded-lg text-center">
                      <span className="text-[11px] text-slate-500 font-bold block">Medium</span>
                      <span className="text-xs font-extrabold text-slate-205 mt-0.5 block">x 2.5d</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/60 border border-slate-900 rounded-lg text-center">
                      <span className="text-[11px] text-slate-500 font-bold block">Hard</span>
                      <span className="text-xs font-extrabold text-slate-205 mt-0.5 block">x 1.2d</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================
          ADD NEW WORD MODAL (Enlarged)
          ======================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto glass-panel rounded-2xl border border-slate-800 p-5 sm:p-8 space-y-6 shadow-2xl bg-[#0a0f1d] animate-scale-up scrollbar-thin">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <h3 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400 stroke-[2.5]" /> Add Vocabulary Card
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-205 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWord} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Type Select */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["word", "phrase", "idiom", "native_daily_phrase"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormType(t)}
                        className={`py-2.5 rounded-xl text-xs font-bold uppercase border transition-all cursor-pointer active:scale-98 ${formType === t
                          ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/40"
                          : "bg-slate-900/60 border-slate-900/60 text-slate-450 hover:text-slate-200"
                          }`}
                      >
                        {getTypeLabel(t)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Word Input */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary Word / Phrase</label>
                  <input
                    type="text"
                    required
                    value={formWord}
                    onChange={(e) => setFormWord(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all placeholder-slate-605"
                  />
                </div>

                {/* Spelling Warning block */}
                {spellingWarning && (
                  <div className="md:col-span-2 px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[13px] font-medium rounded-xl flex items-center gap-2 animate-fade-in">
                    <Info className="w-4.5 h-4.5 shrink-0 text-amber-400" />
                    <span>Warning: &quot;{formWord}&quot; might have a spelling mistake (not found in dictionary). You can still save it.</span>
                  </div>
                )}

                {/* US & UK Pronunciation Inputs */}
                {formType !== "native_daily_phrase" ? (
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
                ) : (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Test Pronunciation</label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={!formWord.trim()}
                        onClick={() => playPronunciation(formWord, "US")}
                        className="flex-1 py-3 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs font-bold uppercase"
                      >
                        <Volume2 className="w-4 h-4" /> Listen (US Accent)
                      </button>
                      <button
                        type="button"
                        disabled={!formWord.trim()}
                        onClick={() => playPronunciation(formWord, "UK")}
                        className="flex-1 py-3 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs font-bold uppercase"
                      >
                        <Volume2 className="w-4 h-4" /> Listen (UK Accent)
                      </button>
                    </div>
                  </div>
                )}

                {/* Word Type selector (noun, adj, adv...) */}
                {formType !== "native_daily_phrase" && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Word Type (e.g. noun, adj, adv...)</label>
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
                            className={`py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${(wt.value === "" && formWordTypes.length === 0) || isSelected
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                              : "bg-slate-900/60 border-slate-900/60 text-slate-450 hover:text-slate-205"
                              }`}
                          >
                            {wt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* English Meaning Input */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">English Meaning</label>
                  <textarea
                    rows={3}
                    required
                    value={formMeaning}
                    onChange={(e) => setFormMeaning(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all placeholder-slate-605 resize-none"
                  />
                </div>

                {/* Vietnamese Meaning Input */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-emerald-400 block mb-1">Vietnamese Translation</label>
                  <textarea
                    rows={3}
                    required
                    value={formVietnamese}
                    onChange={(e) => setFormVietnamese(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-950/30 focus:border-emerald-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all placeholder-slate-605 resize-none"
                  />
                </div>

                {/* Example Input */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Example Sentence</label>
                  <textarea
                    rows={2}
                    value={formExample}
                    onChange={(e) => setFormExample(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none resize-none transition-all placeholder-slate-605"
                  />
                </div>

                {/* Difficulty Rating */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Difficulty Rating</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(["easy", "medium", "hard"] as const).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setFormDifficulty(diff)}
                        className={`py-2.5 rounded-xl text-xs font-bold uppercase border transition-all cursor-pointer active:scale-98 ${formDifficulty === diff
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
                  className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-955 shadow hover:shadow-cyan/25 active:scale-95 transition-all cursor-pointer"
                >
                  Add Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================================
          EDIT WORD MODAL (Enlarged)
          ======================================================== */}
      {isEditModalOpen && selectedWord && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto glass-panel rounded-2xl border border-slate-800 p-5 sm:p-8 space-y-6 shadow-2xl bg-[#0a0f1d] animate-scale-up scrollbar-thin">
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

            <form onSubmit={handleUpdateWord} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Type Select */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["word", "phrase", "idiom", "native_daily_phrase"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled
                        className={`py-2 rounded-xl text-xs font-bold uppercase border transition-all cursor-not-allowed ${formType === t
                          ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/40 opacity-100"
                          : "bg-slate-900/40 border-slate-950/40 text-slate-650 opacity-40"
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

                {/* Word Input */}
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

                {/* Spelling Warning block */}
                {spellingWarning && (
                  <div className="md:col-span-2 px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[13px] font-medium rounded-xl flex items-center gap-2 animate-fade-in">
                    <Info className="w-4.5 h-4.5 shrink-0 text-amber-400" />
                    <span>Warning: &quot;{formWord}&quot; might have a spelling mistake (not found in dictionary). You can still save it.</span>
                  </div>
                )}

                {/* US & UK Pronunciation Inputs */}
                {formType !== "native_daily_phrase" ? (
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
                ) : (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Test Pronunciation</label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={!formWord.trim()}
                        onClick={() => playPronunciation(formWord, "US")}
                        className="flex-1 py-3 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs font-bold uppercase"
                      >
                        <Volume2 className="w-4 h-4" /> Listen (US Accent)
                      </button>
                      <button
                        type="button"
                        disabled={!formWord.trim()}
                        onClick={() => playPronunciation(formWord, "UK")}
                        className="flex-1 py-3 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl border border-slate-800 flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs font-bold uppercase"
                      >
                        <Volume2 className="w-4 h-4" /> Listen (UK Accent)
                      </button>
                    </div>
                  </div>
                )}

                {/* Word Type selector (noun, adj, adv...) */}
                {formType !== "native_daily_phrase" && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Word Type (e.g. noun, adj, adv...)</label>
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
                            className={`py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${(wt.value === "" && formWordTypes.length === 0) || isSelected
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                              : "bg-slate-900/60 border-slate-900/60 text-slate-455 hover:text-slate-205"
                              }`}
                          >
                            {wt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* English Meaning Input */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">English Meaning</label>
                  <input
                    type="text"
                    required
                    value={formMeaning}
                    onChange={(e) => setFormMeaning(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none transition-all"
                  />
                </div>

                {/* Vietnamese Meaning Input */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-emerald-400 block mb-1">Vietnamese Translation</label>
                  <input
                    type="text"
                    required
                    value={formVietnamese}
                    onChange={(e) => setFormVietnamese(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-emerald-950/30 focus:border-emerald-500/50 rounded-xl text-sm text-slate-205 focus:outline-none transition-all"
                  />
                </div>

                {/* Example Input */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Example Sentence</label>
                  <textarea
                    rows={2}
                    value={formExample}
                    onChange={(e) => setFormExample(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 focus:border-cyan-500/50 rounded-xl text-sm text-slate-200 focus:outline-none resize-none transition-all"
                  />
                </div>

                {/* Difficulty Rating */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Difficulty Rating</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(["easy", "medium", "hard"] as const).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setFormDifficulty(diff)}
                        className={`py-2.5 rounded-xl text-xs font-bold uppercase border transition-all cursor-pointer active:scale-98 ${formDifficulty === diff
                          ? diff === "easy"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                            : diff === "medium"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/40"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/40"
                          : "bg-slate-900/60 border-slate-900/60 text-slate-450 hover:text-slate-205"
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
                      handleDeleteWord(selectedWord);
                      setIsEditModalOpen(false);
                      setSelectedWord(null);
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
                    className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-202 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-955 shadow hover:shadow-cyan/25 active:scale-95 transition-all cursor-pointer"
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
                  <tbody className="divide-y divide-slate-900/60 bg-slate-950/20">
                    {confirmData.map((row) => (
                      <tr key={row.label} className="hover:bg-slate-900/20">
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
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setConfirmAction(null);
                }}
                className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Go Back & Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmAction) confirmAction();
                  setIsConfirmModalOpen(false);
                  setConfirmAction(null);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-955 shadow hover:shadow-cyan/25 active:scale-95 transition-all cursor-pointer"
              >
                Accept & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
