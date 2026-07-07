import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";
import {
  Message,
  SofianAIState,
  MindState,
  Attachment,
  UserSettings,
  ChatSession,
  User,
  Task,
  ToolOutput,
} from "./types";
import {
  generateResponse,
  getEmbedding,
  generateSessionTitle,
} from "./services/neuralService";
import { saveToVectorDb, queryVectorDb } from "./services/vectorMemory";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  saveUser,
  subscribeToSessions,
  saveSession,
  saveMessage,
  subscribeToMessages,
  subscribeToMemories,
  saveMemory,
  subscribeToCustomModes,
  deleteSession,
  updateUserSettings,
} from "./services/firebaseService";
import ChatMessage from "./components/ChatMessage";
import ChatInput from "./components/ChatInput";
import AuthModal from "./components/AuthModal";
import CameraOverlay from "./components/CameraOverlay";
import ImageEditor from "./components/ImageEditor";
import SettingsModal from "./components/SettingsModal";
import LiveVoiceMode from "./components/LiveVoiceMode";
import NarrativePresentation from "./components/NarrativePresentation";
import {
  Icons,
  MIND_MODES,
  LANGUAGES,
  getSystemInstruction,
} from "./constants";
import { useTranslation } from "./translations";
import { generateId, cn, triggerHaptic } from "./lib/utils";
import { ImpactStyle } from "@capacitor/haptics";
import { useKineticState } from "./hooks/useKineticState";
import { io, Socket } from "socket.io-client";

const STORAGE_KEY = "sofian_ai_mega_v2";
const CREATOR_EMAIL = "sofian20118@gmail.com";

const MAPS_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(MAPS_KEY) && MAPS_KEY !== 'YOUR_API_KEY';

const App: React.FC = () => {
  console.log("App component rendering...");
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  const [sessionFilterFavorites, setSessionFilterFavorites] = useState(false);
  const [sessionFilterMode, setSessionFilterMode] = useState<string>("all");
  const [sessionFilterDate, setSessionFilterDate] = useState<
    "all" | "today" | "week" | "month"
  >("all");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [remoteTyping, setRemoteTyping] = useState<Record<string, boolean>>({});

  const dedupeMessages = (msgs: Message[]) => {
    const seen = new Set();
    return msgs.filter((m) => {
      const duplicate = seen.has(m.id);
      seen.add(m.id);
      return !duplicate;
    });
  };

  const [state, setState] = useState<SofianAIState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const legacyModes = Array.isArray(parsed.activeModes)
          ? parsed.activeModes
          : parsed.activeMode
            ? [parsed.activeMode]
            : ["Assistant"];
        const cleanedModes = legacyModes.filter((m: string) => m !== "Planner");

        const cleanedSessions = (parsed.sessions || []).map(
          (s: ChatSession) => ({
            ...s,
            id: String(s.id),
            messages: dedupeMessages(s.messages || []),
          }),
        );

        const finalSessions =
          cleanedSessions.length > 0
            ? cleanedSessions
            : [
                {
                  id: "default",
                  title: "New Session",
                  messages: [],
                  modes: ["Assistant"],
                  timestamp: Date.now(),
                },
              ];

        return {
          ...parsed,
          sessions: finalSessions,
          currentSessionId: parsed.currentSessionId || finalSessions[0].id,
          isLoading: false,
          error: null,
          activeModes: cleanedModes.length > 0 ? cleanedModes : ["Assistant"],
          customModes: parsed.customModes || [],
          tasks: parsed.tasks || [],
          savedMessages: parsed.savedMessages || [],
          toasts: [],
          settings: {
            language: "en",
            focusMode: false,
            ...(parsed.settings || {}),
          },
        };
      } catch (e) {
        console.error(e);
      }
    }

    const initialId = generateId();
    return {
      currentSessionId: initialId,
      sessions: [
        {
          id: initialId,
          title: "New Session",
          modes: ["Assistant"],
          timestamp: Date.now(),
          messages: [],
        },
      ],
      isLoading: false,
      error: null,
      activeModes: ["Assistant"],
      tasks: [],
      customModes: [],
      settings: {
        memory: true,
        creativity: 0.7,
        length: "detailed",
        darkMode: "system",
        language: "en",
        focusMode: false,
        useEmojis: true,
        bugSearching: false,
      },
      savedMessages: [],
      user: null,
      toasts: [],
    };
  });

  const { t } = useTranslation(state.settings.language || "en");
  const isRTL = state.settings.language === "ar";

  useEffect(() => {
    const root = window.document.documentElement;
    const theme = state.settings.darkMode;

    const applyTheme = (t: boolean | "system") => {
      console.log("Applying theme:", t);
      if (t === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
          .matches
          ? "dark"
          : "light";
        console.log("System theme detected:", systemTheme);
        root.classList.toggle("dark", systemTheme === "dark");
      } else {
        root.classList.toggle("dark", t === true);
      }
    };

    applyTheme(theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [state.settings.darkMode]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.dir = isRTL ? "rtl" : "ltr";
    root.lang = state.settings.language || "en";

    // Add RTL class to body for specific overrides if needed
    document.body.classList.toggle("rtl", isRTL);
  }, [state.settings.language, isRTL]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let hasFired = false;
      const updatedTasks = state.tasks.map((task) => {
        if (!task.completed && task.reminderAt && task.reminderAt <= now) {
          const title = t("reminderFired");
          const body = task.text;

          // Always add in-app toast
          addToast(`${title}: ${body}`, "info");

          hasFired = true;
          return { ...task, reminderAt: undefined };
        }
        return task;
      });

      if (hasFired) {
        setState((prev) => ({ ...prev, tasks: updatedTasks }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.tasks, t]);

  useEffect(() => {
    if (state.currentSessionId) {
    }
  }, [state.currentSessionId]);

  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    newSocket.on(
      "user_typing",
      (data: { roomId: string; isTyping: boolean; userId: string }) => {
        setRemoteTyping((prev) => ({
          ...prev,
          [data.userId]: data.isTyping,
        }));
      },
    );

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (socket && state.currentSessionId) {
      socket.emit("join_room", state.currentSessionId);
    }
    return () => {
      if (socket && state.currentSessionId) {
        socket.emit("leave_room", state.currentSessionId);
      }
    };
  }, [socket, state.currentSessionId]);

  const requestNotificationPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
    }
  };

  const addToast = (
    message: string,
    type: "success" | "error" | "info" = "info",
  ) => {
    const id =
      Date.now().toString() + Math.random().toString(36).substring(2, 9);
    setState((prev) => ({
      ...prev,
      toasts: [...(prev.toasts || []), { id, message, type }],
    }));

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          new Notification("Sofian AI", {
            body: message,
            icon: "/logo.png",
          });
        } catch (e) {
          console.error("Notification error:", e);
        }
      }
    }

    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        toasts: (prev.toasts || []).filter((t) => t.id !== id),
      }));
    }, 5000);
  };
  const [taskInput, setTaskInput] = useState("");
  const [taskPriority, setTaskPriority] = useState<"high" | "medium" | "low">(
    "medium",
  );
  const [activeReminderTaskId, setActiveReminderTaskId] = useState<
    string | null
  >(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [narrativeVideoData, setNarrativeVideoData] = useState<{
    title: string;
    theme: "minimal" | "futuristic" | "dark" | "light";
    scenes: any[];
  } | null>(null);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [activeTab, setActiveTab] = useState<"history" | "tasks">("history");
  const [stopAllTrigger, setStopAllTrigger] = useState(0);
  const [location, setLocation] = useState<
    { lat: number; lng: number } | undefined
  >(undefined);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const sensorDataRef = useRef<
    | {
        alpha?: number | null;
        beta?: number | null;
        gamma?: number | null;
        ax?: number | null;
        ay?: number | null;
        az?: number | null;
      }
    | undefined
  >(undefined);

  const processingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<any>(null);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 150;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isAuthReady && !state.user) {
      setIsAuthOpen(true);
    }
  }, [isAuthReady, state.user]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get("session");
    if (sessionParam) {
      setState((prev) => ({
        ...prev,
        currentSessionId: sessionParam,
        sessions: prev.sessions.find((s) => s.id === sessionParam)
          ? prev.sessions
          : [
              ...prev.sessions,
              {
                id: sessionParam,
                title: "Shared Session",
                modes: ["Assistant"],
                timestamp: Date.now(),
                messages: [],
                isPublic: true,
              },
            ],
      }));
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const user: User = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.isAnonymous
            ? t("guestUser")
            : firebaseUser.displayName || t("user"),
          email: firebaseUser.email || "",
          photoURL: firebaseUser.photoURL || undefined,
          isCreator: firebaseUser.email === CREATOR_EMAIL,
          createdAt: Date.now(),
        };
        await saveUser(user);
        setState((prev) => ({ ...prev, user }));
      } else {
        setState((prev) => ({ ...prev, user: null }));
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !state.user) return;

    const unsubscribeSessions = subscribeToSessions(
      state.user.uid,
      (sessions) => {
        setState((prev) => {
          // Merge local unsaved sessions with remote sessions
          const remoteSessionIds = new Set(sessions.map((s) => s.id));
          // Keep local sessions that are not yet on the server.
          // We removed the messages.length > 0 check to allow new empty sessions to persist.
          const localOnlySessions = prev.sessions.filter(
            (s) => !remoteSessionIds.has(s.id),
          );

          // Preserve messages for remote sessions from current state
          const sessionsWithMessages = sessions.map((s) => {
            const existing = prev.sessions.find((ps) => ps.id === s.id);
            return {
              ...s,
              messages: s.messages || existing?.messages || [],
            };
          });

          const mergedSessions = [
            ...localOnlySessions,
            ...sessionsWithMessages,
          ].sort((a, b) => b.timestamp - a.timestamp);

          // Deduplicate sessions by ID
          const finalSessions = mergedSessions.filter(
            (s, index, self) => index === self.findIndex((t) => t.id === s.id),
          );

          const sessionsToSet =
            finalSessions.length > 0
              ? finalSessions
              : [
                  {
                    id: "default",
                    title: "New Session",
                    messages: [],
                    modes: ["Assistant" as MindState],
                    timestamp: Date.now(),
                  },
                ];

          return {
            ...prev,
            sessions: sessionsToSet,
            currentSessionId: sessionsToSet.find(
              (s) => s.id === prev.currentSessionId,
            )
              ? prev.currentSessionId
              : sessionsToSet[0].id,
          };
        });
      },
    );

    const unsubscribeMessages = subscribeToMessages(
      state.currentSessionId,
      (remoteMessages) => {
        if (remoteMessages.length === 0) return;
        setState((prev) => {
          const currentSession = prev.sessions.find(
            (s) => s.id === prev.currentSessionId,
          );
          const localMessages = currentSession?.messages || [];

          // Merge remote messages with local messages to preserve large assets (images)
          // that get stripped by Firebase due to size limits.
          const mergedMessages = remoteMessages.map((remoteMsg) => {
            const localMsg = localMessages.find((m) => m.id === remoteMsg.id);
            if (localMsg) {
              return {
                ...remoteMsg,
                generatedImage:
                  remoteMsg.generatedImage || localMsg.generatedImage,
                attachment:
                  remoteMsg.attachment?.isTooLarge &&
                  localMsg.attachment?.fullData
                    ? {
                        ...remoteMsg.attachment,
                        fullData: localMsg.attachment.fullData,
                      }
                    : remoteMsg.attachment,
              };
            }
            return remoteMsg;
          });

          return {
            ...prev,
            sessions: prev.sessions.map((s) =>
              s.id === prev.currentSessionId
                ? { ...s, messages: dedupeMessages(mergedMessages) }
                : s,
            ),
          };
        });
      },
    );

    const unsubscribeMemories = subscribeToMemories(
      state.user.uid,
      async (memories) => {
        const { getEmbedding } = await import("./services/neuralService");

        setState((prev) => {
          if (!prev.user) return prev;

          // We need to generate embeddings for memories that don't have them in vectorDb
          // For simplicity in this update, we'll just store the raw facts in user.memory
          // so they can be used directly in the system prompt.
          return {
            ...prev,
            user: {
              ...prev.user,
              memory: memories.map((m) => m.fact),
            },
          };
        });
      },
    );

    const unsubscribeCustomModes = subscribeToCustomModes(
      state.user.uid,
      (modes) => {
        setState((prev) => ({ ...prev, customModes: modes }));
      },
    );

    return () => {
      unsubscribeSessions();
      unsubscribeMessages();
      unsubscribeMemories();
      unsubscribeCustomModes();
    };
  }, [isAuthReady, state.user?.uid, state.currentSessionId]);

  useEffect(() => {
    try {
      // Only save essential settings and metadata, not full message history
      // This prevents QuotaExceededError in localStorage
      const stateToSave = {
        ...state,
        sessions: state.sessions.map((s) => ({
          ...s,
          messages: [], // Don't save messages to localStorage; they are in Firestore
        })),
        savedMessages: [], // Also don't save these
        user: state.user
          ? {
              ...state.user,
              vectorDb: [], // Don't save large vectorDb in the main state key
            }
          : null,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn(
        "LocalStorage quota exceeded for main state, skipping save.",
        e,
      );
    }
  }, [state]);

  useEffect(() => {
    const isRTL = ["ar", "he", "fa", "ur"].includes(state.settings.language);
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
  }, [state.settings.language]);

  useEffect(() => {
    scrollToBottom(state.isLoading ? "smooth" : "auto");
  }, [state.sessions]);

  useEffect(() => {
    if (state.isLoading) {
      scrollToBottom("smooth");
    }
  }, [state.isLoading]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.debug("Loc error", err),
        { enableHighAccuracy: false, timeout: 5000 },
      );
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (!sensorDataRef.current) sensorDataRef.current = {};
      sensorDataRef.current.alpha = event.alpha;
      sensorDataRef.current.beta = event.beta;
      sensorDataRef.current.gamma = event.gamma;
    };
    const handleMotion = (event: DeviceMotionEvent) => {
      if (!sensorDataRef.current) sensorDataRef.current = {};
      sensorDataRef.current.ax = event.acceleration?.x;
      sensorDataRef.current.ay = event.acceleration?.y;
      sensorDataRef.current.az = event.acceleration?.z;
    };

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, []);

  const currentSession = state.sessions.find(
    (s) => s.id === state.currentSessionId,
  ) || { id: "null", title: "", messages: [], modes: [], timestamp: 0 };

  const toggleFavorite = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = state.sessions.find((s) => s.id === sessionId);
    if (session) {
      const updatedSession = { ...session, isFavorite: !session.isFavorite };
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === sessionId ? updatedSession : s,
        ),
      }));
      if (state.user) {
        await saveSession(updatedSession, state.user.uid);
      }
    }
  };

  const handleSendMessage = async (
    text: string,
    directAttachment?: Attachment,
  ) => {
    const msgText = text.trim();
    const finalAttachment = directAttachment || attachment;

    if ((!msgText && !finalAttachment) || processingRef.current) return;

    triggerHaptic(ImpactStyle.Light);

    processingRef.current = true;
    setStopAllTrigger((prev) => prev + 1);

    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: msgText,
      timestamp: Date.now(),
      attachment: finalAttachment || undefined,
    };

    setState((prev) => {
      const updatedSessions = prev.sessions.map((s) => {
        if (s.id === prev.currentSessionId) {
          let newTitle = s.title;
          if (
            s.title === "New Session" ||
            s.title === t("newSession") ||
            s.title === "New Objective" ||
            s.title === "Nano Protocol Start"
          ) {
            newTitle = msgText.trim().slice(0, 30) || "Session";
          }
          return {
            ...s,
            messages: [...(s.messages || []), userMsg],
            title: newTitle,
          };
        }
        return s;
      });

      if (prev.user) {
        const updatedSession = updatedSessions.find(
          (s) => s.id === prev.currentSessionId,
        );
        if (updatedSession) {
          saveSession(updatedSession, prev.user.uid).catch(console.error);
          saveMessage(
            { ...userMsg, sessionId: updatedSession.id },
            prev.user.uid,
          ).catch(console.error);
        }
      }

      return {
        ...prev,
        isLoading: true,
        error: null,
        sessions: updatedSessions,
      };
    });

    const currentSess = state.sessions.find(
      (s) => s.id === state.currentSessionId,
    );
    if (
      currentSess &&
      (currentSess.title === "New Session" ||
        currentSess.title === t("newSession") ||
        currentSess.title === "New Objective" ||
        currentSess.title === "Nano Protocol Start")
    ) {
      generateSessionTitle(msgText, state.settings)
        .then((betterTitle) => {
          if (betterTitle) {
            setState((prev) => {
              const updatedSessions = prev.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? { ...s, title: betterTitle }
                  : s,
              );
              if (prev.user) {
                const updatedSession = updatedSessions.find(
                  (s) => s.id === state.currentSessionId,
                );
                if (updatedSession) {
                  saveSession(updatedSession, prev.user.uid).catch(
                    console.error,
                  );
                }
              }
              return { ...prev, sessions: updatedSessions };
            });
          }
        })
        .catch(console.error);
    }

    setAttachment(null);

    try {
      await processResponse(
        msgText,
        currentSession.messages || [],
        userMsg,
        state.activeModes,
      );
    } finally {
      processingRef.current = false;
    }
  };

  const executeJavaScript = (code: string): string => {
    const logs: string[] = [];

    // Sandbox console.log
    const mockConsole = {
      log: (...args: any[]) =>
        logs.push(
          args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" "),
        ),
    };

    try {
      const func = new Function("console", code);
      const result = func(mockConsole);
      if (result !== undefined) logs.push(String(result));
      return logs.length > 0
        ? logs.join("\n")
        : "Code executed successfully (No Output).";
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  };

  const processResponse = async (
    msgText: string,
    history: Message[],
    newUserMsg: Message,
    modes: MindState[],
  ) => {
    try {
      const fullHistory = [...history, newUserMsg];

      // 1. Vector Retrieval
      let retrievedContext = "";
      if (state.user?.vectorDb && state.settings.memory) {
        const hits = await queryVectorDb(msgText, state.user.vectorDb);
        if (hits.length > 0) {
          retrievedContext = hits.join("\n\n");
        }
      }

      let botMsgId = generateId();

      // Flow for Beta mode using backend chatRouter
      if (modes.includes("Beta")) {
        setState((prev) => {
          const currentSession = prev.sessions.find((s) => s.id === prev.currentSessionId);
          if (!currentSession) return prev;
          return {
            ...prev,
            sessions: prev.sessions.map((s) => 
              s.id === prev.currentSessionId ? { 
                ...s, 
                messages: [...(s.messages || []), {
                  id: botMsgId,
                  role: "assistant",
                  content: "Thinking...",
                  timestamp: Date.now(),
                  toolOutputs: [],
                }]
              } : s
            )
          };
        });

        const chatMutation = {
          mutateAsync: async (data: any) => {
            const res = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data)
            });
            return res.json();
          }
        };

        const result = await chatMutation.mutateAsync({
          message: msgText,
          mode: "Beta",
          history: fullHistory
        });

        setState((prev) => {
          const currentSession = prev.sessions.find((s) => s.id === prev.currentSessionId);
          if (!currentSession) return prev;
          
          let botMsg: Message | undefined;
          const updatedMessages = (currentSession.messages || []).map(m => {
            if (m.id === botMsgId) {
              botMsg = { ...m, content: result.text || "No response." };
              return botMsg;
            }
            return m;
          });

          const updatedSession = { ...currentSession, messages: updatedMessages };

          if (prev.user && botMsg) {
             saveSession(updatedSession, prev.user.uid).catch(console.error);
             saveMessage({ ...botMsg, sessionId: updatedSession.id }, prev.user.uid).catch(console.error);
          }

          return {
            ...prev,
            isLoading: false,
            sessions: prev.sessions.map((s) => 
              s.id === prev.currentSessionId ? updatedSession : s
            )
          };
        });
        
        return;
      }

      let hasInjected = false;

      const result = await generateResponse(
        msgText || t("analyzeVision"),
        history,
        newUserMsg.attachment,
        state.settings,
        modes,
        location,
        state.user?.memory, // Legacy memory
        retrievedContext, // New Vector Memory
        sensorDataRef.current, // Sensor Data
        state.customModes,
        state.user?.email || undefined, // User Email
        (progress) => {
          setState((prev) => {
            const currentSession = prev.sessions.find((s) => s.id === prev.currentSessionId);
            if (!currentSession) return prev;
            
            let updatedMessages = [...(currentSession.messages || [])];
            
            if (!hasInjected) {
              updatedMessages.push({
                id: botMsgId,
                role: "assistant",
                content: progress.textChunk || "",
                thought: progress.thoughtChunk || "",
                timestamp: Date.now(),
                toolOutputs: [],
              });
              hasInjected = true;
            } else {
              updatedMessages = updatedMessages.map(m => {
                if (m.id === botMsgId) {
                  return {
                    ...m,
                    content: (m.content || "") + (progress.textChunk || ""),
                    thought: m.thought ? m.thought + (progress.thoughtChunk || "") : (progress.thoughtChunk || undefined)
                  };
                }
                return m;
              });
            }

            return {
              ...prev,
              sessions: prev.sessions.map((s) => 
                s.id === prev.currentSessionId ? { ...s, messages: updatedMessages } : s
              )
            };
          });
        }
      );

      const toolOutputs: ToolOutput[] = [];
      let finalContent = result.content;

      if (
        !finalContent &&
        !result.generatedImage &&
        !result.thought &&
        (!result.toolCalls || result.toolCalls.length === 0)
      ) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      // Sync final state
      setState((prev) => {
        const currentSession = prev.sessions.find((s) => s.id === prev.currentSessionId);
        if (!currentSession) return prev;
        
        let updatedMessages = [...(currentSession.messages || [])];
        
        if (!hasInjected) {
          updatedMessages.push({
            id: botMsgId,
            role: "assistant",
            content: finalContent || "",
            suggestions: result.suggestions,
            timestamp: Date.now(),
            thought: result.thought,
            sources: result.sources,
            generatedImage: result.generatedImage,
            toolOutputs: [],
          });
          hasInjected = true;
        } else {
          updatedMessages = updatedMessages.map(m => {
            if (m.id === botMsgId) {
              return {
                ...m,
                content: finalContent || m.content,
                suggestions: result.suggestions,
                thought: result.thought || m.thought,
                sources: result.sources,
                generatedImage: result.generatedImage
              };
            }
            return m;
          });
        }

        return {
          ...prev,
          sessions: prev.sessions.map((s) => 
            s.id === prev.currentSessionId ? { ...s, messages: updatedMessages } : s
          )
        };
      });

      // To keep tool implementations working using the old botMsg reference
      const botMsg: Message = {
        id: botMsgId,
        role: "assistant",
        content: finalContent || "",
        suggestions: result.suggestions,
        timestamp: Date.now(),
        thought: result.thought,
        sources: result.sources,
        generatedImage: result.generatedImage,
        toolOutputs: [],
      };

      // Handle Tools (Re-ordered to allow botMsg access)
      if (result.toolCalls) {
        for (const call of result.toolCalls) {
          // -- Tasks --
          if (call.name === "manage_tasks") {
            const { action, taskText, taskId, priority } = call.args as any;
            setState((prev) => {
              let updatedTasks = [...prev.tasks];
              if (action === "add") {
                updatedTasks.push({
                  id: generateId(),
                  text: taskText,
                  completed: false,
                  priority: priority || "medium",
                });
              } else if (action === "remove" && taskId) {
                updatedTasks = updatedTasks.filter((t) => t.id !== taskId);
              } else if (action === "complete" && taskId) {
                updatedTasks = updatedTasks.map((t) =>
                  t.id === taskId ? { ...t, completed: true } : t,
                );
              }
              return { ...prev, tasks: updatedTasks };
            });
            toolOutputs.push({
              type: "success",
              content: `Task ${action}ed: ${taskText || taskId}`,
            });
          }
          // -- Memory --
          else if (call.name === "remember") {
            const { fact } = call.args as any;
            if (fact && state.user) {
              await handleSaveMemory(fact);
              toolOutputs.push({ type: "success", content: t("memorySynced") });
            }
          }
          // -- Code Execution --
          else if (call.name === "execute_code") {
            const { code, language } = call.args as any;
            let output = "";
            if (language === "python") {
              output =
                "Python Environment: Virtual (Mock)\nOutput: Code valid. Execution simulation successful.\n(Note: Full Python WASM runtime required for live execution)";
            } else {
              output = executeJavaScript(code);
            }
            toolOutputs.push({
              type: "code",
              service: "terminal",
              content: output,
              meta: { code, language },
            });
          }
          // -- Sandbox App Rendering --
          else if (call.name === "search_places") {
            const { query, location: locOverride, type } = call.args as any;
            toolOutputs.push({
              type: "success",
              service: "custom",
              content: `Searching for "${query}"...`,
              meta: { 
                type: 'places_search',
                query, 
                location: locOverride || 'current',
                placeType: type,
                loading: true 
              }
            });
          }
          else if (call.name === "render_sandbox_app") {
            const { title, code, type, dependencies } = call.args as any;
            toolOutputs.push({
              type: "sandbox",
              service: "sandbox",
              content: `Application "${title || "Sandbox App"}" rendered successfully.`,
              meta: { title, code, type, dependencies },
            });
          }
          // -- Generate Chart --
          else if (call.name === "generate_chart") {
            const chartConfig = call.args as any;
            const chartJson = JSON.stringify(chartConfig, null, 2);
            toolOutputs.push({
              type: "success",
              content: `Chart generated: ${chartConfig.title}`,
            });
            botMsg.content =
              (botMsg.content || "") +
              `\n\n\`\`\`json-chart\n${chartJson}\n\`\`\``;
          }
          // -- Generate PDF --
          else if (call.name === "generate_pdf") {
            const { title, content, filename } = call.args as any;
            
            if (!state.activeModes.includes('Assistant')) {
              toolOutputs.push({
                type: "error",
                content: "PDF generation is only allowed in Assistant mode. Please switch to Default mode to use this feature.",
              });
              continue;
            }

            try {
              // Add loading state
              const loadingOutput: ToolOutput = {
                type: "success",
                service: "custom",
                content: "Generating PDF...",
                meta: { loading: true }
              };
              toolOutputs.push(loadingOutput);
              botMsg.toolOutputs = [...toolOutputs];
              setState((prev) => ({
                ...prev,
                sessions: prev.sessions.map((s) => s.id === prev.currentSessionId ? { ...s, messages: s.messages.map(m => m.id === botMsg.id ? { ...m, toolOutputs: botMsg.toolOutputs } : m) } : s)
              }));
              
              // Yield to let UI render loading state
              await new Promise(r => setTimeout(r, 50));

              const doc = new jsPDF();
              const margin = 20;
              const pageWidth = doc.internal.pageSize.getWidth();
              const pageHeight = doc.internal.pageSize.getHeight();
              const usableWidth = pageWidth - margin * 2;
              let cursorY = 30;

              // Title
              doc.setFontSize(24);
              doc.setTextColor(79, 70, 229); // indigo-600
              const splitTitle = doc.splitTextToSize(
                title || "Sofian AI Document",
                usableWidth,
              );
              doc.text(splitTitle, margin, cursorY);
              cursorY += splitTitle.length * 12 + 10;

              // Separator line
              doc.setDrawColor(229, 231, 235);
              doc.line(margin, cursorY - 5, pageWidth - margin, cursorY - 5);

              // Content
              doc.setFontSize(11);
              doc.setTextColor(31, 41, 55);
              doc.setLineHeightFactor(1.5);
              
              const paragraphs = (content || "").split('\n');
              for (let i = 0; i < paragraphs.length; i++) {
                const paragraph = paragraphs[i].trim();
                if (!paragraph) {
                  cursorY += 8;
                  if (cursorY > pageHeight - margin - 15) {
                    doc.addPage();
                    cursorY = margin + 15;
                  }
                  continue;
                }
                const lines = doc.splitTextToSize(paragraph, usableWidth);
                for (let j = 0; j < lines.length; j++) {
                  if (cursorY > pageHeight - margin - 15) {
                    doc.addPage();
                    // Header on new page
                    doc.setFontSize(8);
                    doc.setTextColor(156, 163, 175);
                    doc.text(title || "Sofian AI Document", margin, margin);
                    doc.setFontSize(11);
                    doc.setTextColor(31, 41, 55);
                    cursorY = margin + 15;
                  }
                  doc.text(lines[j], margin, cursorY);
                  cursorY += 7;
                }
                cursorY += 4; // gap between paragraphs
                
                if (i % 50 === 0) {
                   await new Promise(r => setTimeout(r, 0));
                }
              }

              // Footer
              const totalPages = (doc as any).internal.getNumberOfPages();
              for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(156, 163, 175);
                doc.text(
                  `Generated by Sofian AI - Page ${i} of ${totalPages}`,
                  margin,
                  pageHeight - 10,
                );
              }

              const safeName = filename || "sofian-doc.pdf";
              const pdfBlob = doc.output("blob");
              const dataUri = URL.createObjectURL(pdfBlob);

              // Remove loading output
              toolOutputs.pop();

              // Attempt download
              try {
                const link = document.createElement("a");
                link.href = dataUri;
                link.download = safeName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (e) {
                console.warn("Auto-download skipped");
              }

              toolOutputs.push({
                type: "pdf",
                content: `PDF "${safeName}" generated successfully.`,
                meta: {
                  filename: safeName,
                  dataUri: dataUri,
                },
              });
            } catch (err: any) {
              toolOutputs.pop(); // Remove loading output on error
              console.error("PDF generation failed:", err);
              toolOutputs.push({
                type: "error",
                content: `PDF generation failed: ${err.message}`,
              });
            }
          }
          // -- Generate PPT --
          else if (call.name === "generate_ppt") {
            const { title, slides, filename, contextDepth } = call.args as any;

            try {
              // Add loading state
              const loadingOutput: ToolOutput = {
                type: "success",
                service: "custom",
                content: "Generating enhanced PowerPoint...",
                meta: { loading: true }
              };
              toolOutputs.push(loadingOutput);
              botMsg.toolOutputs = [...toolOutputs];
              setState((prev) => ({
                ...prev,
                sessions: prev.sessions.map((s) => s.id === prev.currentSessionId ? { ...s, messages: s.messages.map(m => m.id === botMsg.id ? { ...m, toolOutputs: botMsg.toolOutputs } : m) } : s)
              }));
              
              // Yield to let UI render loading state
              await new Promise(r => setTimeout(r, 50));

              const pres = new PptxGenJS();
              pres.title = title || "Presentation";
              
              const safeName = filename || "presentation.pptx";
              const depth = contextDepth || "balanced";

              // Determine font sizes based on context depth
              const bodyFontSize = depth === 'exhaustive' ? 14 : depth === 'sparse' ? 24 : 18;

              // Helper to fetch image as data URL with timeout/error handling
              const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
                  try {
                      const controller = new AbortController();
                      const id = setTimeout(() => controller.abort(), 8000);
                      const res = await fetch(url, { signal: controller.signal });
                      clearTimeout(id);
                      if (!res.ok) return null;
                      const blob = await res.blob();
                      return new Promise((resolve) => {
                          const reader = new FileReader();
                          reader.onloadend = () => resolve(reader.result as string);
                          reader.readAsDataURL(blob);
                      });
                  } catch (e) {
                      console.error("Failed to fetch image:", e);
                      return null;
                  }
              };

              // Pre-fetch all images
              const slideImages = await Promise.all(
                  (slides || []).map(s => s.imageKeyword ? fetchImageAsDataUrl(`https://image.pollinations.ai/prompt/${encodeURIComponent(s.imageKeyword)}?width=1024&height=768&nologo=true&seed=${Math.floor(Math.random() * 1000)}`) : null)
              );

              for (let i=0; i < (slides || []).length; i++) {
                const slideData = slides[i];
                const slide = pres.addSlide();
                
                // Varied Slide Layouts
                const isImageSlide = !!slideImages[i];
                const layout = i % 3 === 0 && isImageSlide ? 'image-split' : 'text-centric';

                // Apply a sophisticated background
                slide.background = { color: 'FFFFFF' };

                // Decorative top bar
                slide.addShape(pres.ShapeType.rect, {
                  x: 0, y: 0, w: '100%', h: 0.15,
                  fill: { color: '4F46E5' } 
                });
                
                // Add title
                slide.addText(slideData.title || "", { 
                  x: 0.5, y: 0.3, w: "90%", h: 0.8, 
                  fontSize: 36, bold: true, color: "111827",
                  fontFace: "Helvetica Neue"
                });
                
                const animations = ['fade', 'flyIn', 'zoom', 'wipe'];
                const selectedAnim = slideData.animation === 'flyIn' ? 'fly' : slideData.animation === 'zoom' ? 'zoom' : 'fade';
                const slideAnim = slideData.animation ? { type: selectedAnim, duration: 0.8 } : undefined;

                // Content
                if (slideData.bullets && Array.isArray(slideData.bullets)) {
                  const bulletItems = slideData.bullets.map((b: string) => ({ 
                    text: b, 
                    options: { 
                      bullet: { type: 'point' },
                      fontFace: 'Helvetica Neue'
                    } 
                  }));

                  slide.addText(bulletItems, { 
                    x: 0.5, y: 1.5, 
                    w: layout === 'image-split' ? "45%" : "90%", h: 4, 
                    fontSize: bodyFontSize, color: "374151", valign: "top",
                    lineSpacing: depth === 'exhaustive' ? 24 : 34
                  });
                }

                // Add Image
                if (slideImages[i]) {
                    slide.addImage({ 
                        data: slideImages[i],
                        x: layout === 'image-split' ? 5.5 : 2,
                        y: layout === 'image-split' ? 1.5 : 2.5,
                        w: layout === 'image-split' ? 3.8 : 6,
                        h: layout === 'image-split' ? 3 : 3.5,
                        rounding: true,
                        shadow: { type: 'outer', color: '000000', opacity: 0.3, blur: 15, offset: 5 },
                        // animate: slideAnim // Not strongly typed on image?
                    });
                }

                if (slideData.speakerNotes) {
                  slide.addNotes(slideData.speakerNotes);
                }
              }


              const pptBuffer = await pres.write({ outputType: "blob" }) as Blob;
              const dataUri = URL.createObjectURL(pptBuffer);

              toolOutputs.pop();

              try {
                const link = document.createElement("a");
                link.href = dataUri;
                link.download = safeName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (e) {
                console.warn("Auto-download skipped");
              }

              toolOutputs.push({
                type: "ppt",
                content: `PowerPoint "${safeName}" generated with ${depth} detail level.`,
                meta: {
                  filename: safeName,
                  dataUri: dataUri,
                },
              });
            } catch (err: any) {
              toolOutputs.pop();
              console.error("PPT generation failed:", err);
              toolOutputs.push({
                type: "error",
                content: `PPT generation failed: ${err.message}`,
              });
            }
          }
          // -- Generate DOCX --
          else if (call.name === "generate_docx") {
            const { title, sections, filename } = call.args as any;
            try {
              const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
              const { saveAs } = await import("file-saver");

              const doc = new Document({
                sections: [{
                  properties: {},
                  children: [
                    new Paragraph({
                      text: title,
                      heading: HeadingLevel.TITLE,
                    }),
                    ...sections.flatMap((s: any) => [
                      ...(s.heading ? [new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 })] : []),
                      new Paragraph({
                        children: [new TextRun(s.text)],
                      }),
                      new Paragraph({ text: "" }), // spacing
                    ])
                  ],
                }],
              });

              const blob = await Packer.toBlob(doc);
              const safeName = filename || "sofian-doc.docx";
              
              // Create a reader to get DataURI for the chat UI
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = () => {
                const dataUri = reader.result as string;
                toolOutputs.push({
                  type: "docx",
                  content: `Document "${safeName}" generated successfully.`,
                  meta: { filename: safeName, dataUri }
                });
                saveAs(blob, safeName);
                triggerHaptic(ImpactStyle.Medium);
              };
            } catch (err: any) {
              console.error("DOCX generation failed:", err);
              toolOutputs.push({
                type: "error",
                content: `DOCX generation failed: ${err.message}`,
              });
            }
          }
          // -- Generate Image --
          else if (call.name === "generate_image") {
            const { prompt, aspectRatio = "1:1" } = call.args as any;
            const seed = Math.floor(Math.random() * 100000);
            const [width, height] = aspectRatio === "16:9" ? [1280, 720] : aspectRatio === "9:16" ? [720, 1280] : [1024, 1024];
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
            
            botMsg.generatedImage = imageUrl;
            toolOutputs.push({
              type: "success",
              service: "artist",
              content: `Visual synthesis complete: "${prompt}"`,
              meta: { prompt, imageUrl, aspectRatio }
            });
            triggerHaptic(ImpactStyle.Heavy);
          }
          // -- Edit Image --
          else if (call.name === "edit_image") {
            const { prompt, referenceImageId } = call.args as any;
            // For pollinations, "editing" is just a new prompt, but we try to maintain style by appending the context
            const seed = Math.floor(Math.random() * 100000);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
            
            botMsg.generatedImage = imageUrl;
            toolOutputs.push({
              type: "success",
              service: "artist",
              content: `Image adjustment complete: "${prompt}"`,
              meta: { prompt, imageUrl }
            });
            triggerHaptic(ImpactStyle.Heavy);
          }
          // -- Generate Spreadsheet --
          else if (call.name === "generate_spreadsheet") {
            const { title, format, columns, rows, filename } = call.args as any;
            try {
              // Note: exceljs can be bulky, so we lazy import.
              const ExcelJS = await import("exceljs");
              const { saveAs } = await import("file-saver");

              const workbook = new ExcelJS.Workbook();
              const worksheet = workbook.addWorksheet(title || "Sheet 1");

              worksheet.columns = columns.map((c: string) => ({ header: c, key: c }));
              worksheet.addRows(rows);

              let blob: Blob;
              const safeName = filename || `data.${format}`;
              
              if (format === "csv") {
                const csv = await workbook.csv.writeBuffer() as any;
                blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              } else {
                const xlsx = await workbook.xlsx.writeBuffer() as any;
                blob = new Blob([xlsx], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
              }
              
              // Create a reader to get DataURI for the chat UI
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = () => {
                const dataUri = reader.result as string;
                toolOutputs.push({
                  type: format === "xlsx" ? "xlsx" : "success",
                  content: `${format.toUpperCase()} "${safeName}" generated successfully.`,
                  meta: { filename: safeName, dataUri }
                });
                saveAs(blob, safeName);
                triggerHaptic(ImpactStyle.Medium);
              };
            } catch (err: any) {
              console.error("Spreadsheet generation failed:", err);
              toolOutputs.push({
                type: "error",
                content: `Spreadsheet generation failed: ${err.message}`,
              });
            }
          }
          // -- Make Phone Call --
          else if (call.name === "make_phone_call") {
            const { to, message } = call.args as any;
            try {
              const res = await fetch("/api/call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to,
                  message,
                  authEmail: state.user?.email,
                }),
              });
              const result = await res.json();
              if (res.ok && result.success) {
                toolOutputs.push({
                  type: "call_e",
                  service: "custom",
                  content: `Phone call successfully initiated to ${to}. Call SID: ${result.callSid}`,
                  meta: { to, message }
                });
              } else {
                toolOutputs.push({
                  type: "error",
                  service: "custom",
                  content: `Call failed: ${result.error}`,
                  meta: { link: result.link }
                });
              }
            } catch (e: any) {
              toolOutputs.push({
                type: "error",
                service: "custom",
                content: `Call API error: ${e.message}`,
              });
            }
          }
          // -- Send SMS --
          else if (call.name === "send_sms") {
            const { to, message } = call.args as any;
            try {
              const res = await fetch("/api/sms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to,
                  message,
                  authEmail: state.user?.email,
                }),
              });
              const result = await res.json();
              if (res.ok && result.success) {
                toolOutputs.push({
                  type: "success",
                  service: "custom",
                  content: `SMS text successfully sent to ${to}. Message SID: ${result.messageSid}`,
                });
              } else {
                toolOutputs.push({
                  type: "error",
                  service: "custom",
                  content: `SMS failed: ${result.error}`,
                  meta: { link: result.link }
                });
              }
            } catch (e: any) {
              toolOutputs.push({
                type: "error",
                service: "custom",
                content: `SMS API error: ${e.message}`,
              });
            }
          }
          // -- Google Tasks --
          else if (call.name === "manage_google_tasks") {
            const { action, tasklist = "@default", task, title, notes } = call.args as any;
            try {
              if (!googleAccessToken) throw new Error("Google access token missing. Please sign in with Google.");
              let result;
              const baseUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks`;
              
              if (action === "list") {
                const res = await fetch(baseUrl, { headers: { Authorization: `Bearer ${googleAccessToken}` } });
                result = await res.json();
              } else if (action === "insert") {
                const res = await fetch(baseUrl, {
                  method: "POST",
                  headers: { 
                    Authorization: `Bearer ${googleAccessToken}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ title, notes })
                });
                result = await res.json();
              } else if (action === "patch") {
                const res = await fetch(`${baseUrl}/${task}`, {
                  method: "PATCH",
                  headers: { 
                    Authorization: `Bearer ${googleAccessToken}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ title, notes })
                });
                result = await res.json();
              } else if (action === "delete") {
                await fetch(`${baseUrl}/${task}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${googleAccessToken}` }
                });
                result = { success: true };
              }
              
              toolOutputs.push({
                type: "success",
                service: "tasks",
                content: `Google Task ${action} success: ${JSON.stringify(result)}`,
              });
            } catch (err: any) {
              toolOutputs.push({ type: "error", content: `Google Tasks error: ${err.message}` });
            }
          }
          // -- Google Keep --
          else if (call.name === "manage_google_keep") {
            const { action, title, content } = call.args as any;
            try {
              if (!googleAccessToken) throw new Error("Google access token missing.");
              let result;
              // Keep API v1
              if (action === "create") {
                const res = await fetch("https://keep.googleapis.com/v1/notes", {
                  method: "POST",
                  headers: { 
                    Authorization: `Bearer ${googleAccessToken}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ title, body: { text: { text: content } } })
                });
                result = await res.json();
              } else {
                const res = await fetch("https://keep.googleapis.com/v1/notes", {
                  headers: { Authorization: `Bearer ${googleAccessToken}` }
                });
                result = await res.json();
              }
              toolOutputs.push({ type: "success", service: "keep", content: `Google Keep ${action} result: ${JSON.stringify(result)}` });
            } catch (err: any) {
              toolOutputs.push({ type: "error", content: `Google Keep error: ${err.message}` });
            }
          }
          // -- Google Contacts (People API) --
          else if (call.name === "manage_google_contacts") {
            const { action, query, name, email, phone } = call.args as any;
            try {
              if (!googleAccessToken) throw new Error("Google access token missing.");
              let result;
              if (action === "search") {
                const res = await fetch(`https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(query)}&readMask=names,emailAddresses,phoneNumbers`, {
                  headers: { Authorization: `Bearer ${googleAccessToken}` }
                });
                result = await res.json();
              } else if (action === "create") {
                const res = await fetch("https://people.googleapis.com/v1/people:createContact", {
                  method: "POST",
                  headers: { 
                    Authorization: `Bearer ${googleAccessToken}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    names: [{ givenName: name }],
                    emailAddresses: email ? [{ value: email }] : [],
                    phoneNumbers: phone ? [{ value: phone }] : []
                  })
                });
                result = await res.json();
              }
              toolOutputs.push({ type: "success", service: "contacts", content: `Google Contacts ${action} result: ${JSON.stringify(result)}` });
            } catch (err: any) {
              toolOutputs.push({ type: "error", content: `Google Contacts error: ${err.message}` });
            }
          }
          // -- Specialized Research --
          else if (call.name === "research_specialized") {
            const { topic, source } = call.args as any;
            try {
              let searchUrl = `https://www.google.com/search?q=${encodeURIComponent(topic)}`;
              if (source === "finance")
                searchUrl = `https://finance.yahoo.com/search?q=${encodeURIComponent(topic)}`;
              else if (source === "arxiv")
                searchUrl = `https://arxiv.org/search/?query=${encodeURIComponent(topic)}&searchtype=all`;

              const res = await fetch(
                `/api/browse?url=${encodeURIComponent(searchUrl)}`,
              );
              const data = await res.json();
              toolOutputs.push({
                type: "success",
                service: "research",
                content: `Specialized research from ${source} for "${topic}" completed.`,
                meta: { data: data.content, source },
              });
              triggerHaptic(ImpactStyle.Medium);
            } catch (err: any) {
              toolOutputs.push({
                type: "error",
                content: `Research failed: ${err.message}`,
              });
            }
          }
          // -- Narrative Video --
          else if (call.name === "generate_narrative_video") {
            const { title, theme, scenes } = call.args as any;
            setNarrativeVideoData({ title, theme, scenes });
            toolOutputs.push({
              type: "success",
              content: `Immersive narrative video "${title}" prepared for playback.`,
            });
            triggerHaptic(ImpactStyle.Heavy);
          }
          // -- Timeline --
          else if (call.name === "generate_timeline") {
            const { items } = call.args as any;
            toolOutputs.push({
              type: "success",
              content: "Timeline generated.",
              meta: { items, type: "timeline" }
            });
            triggerHaptic(ImpactStyle.Light);
          }
          // -- Comparison Matrix --
          else if (call.name === "generate_comparison_matrix") {
            const { headers, rows } = call.args as any;
            toolOutputs.push({
              type: "success",
              content: "Comparison matrix generated.",
              meta: { headers, rows, type: "comparison_matrix" }
            });
            triggerHaptic(ImpactStyle.Medium);
          }
          // -- Worldbuilding Helper --
          else if (call.name === "worldbuilding_helper") {
            const { type, theme, prompt } = call.args as any;
            // This is primarily a cognitive tool, but we can add a visual signifier
            toolOutputs.push({
              type: "success",
              service: "artist",
              content: `Expanding world lore for ${theme} (${type}): ${prompt}`,
            });
            triggerHaptic(ImpactStyle.Medium);
          }
          // -- Python Execution --
          else if (call.name === "execute_python_analysis") {
            const { code } = call.args as any;
            try {
              const res = await fetch("/api/python", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code })
              });
              const data = await res.json();
              if (res.ok) {
                toolOutputs.push({
                  type: "success",
                  service: "genius",
                  content: `Python execution result:\n${data.output}`,
                  meta: { code, output: data.output, error: data.error }
                });
                botMsg.content = (botMsg.content || "") + `\n\n**Python Output:**\n\`\`\`\n${data.output}\n\`\`\``;
              } else {
                toolOutputs.push({ type: "error", content: `Python Error: ${data.error}` });
              }
            } catch (err: any) {
              toolOutputs.push({ type: "error", content: `Failed to reach python engine: ${err.message}` });
            }
          }
          // -- Browse Website --
          else if (call.name === "browse_website") {
            const { url } = call.args as any;
            try {
              // Add loading state
              const loadingOutput: ToolOutput = {
                type: "success",
                service: "research",
                content: "Browsing website...",
                meta: { url, loading: true }
              };
              toolOutputs.push(loadingOutput);
              botMsg.toolOutputs = [...toolOutputs];
              setState((prev) => ({
                ...prev,
                sessions: prev.sessions.map((s) => s.id === prev.currentSessionId ? { ...s, messages: s.messages.map(m => m.id === botMsg.id ? { ...m, toolOutputs: botMsg.toolOutputs } : m) } : s)
              }));

              const res = await fetch(`/api/browse?url=${encodeURIComponent(url)}`);
              const data = await res.json();
              
              // Remove loading state
              toolOutputs.pop();

              if (res.ok) {
                toolOutputs.push({
                  type: "success",
                  service: "research",
                  content: `Successfully browsed ${url}. Content extracted. Title: ${data.title}`,
                  meta: { url, markdown: data.markdown, title: data.title }
                });
                // Append context for model
                botMsg.content = (botMsg.content || "") + `\n\n**Source Analysis (${data.title}):**\n${data.markdown.substring(0, 2000)}...`;
              } else {
                toolOutputs.push({ type: "error", content: `Failed to browse ${url}: ${data.error}` });
              }
            } catch (e: any) {
              toolOutputs.pop(); // Remove loading state on error
              toolOutputs.push({ type: "error", content: `Browse error: ${e.message}` });
            }
          }
          // -- Screenshot Website --
          else if (call.name === "screenshot_website") {
            const { url } = call.args as any;
            try {
              // Add loading state
              const loadingOutput: ToolOutput = {
                type: "success",
                service: "research",
                content: "Capturing screenshot...",
                meta: { url, loading: true, screenshot_loading: true }
              };
              toolOutputs.push(loadingOutput);
              botMsg.toolOutputs = [...toolOutputs];
              setState((prev) => ({
                ...prev,
                sessions: prev.sessions.map((s) => s.id === prev.currentSessionId ? { ...s, messages: s.messages.map(m => m.id === botMsg.id ? { ...m, toolOutputs: botMsg.toolOutputs } : m) } : s)
              }));

              const res = await fetch(`/api/screenshot?url=${encodeURIComponent(url)}`);
              const data = await res.json();
              
              // Remove loading state
              toolOutputs.pop();

              if (res.ok && data.url) {
                toolOutputs.push({
                  type: "success",
                  service: "research",
                  content: `Screenshot captured for ${url}.`,
                  meta: { url, screenshot: data.url }
                });
                // Render screenshot in msg
                botMsg.generatedImage = data.url;
              } else {
                toolOutputs.push({ type: "error", content: `Failed to capture screenshot for ${url}` });
              }
            } catch (e: any) {
              toolOutputs.push({ type: "error", content: `Screenshot error: ${e.message}` });
            }
          }
        }
      }

      if (modes.includes('AgentSwarm')) {
        toolOutputs.push({
          type: "agent_swarm",
          service: "custom",
          content: "Elevated Agent Swarm Execution Started",
          meta: {
            query: msgText,
            timestamp: Date.now()
          }
        });
      }

      botMsg.toolOutputs = toolOutputs.length > 0 ? toolOutputs : undefined;

      setState((prev) => {
        const updatedSessions = prev.sessions.map((s) => {
          if (s.id === prev.currentSessionId) {
            const hasMsg = s.messages?.some((m) => m.id === botMsg.id);
            return {
              ...s,
              messages: hasMsg 
                ? s.messages.map((m) => (m.id === botMsg.id ? botMsg : m))
                : [...(s.messages || []), botMsg],
            };
          }
          return s;
        });

        // Save to Firebase
        if (prev.user) {
          const updatedSession = updatedSessions.find(
            (s) => s.id === prev.currentSessionId,
          );
          if (updatedSession) {
            saveSession(updatedSession, prev.user.uid).catch(console.error);
            saveMessage(
              { ...botMsg, sessionId: updatedSession.id },
              prev.user.uid,
            ).catch(console.error);
          }
        }

        return {
          ...prev,
          isLoading: false,
          sessions: updatedSessions,
        };
      });
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("quota")) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }
      addToast(err instanceof Error ? err.message : t("linkFailure"), "error");
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : t("linkFailure"),
      }));
    }
  };

  const handleSaveMemory = async (fact: string) => {
    if (!state.user) return;

    // Save to Firebase
    await saveMemory(fact, state.user.uid);

    const updatedVectorDb = await saveToVectorDb(
      fact,
      state.user.vectorDb || [],
    );

    setState((prev) => {
      const updatedUser = prev.user
        ? { ...prev.user, vectorDb: updatedVectorDb }
        : null;
      return { ...prev, user: updatedUser };
    });

    const savedUsersStr = localStorage.getItem("sofian_users");
    if (savedUsersStr) {
      try {
        const users = JSON.parse(savedUsersStr) as User[];
        const userIdx = users.findIndex((u) => u.email === state.user?.email);
        if (userIdx >= 0) {
          users[userIdx].vectorDb = updatedVectorDb;
          localStorage.setItem("sofian_users", JSON.stringify(users));
        }
      } catch (e) {
        console.warn(
          "LocalStorage quota exceeded for sofian_users, skipping save.",
          e,
        );
      }
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    setStopAllTrigger((prev) => prev + 1);
    const session = currentSession;
    const msgIndex = session.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const newHistory = session.messages.slice(0, msgIndex);
    const updatedMsg: Message = {
      ...session.messages[msgIndex],
      content: newContent,
    };

    setState((prev) => ({
      ...prev,
      isLoading: true,
      sessions: prev.sessions.map((s) =>
        s.id === prev.currentSessionId
          ? { ...s, messages: [...newHistory, updatedMsg] }
          : s,
      ),
    }));

    await processResponse(
      newContent,
      newHistory,
      updatedMsg,
      state.activeModes,
    );
  };

  const updateSettings = (updates: Partial<UserSettings>) => {
    console.log("Updating settings:", updates);
    setState((prev) => {
      const newSettings = { ...prev.settings, ...updates };
      if (prev.user) {
        updateUserSettings(prev.user.uid, newSettings).catch(console.error);
      }
      return { ...prev, settings: newSettings };
    });
  };

  const handleAuthSuccess = (user: User, token?: string) => {
    setState((p) => ({ ...p, user }));
    if (token) setGoogleAccessToken(token);
    setIsAuthOpen(false);
    if (user.isCreator) {
      const creatorMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: "Creator Verified.",
        timestamp: Date.now(),
        thought: "Auth: Creator",
      };
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === prev.currentSessionId
            ? { ...s, messages: [...(s.messages || []), creatorMsg] }
            : s,
        ),
      }));
    }
  };

  const addTaskManually = () => {
    if (!taskInput.trim()) return;
    setState((prev) => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        {
          id: generateId(),
          text: taskInput,
          completed: false,
          priority: taskPriority,
        },
      ],
    }));
    setTaskInput("");
  };

  const removeTask = (id: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
    }));
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      setSessionToDelete(null); // Close modal immediately

      // Update local state immediately
      setState((prev) => {
        const remainingSessions = prev.sessions.filter(
          (s) => s.id !== sessionId,
        );
        let nextSessionId = prev.currentSessionId;

        if (prev.currentSessionId === sessionId) {
          if (remainingSessions.length > 0) {
            nextSessionId = remainingSessions[0].id;
          } else {
            nextSessionId = generateId();
            return {
              ...prev,
              currentSessionId: nextSessionId,
              sessions: [
                {
                  id: nextSessionId,
                  title: t("newSession"),
                  messages: [],
                  modes: prev.activeModes,
                  timestamp: Date.now(),
                },
              ],
            };
          }
        }

        return {
          ...prev,
          currentSessionId: nextSessionId,
          sessions: remainingSessions,
        };
      });

      await deleteSession(sessionId);
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  };

  const handleDeleteAllSessions = async () => {
    try {
      setShowDeleteAllConfirm(false);
      const sessionIds = state.sessions.map((s) => s.id);
      
      const nextSessionId = generateId();
      setState((prev) => ({
        ...prev,
        currentSessionId: nextSessionId,
        sessions: [
          {
            id: nextSessionId,
            title: t("newSession"),
            messages: [],
            modes: prev.activeModes,
            timestamp: Date.now(),
          },
        ],
      }));

      await Promise.all(sessionIds.map((id) => deleteSession(id)));
      addToast("All sessions deleted.", "success");
    } catch (error) {
      console.error("Error deleting all sessions:", error);
      addToast("Failed to delete all sessions.", "error");
    }
  };

  const [isCreatingMode, setIsCreatingMode] = useState(false);
  const [newModeData, setNewModeData] = useState({
    label: "",
    icon: "🧠",
    systemInstruction: "",
  });

  const handleCreateCustomMode = async () => {
    if (!state.user) {
      setIsAuthOpen(true);
      return;
    }
    if (!newModeData.label || !newModeData.systemInstruction) return;

    const newMode: any = {
      // Using any as MindMode is not exported from types
      id: `custom-${Date.now()}`,
      label: newModeData.label,
      icon: newModeData.icon,
      systemInstruction: newModeData.systemInstruction,
      userId: state.user.uid,
      createdAt: new Date(),
    };

    try {
      const { saveCustomMode } = await import("./services/firebaseService");
      await saveCustomMode(newMode);
      setIsCreatingMode(false);
      setNewModeData({ label: "", icon: "🧠", systemInstruction: "" });
    } catch (e) {
      console.error("Failed to save custom mode", e);
    }
  };

  const toggleMode = (id: MindState | string) => {
    setState((prev) => {
      const current = prev.activeModes || [];
      if (current.includes(id as MindState)) {
        if (current.length <= 1) return prev;
        return { ...prev, activeModes: current.filter((m) => m !== id) };
      }
      return { ...prev, activeModes: [...current, id as MindState] };
    });
  };

  const allAvailableModes = [...MIND_MODES, ...(state.customModes || [])];
  const currentModeData =
    state.activeModes && state.activeModes.length > 0
      ? allAvailableModes.find((m) => m.id === state.activeModes[0]) ||
        MIND_MODES[0]
      : MIND_MODES[0];

  const formatSessionTime = (session: ChatSession) => {
    let timestamp = session.timestamp;
    if (session.messages && session.messages.length > 0) {
      for (let i = session.messages.length - 1; i >= 0; i--) {
        if (session.messages[i].role === "user") {
          timestamp = session.messages[i].timestamp;
          break;
        }
      }
    }
    const date = new Date(timestamp);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (false) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-zinc-100 dark:bg-zinc-950 overflow-hidden flex items-center justify-center p-4 sm:p-6">
      {/* Decorative Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-zinc-100 to-zinc-200 dark:from-indigo-950/30 dark:via-zinc-950 dark:to-zinc-900 opacity-50" />

      {/* Modals */}
      <AnimatePresence>
        {isCameraActive && (
          <CameraOverlay
            key="camera-overlay"
            onClose={() => setIsCameraActive(false)}
            onCapture={(data) => {
              const att: Attachment = {
                data,
                mimeType: "image/jpeg",
                name: "Vision",
                fullData: `data:image/jpeg;base64,${data}`,
              };
              setAttachment(att);
              setIsCameraActive(false);
              // Open Editor immediately for capture
              setIsEditingImage(true);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditingImage && attachment && (
          <ImageEditor
            imageData={
              attachment.fullData ||
              `data:${attachment.mimeType};base64,${attachment.data}`
            }
            onCancel={() => setIsEditingImage(false)}
            onSave={(newData) => {
              const base64 = newData.split(",")[1];
              setAttachment({ ...attachment, data: base64, fullData: newData });
              setIsEditingImage(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sessionToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setSessionToDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mb-4 text-red-500">
                <Icons.Trash className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-black dark:text-white mb-2">
                {t("deleteSession")}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 px-2">
                {t("confirmDelete")}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setSessionToDelete(null)}
                  className="flex-1 py-3 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-bold text-sm hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
                >
                  {t("no")}
                </button>
                <button
                  onClick={() => handleDeleteSession(sessionToDelete)}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-500 transition-all shadow-lg shadow-red-600/20"
                >
                  {t("yes")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteAllConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowDeleteAllConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mb-4 text-red-500 animate-pulse">
                <Icons.Trash className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-black dark:text-white mb-2">
                {t("deleteAllSessions")}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 px-2">
                {t("confirmDeleteAll")}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowDeleteAllConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-bold text-sm hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleDeleteAllSessions}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-500 transition-all shadow-lg shadow-red-600/20"
                >
                  {t("yes")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAuthOpen && (
          <AuthModal
            key="auth-modal"
            onClose={() => setIsAuthOpen(false)}
            onSuccess={handleAuthSuccess}
            language={state.settings.language}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal
            key="settings-modal"
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            user={state.user}
            settings={state.settings}
            onUpdateSettings={updateSettings}
            onLogout={() => {
              setState((p) => ({ ...p, user: null }));
              setIsSettingsOpen(false);
            }}
            onDeleteAllSessions={() => setShowDeleteAllConfirm(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreatingMode && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <h2 className="text-xl font-bold text-black dark:text-white mb-4">
                {t("createCustomMode")}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    {t("modeName")}
                  </label>
                  <input
                    type="text"
                    value={newModeData.label}
                    onChange={(e) =>
                      setNewModeData({ ...newModeData, label: e.target.value })
                    }
                    placeholder={t("egCodingMentor")}
                    className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-black dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    {t("iconEmoji")}
                  </label>
                  <input
                    type="text"
                    value={newModeData.icon}
                    onChange={(e) =>
                      setNewModeData({ ...newModeData, icon: e.target.value })
                    }
                    placeholder={t("egIcon")}
                    maxLength={2}
                    className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-black dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    {t("systemInstruction")}
                  </label>
                  <textarea
                    value={newModeData.systemInstruction}
                    onChange={(e) =>
                      setNewModeData({
                        ...newModeData,
                        systemInstruction: e.target.value,
                      })
                    }
                    placeholder={t("egSystemInstruction")}
                    rows={4}
                    className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-black dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setIsCreatingMode(false)}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleCreateCustomMode}
                  disabled={
                    !newModeData.label || !newModeData.systemInstruction
                  }
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("createMode")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="relative w-full h-full max-w-[1600px] max-h-[1000px] flex flex-row overflow-hidden rounded-3xl border shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] dark:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] transition-all duration-500 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl text-zinc-900 dark:text-zinc-100 border-zinc-200/50 dark:border-zinc-800/50">
        {/* Decorative Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-zinc-100 to-zinc-200 dark:from-indigo-950/30 dark:via-zinc-950 dark:to-zinc-900 opacity-50 -z-10" />

        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.aside
              key="main-sidebar"
              initial={{ x: isRTL ? 320 : -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: isRTL ? 320 : -320, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed inset-y-0 start-0 w-[300px] bg-white/95 dark:bg-zinc-950/95 backdrop-blur-3xl border-e border-zinc-200/50 dark:border-zinc-800/50 z-[70] flex flex-col shadow-2xl"
            >
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
                    <Icons.Logo className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold tracking-tight text-zinc-900 dark:text-white">
                      SOFIAN AI
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-medium tracking-widest uppercase">
                      Version 2.5
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors bg-black/5 dark:bg-white/5 rounded-xl"
                  title={t("closeSidebar")}
                >
                  <Icons.Close className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-4">
                <button
                  onClick={() => {
                    const id = generateId();
                    setState((p) => ({
                      ...p,
                      currentSessionId: id,
                      sessions: [
                        {
                          id,
                          title: t("newSession"),
                          messages: [],
                          modes: p.activeModes,
                          timestamp: Date.now(),
                        },
                        ...p.sessions,
                      ],
                    }));
                    setIsSidebarOpen(false);
                  }}
                  className="w-full py-3.5 bg-indigo-600 rounded-2xl text-[11px] font-bold text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                  title={t("newSession")}
                >
                  <Icons.Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />{" "}
                  {t("newSession").toUpperCase()}
                </button>
              </div>

              <div className="flex p-1.5 bg-zinc-100/50 dark:bg-zinc-900/50 rounded-2xl mx-4 mb-4 border border-zinc-200/50 dark:border-zinc-800/50">
                {(["history", "tasks"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === tab ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm dark:shadow-lg" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                  >
                    {t(tab)}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6">
                {activeTab === "history" && (
                  <>
                    {(() => {
                      const filteredSessions = state.sessions;
                      const favorites = filteredSessions
                        .filter((s) => s.isFavorite)
                        .sort(
                          (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
                        );
                      const recents = filteredSessions
                        .filter((s) => !s.isFavorite)
                        .sort(
                          (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
                        );

                      return (
                        <>
                          {favorites.length > 0 && (
                            <div className="space-y-2">
                              <h3 className="px-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <Icons.Star className="w-3 h-3 text-yellow-500 fill-current" />
                                {t("favorites")}
                              </h3>
                              <div className="space-y-1">
                                {favorites.map((s) => (
                                  <div
                                    key={s.id}
                                    className="group flex items-center gap-1"
                                  >
                                    <button
                                      onClick={() => {
                                        setState((p) => ({
                                          ...p,
                                          currentSessionId: s.id,
                                          activeModes: s.modes,
                                        }));
                                        setIsSidebarOpen(false);
                                      }}
                                      className={`flex-1 min-w-0 p-3 rounded-xl text-start transition-all border ${state.currentSessionId === s.id ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white shadow-md" : "bg-transparent border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-200"}`}
                                    >
                                      <div className="flex justify-between items-center">
                                        <div className="flex-1 min-w-0">
                                          <span className="font-semibold truncate text-[12px] block">
                                            {s.title === "New Session" ||
                                            !s.title
                                              ? t("newSession")
                                              : s.title}
                                          </span>
                                          <span className="text-[9px] text-zinc-500 font-medium mt-0.5 block">
                                            {formatSessionTime(s)}
                                          </span>
                                        </div>
                                      </div>
                                    </button>
                                    <button
                                      onClick={(e) => toggleFavorite(s.id, e)}
                                      className="p-2 text-yellow-500 hover:bg-yellow-500/10 rounded-lg shrink-0 transition-all"
                                      title={t("unfavorite")}
                                    >
                                      <Icons.Star className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            <h3 className="px-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                              {t("recent")}
                            </h3>
                            {recents.length === 0 ? (
                              <p className="px-2 text-xs text-zinc-500 italic">
                                No sessions found.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {recents.map((s) => (
                                  <div
                                    key={s.id}
                                    className="group flex items-center gap-1"
                                  >
                                    <button
                                      onClick={() => {
                                        setState((p) => ({
                                          ...p,
                                          currentSessionId: s.id,
                                          activeModes: s.modes,
                                        }));
                                        setIsSidebarOpen(false);
                                      }}
                                      className={`flex-1 min-w-0 p-3 rounded-xl text-start transition-all border ${state.currentSessionId === s.id ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white shadow-md" : "bg-transparent border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-200"}`}
                                    >
                                      <div className="flex justify-between items-center">
                                        <div className="flex-1 min-w-0">
                                          <span className="font-semibold truncate text-[12px] block">
                                            {s.title === "New Session" ||
                                            !s.title
                                              ? t("newSession")
                                              : s.title}
                                          </span>
                                          <span className="text-[9px] text-zinc-500 font-medium mt-0.5 block">
                                            {formatSessionTime(s)}
                                          </span>
                                        </div>
                                      </div>
                                    </button>
                                    <div className="flex items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                                      <button
                                        onClick={(e) => toggleFavorite(s.id, e)}
                                        className="p-2 text-zinc-500 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-lg shrink-0 transition-all"
                                        title={t("favorite")}
                                      >
                                        <Icons.Star className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSessionToDelete(s.id);
                                        }}
                                        className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg shrink-0 transition-all"
                                        title={t("deleteSession")}
                                      >
                                        <Icons.Trash className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
                {activeTab === "tasks" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2 py-1">
                      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        {t("tasks")}
                      </h3>
                      <div className="flex items-center gap-1">
                        {[5, 10, 30].map((sec) => (
                          <button
                            key={sec}
                            onClick={() => {
                              addToast(
                                `${t("timerTest")}: ${sec}s started...`,
                                "info",
                              );
                              setTimeout(() => {
                                addToast(
                                  `${t("timerTest")} (${sec}s) Successful!`,
                                  "success",
                                );
                              }, sec * 1000);
                            }}
                            className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 rounded-lg text-[9px] font-bold transition-all"
                          >
                            {sec}s
                          </button>
                        ))}
                        <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 mx-1" />
                        <button
                          onClick={() => {
                            addToast("Neural Link Active!", "success");
                          }}
                          className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 rounded-lg transition-all group"
                          title="Test notification system"
                        >
                          <Icons.Activity className="w-3 h-3 group-hover:animate-pulse" />
                        </button>
                      </div>
                    </div>

                    {/* Progress Header */}
                    {state.tasks.length > 0 && (
                      <div className="p-4 bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            {t("progress")}
                          </span>
                          <span className="text-[10px] font-bold text-indigo-500">
                            {Math.round(
                              (state.tasks.filter((t) => t.completed).length /
                                state.tasks.length) *
                                100,
                            )}
                            %
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(state.tasks.filter((t) => t.completed).length / state.tasks.length) * 100}%`,
                            }}
                            className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Input Area */}
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={taskInput}
                          onChange={(e) => setTaskInput(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && addTaskManually()
                          }
                          placeholder={t("addTask")}
                          className="w-full bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl ps-4 pe-12 py-3 text-xs focus:outline-none focus:border-indigo-500 transition-all"
                        />
                        <button
                          onClick={addTaskManually}
                          className="absolute end-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 shadow-lg active:scale-95 transition-all"
                        >
                          <Icons.Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex gap-1">
                        {(["high", "medium", "low"] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setTaskPriority(p)}
                            className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-tighter transition-all border ${
                              taskPriority === p
                                ? p === "high"
                                  ? "bg-red-500/10 border-red-500/50 text-red-500"
                                  : p === "medium"
                                    ? "bg-amber-500/10 border-amber-500/50 text-amber-500"
                                    : "bg-emerald-500/10 border-emerald-500/50 text-emerald-500"
                                : "bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {t(`${p}Priority` as any)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Task List */}
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {state.tasks
                          .sort((a, b) => {
                            if (a.completed !== b.completed)
                              return a.completed ? 1 : -1;
                            const pMap = { high: 0, medium: 1, low: 2 };
                            return pMap[a.priority] - pMap[b.priority];
                          })
                          .map((task) => (
                            <motion.div
                              key={task.id}
                              layout
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className={`group/task flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                                task.completed
                                  ? "bg-zinc-100/30 dark:bg-zinc-900/20 border-zinc-200 dark:border-zinc-800/30 opacity-60"
                                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700"
                              }`}
                            >
                              <button
                                onClick={() =>
                                  setState((p) => ({
                                    ...p,
                                    tasks: p.tasks.map((x) =>
                                      x.id === task.id
                                        ? { ...x, completed: !x.completed }
                                        : x,
                                    ),
                                  }))
                                }
                                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-500 relative overflow-hidden group/task-toggle ${
                                  task.completed
                                    ? "bg-indigo-600 border-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                                    : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
                                }`}
                              >
                                {task.completed && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600"
                                  />
                                )}
                                <Icons.Check
                                  className={`w-3 h-3 relative z-10 transition-all duration-300 ${task.completed ? "text-white scale-110" : "text-transparent"}`}
                                />
                              </button>
                              <span
                                className={`text-xs flex-1 font-medium leading-tight ${task.completed ? "line-through text-zinc-400 dark:text-zinc-600" : "text-zinc-800 dark:text-zinc-200"}`}
                              >
                                {task.text}
                              </span>
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    setActiveReminderTaskId(
                                      activeReminderTaskId === task.id
                                        ? null
                                        : task.id,
                                    );
                                  }}
                                  className={`p-1.5 rounded-lg transition-all ${task.reminderAt ? "text-indigo-500 bg-indigo-500/10 opacity-100" : "text-zinc-400 dark:text-zinc-600 hover:text-indigo-500 hover:bg-indigo-500/10 opacity-0 group-hover/task:opacity-100"}`}
                                  title={t("remindMe")}
                                >
                                  <Icons.Bell className="w-3.5 h-3.5" />
                                </button>

                                <AnimatePresence>
                                  {activeReminderTaskId === task.id && (
                                    <motion.div
                                      initial={{
                                        opacity: 0,
                                        scale: 0.9,
                                        y: 10,
                                      }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                      className="absolute end-0 bottom-full mb-2 w-32 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden"
                                    >
                                      <div className="p-1 flex flex-col gap-0.5">
                                        {task.reminderAt && (
                                          <>
                                            <button
                                              onClick={() => {
                                                setState((p) => ({
                                                  ...p,
                                                  tasks: p.tasks.map((x) =>
                                                    x.id === task.id
                                                      ? {
                                                          ...x,
                                                          reminderAt: undefined,
                                                        }
                                                      : x,
                                                  ),
                                                }));
                                                setActiveReminderTaskId(null);
                                              }}
                                              className="px-3 py-2 text-[10px] font-bold text-left text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                                            >
                                              <Icons.Trash className="w-3 h-3" />
                                              {t("clearReminder" as any)}
                                            </button>
                                            <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-0.5" />
                                          </>
                                        )}
                                        {[
                                          { label: "5 sec", val: 5 * 1000 },
                                          {
                                            label: t("in10Sec"),
                                            val: 10 * 1000,
                                          },
                                          {
                                            label: t("in5Min"),
                                            val: 5 * 60 * 1000,
                                          },
                                          {
                                            label: t("in1Hour"),
                                            val: 60 * 60 * 1000,
                                          },
                                          {
                                            label: t("tomorrow"),
                                            val: 24 * 60 * 60 * 1000,
                                          },
                                        ].map((opt) => (
                                          <button
                                            key={opt.val}
                                            onClick={() => {
                                              requestNotificationPermission();
                                              const reminderAt =
                                                Date.now() + opt.val;
                                              setState((p) => ({
                                                ...p,
                                                tasks: p.tasks.map((x) =>
                                                  x.id === task.id
                                                    ? { ...x, reminderAt }
                                                    : x,
                                                ),
                                              }));
                                              setActiveReminderTaskId(null);
                                            }}
                                            className="px-3 py-2 text-[10px] font-bold text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                        <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-0.5" />
                                        <div className="px-3 py-2 flex flex-col gap-1.5">
                                          <div className="flex items-center gap-1.5 text-zinc-500">
                                            <Icons.Calendar className="w-3 h-3" />
                                            <span className="text-[9px] font-bold uppercase tracking-wider">
                                              {t("custom")}
                                            </span>
                                          </div>
                                          <input
                                            type="datetime-local"
                                            className="px-2 py-1.5 text-[10px] bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 rounded-lg focus:ring-0 w-full dark:text-white cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                            onChange={(e) => {
                                              const val = new Date(
                                                e.target.value,
                                              ).getTime();
                                              if (val > Date.now()) {
                                                setState((p) => ({
                                                  ...p,
                                                  tasks: p.tasks.map((x) =>
                                                    x.id === task.id
                                                      ? {
                                                          ...x,
                                                          reminderAt: val,
                                                        }
                                                      : x,
                                                  ),
                                                }));
                                                setActiveReminderTaskId(null);
                                              }
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                              <div
                                className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)] ${
                                  task.priority === "high"
                                    ? "bg-red-500 shadow-red-500/50"
                                    : task.priority === "medium"
                                      ? "bg-amber-500 shadow-amber-500/50"
                                      : "bg-emerald-500 shadow-emerald-500/50"
                                }`}
                              />
                              <button
                                onClick={() => removeTask(task.id)}
                                className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover/task:opacity-100 transition-all hover:bg-red-500/10 rounded-lg"
                              >
                                <Icons.Trash className="w-3.5 h-3.5" />
                              </button>
                            </motion.div>
                          ))}
                      </AnimatePresence>

                      {state.tasks.length === 0 && (
                        <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                            <Icons.Check className="w-6 h-6" />
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-widest">
                            {t("noTasks")}
                          </p>
                        </div>
                      )}
                    </div>

                    {state.tasks.some((t) => t.completed) && (
                      <button
                        onClick={() =>
                          setState((p) => ({
                            ...p,
                            tasks: p.tasks.filter((t) => !t.completed),
                          }))
                        }
                        className="w-full py-2.5 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-red-500 hover:border-red-500/50 hover:bg-red-500/5 transition-all"
                      >
                        {t("clearCompleted")}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 mt-auto bg-zinc-100/50 dark:bg-black/20">
                {state.sessions.length > 0 && (
                  <button
                    onClick={() => setShowDeleteAllConfirm(true)}
                    className="w-full mb-3 py-2.5 rounded-xl border border-dashed border-red-500/20 hover:border-red-500/50 text-[10px] font-bold uppercase tracking-widest text-red-500/80 hover:text-red-500 transition-all text-center flex items-center justify-center gap-1.5 hover:bg-red-500/5 active:scale-[0.98]"
                    title={t("deleteAllSessions")}
                  >
                    <Icons.Trash className="w-3.5 h-3.5" />
                    {t("deleteAllSessions")}
                  </button>
                )}
                {state.user ? (
                  <div
                    className="flex items-center gap-4 p-3 bg-white dark:bg-white/5 rounded-2xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/10 transition-all border border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/10 group shadow-sm"
                    onClick={() => setIsSettingsOpen(true)}
                    title={t("settings")}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-lg ${state.user.isCreator ? "bg-amber-500 text-black shadow-amber-500/20" : "bg-indigo-600 text-white shadow-indigo-600/20"}`}
                    >
                      {state.user.displayName?.[0] || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {state.user.displayName || t("user")}
                      </p>
                      <p
                        className={`text-[9px] truncate uppercase tracking-widest font-bold ${state.user.isCreator ? "text-amber-500" : "text-zinc-500"}`}
                      >
                        {state.user.isCreator ? t("architect") : t("verified")}
                      </p>
                    </div>
                    <Icons.Settings className="w-4 h-4 text-zinc-400 dark:text-zinc-500 group-hover:rotate-90 transition-transform" />
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAuthOpen(true)}
                    className="w-full py-3.5 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl text-[10px] font-bold hover:bg-zinc-100 dark:hover:bg-white/10 transition-all uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white shadow-sm"
                    title={t("connectAccount")}
                  >
                    {t("connectAccount")}
                  </button>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              key="sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60]"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <main className="flex-1 flex flex-col h-full min-w-0 bg-zinc-50 dark:bg-[#050505] transition-all duration-500 relative">
          <header className="flex items-center justify-between px-6 py-4 bg-white/50 dark:bg-black/50 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2.5 bg-zinc-100 dark:bg-zinc-900 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all border border-zinc-200 dark:border-zinc-800/50 text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white shadow-sm active:scale-95"
              >
                <Icons.Logo className="w-5 h-5" />
              </button>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 italic font-serif">
                    {currentSession.title === "New Session" ||
                    !currentSession.title
                      ? t("newSession")
                      : currentSession.title}
                  </h2>
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"}`}
                    title={isOnline ? "Online" : "Offline"}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (!state.user) {
                    addToast(
                      "You must be logged in to share this session.",
                      "error",
                    );
                    return;
                  }

                  const joinUrl = `${window.location.origin}/?session=${currentSession.id}`;
                  try {
                    await navigator.clipboard.writeText(joinUrl);

                    // Update session to public
                    const updatedSession = {
                      ...currentSession,
                      isPublic: true,
                    };
                    setState((prev) => ({
                      ...prev,
                      sessions: prev.sessions.map((s) =>
                        s.id === currentSession.id ? updatedSession : s,
                      ),
                    }));
                    saveSession(updatedSession, state.user.uid).catch(
                      console.error,
                    );

                    addToast(
                      "Link copied! Session is now actively shared.",
                      "success",
                    );
                  } catch (err) {
                    addToast("Failed to copy link.", "error");
                  }
                }}
                className={`p-2.5 rounded-xl transition-all border shadow-sm active:scale-95 ${currentSession.isPublic ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400" : "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800/50 text-zinc-500 dark:text-zinc-400 hover:text-indigo-500 hover:border-indigo-500/50"}`}
                title={
                  currentSession.isPublic
                    ? "Session is Shared"
                    : "Share Live Session"
                }
              >
                <Icons.Share className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsCameraActive(true)}
                className="p-2.5 bg-zinc-100 dark:bg-zinc-900 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all border border-zinc-200 dark:border-zinc-800/50 text-indigo-500 dark:text-indigo-400 shadow-sm active:scale-95"
                title="Take a photo"
              >
                <Icons.Camera className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-8 no-scrollbar scroll-smooth relative"
          >
            <AnimatePresence>
              {showScrollButton && (
                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  onClick={() => scrollToBottom("smooth")}
                  className="fixed bottom-32 end-8 p-3 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-2xl z-50 text-indigo-500 hover:scale-110 active:scale-95 transition-all group"
                  title={t("scrollToBottom")}
                >
                  <Icons.ArrowDown className="w-5 h-5" />
                  <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl border border-white/10 uppercase tracking-widest font-bold">
                    {t("scrollToBottom")}
                  </span>
                </motion.button>
              )}
            </AnimatePresence>

            <motion.div
              layout
              className={`max-w-7xl mx-auto transition-all duration-700 ease-[0.16, 1, 0.3, 1] ${state.settings.focusMode ? "scale-[1.02]" : ""}`}
            >
              <AnimatePresence mode="popLayout">
                {(!currentSession.messages ||
                  currentSession.messages.length === 0) && (
                  <motion.div
                    key="empty-state"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-center justify-center min-h-[60vh] text-center"
                  >
                    <div className="relative mb-8">
                      <motion.div
                        animate={{
                          scale: [1, 1.05, 1],
                          rotate: [0, 2, -2, 0],
                          boxShadow: [
                            "0 20px 50px rgba(99,102,241,0.4)",
                            "0 20px 70px rgba(168,85,247,0.5)",
                            "0 20px 50px rgba(99,102,241,0.4)",
                          ],
                        }}
                        transition={{
                          duration: 8,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                        className="w-24 h-24 rounded-[2.5rem] bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center relative overflow-hidden neural-glow"
                      >
                        <Icons.Logo className="w-12 h-12 text-white relative z-10" />
                        <motion.div
                          animate={{
                            opacity: [0.2, 0.4, 0.2],
                            scale: [1, 1.2, 1],
                          }}
                          transition={{ duration: 4, repeat: Infinity }}
                          className="absolute inset-0 bg-white/20 blur-2xl"
                        />
                      </motion.div>
                      <div className="absolute -bottom-2 -end-2 w-8 h-8 bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center shadow-lg border border-zinc-200 dark:border-zinc-800">
                        <span className="text-xs animate-pulse">✨</span>
                      </div>
                    </div>
                    <h3 className="text-5xl font-display font-bold mb-3 tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-zinc-900 via-indigo-950 to-zinc-500 dark:from-white dark:via-indigo-200 dark:to-zinc-500">
                      Sofian AI
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-[320px] leading-relaxed font-medium tracking-wide">
                      {t("tagline")}
                    </p>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="mt-12 flex gap-4 items-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600"
                    >
                      <div className="w-8 h-px bg-zinc-200 dark:bg-zinc-800" />
                      <span>Neural Core Active</span>
                      <div className="w-8 h-px bg-zinc-200 dark:bg-zinc-800" />
                    </motion.div>
                  </motion.div>
                )}
                {(currentSession.messages || []).map((m, idx) => {
                  return (
                    <ChatMessage
                      key={m.id}
                      message={m}
                      stopAllTrigger={stopAllTrigger}
                      onSuggestionClick={(s) => handleSendMessage(s)}
                      onSave={(msg) =>
                        setState((p) => ({
                          ...p,
                          savedMessages: p.savedMessages.some(
                            (sm) => sm.id === msg.id,
                          )
                            ? p.savedMessages.filter((sm) => sm.id !== msg.id)
                            : [...p.savedMessages, msg],
                        }))
                      }
                      onEdit={(newContent) =>
                        handleEditMessage(m.id, newContent)
                      }
                      onCameraClick={() => setIsCameraActive(true)}
                      onSettingsClick={() => setIsSettingsOpen(true)}
                      focusMode={state.settings.focusMode}
                      language={state.settings.language}
                    />
                  );
                })}
                {Object.values(remoteTyping).some((isTyping) => isTyping) &&
                  !state.isLoading && (
                    <motion.div
                      key="remote-typing-indicator"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-start gap-1 ps-4 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-500/10 flex items-center justify-center">
                          <Icons.User className="w-4 h-4 text-zinc-400 animate-pulse" />
                        </div>
                        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm mt-1">
                          <motion.span
                            animate={{ y: [0, -5, 0] }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              delay: 0,
                            }}
                            className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
                          />
                          <motion.span
                            animate={{ y: [0, -5, 0] }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              delay: 0.2,
                            }}
                            className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
                          />
                          <motion.span
                            animate={{ y: [0, -5, 0] }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              delay: 0.4,
                            }}
                            className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                {state.isLoading && (
                  <motion.div
                    key="loading-indicator"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-start gap-1 ps-4 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                        <Icons.Logo className="w-4 h-4 text-indigo-400 animate-pulse" />
                      </div>
                      <div className="flex flex-col">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest animate-pulse flex items-center gap-2 h-4">
                          <div className="w-1 h-1 rounded-full bg-indigo-500" />
                          <span>{t("thinking")}</span>
                        </div>
                        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm mt-1">
                          <motion.span
                            animate={{ y: [0, -5, 0] }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              delay: 0,
                            }}
                            className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                          />
                          <motion.span
                            animate={{ y: [0, -5, 0] }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              delay: 0.2,
                            }}
                            className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                          />
                          <motion.span
                            animate={{ y: [0, -5, 0] }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              delay: 0.4,
                            }}
                            className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} className="h-2" />
              </AnimatePresence>
            </motion.div>
          </div>

          <footer className="p-6 bg-white/80 dark:bg-black/80 backdrop-blur-xl">
            <div className="max-w-4xl mx-auto">
              <AnimatePresence>
                {isModeMenuOpen && (
                  <motion.div
                    key="mode-menu"
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    className="mb-4 grid grid-cols-4 sm:grid-cols-8 gap-2 p-3 bg-zinc-100 dark:bg-zinc-900/80 backdrop-blur-2xl rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl"
                  >
                    {allAvailableModes.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => toggleMode(m.id)}
                        className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl transition-all ${state.activeModes.includes(m.id as MindState) ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400"}`}
                      >
                        <span className="text-xl">{m.icon}</span>
                        <span className="text-[9px] font-bold uppercase tracking-tighter">
                          {m.label}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <ChatInput
                ref={chatInputRef}
                onSendMessage={handleSendMessage}
                onTyping={(isTyping) => {
                  if (socket && state.currentSessionId && state.user) {
                    socket.emit("typing", {
                      roomId: state.currentSessionId,
                      isTyping,
                      userId: state.user.uid,
                    });
                  }
                }}
                activeModes={state.activeModes}
                settings={state.settings}
                isModeMenuOpen={isModeMenuOpen}
                setIsModeMenuOpen={setIsModeMenuOpen}
                currentModeData={currentModeData}
                attachment={attachment}
                setAttachment={setAttachment}
                onUpdateSettings={(s) =>
                  setState((p) => ({ ...p, settings: { ...p.settings, ...s } }))
                }
                onOpenLiveVoice={() => setIsVoiceModeOpen(true)}
                onEditImage={() => setIsEditingImage(true)}
              />
            </div>
          </footer>
        </main>
      </div>

      {/* Toast Container */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
        {state.toasts?.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 min-w-[200px] pointer-events-auto ${
              toast.type === "error"
                ? "bg-red-500/10 border-red-500/20 text-red-500"
                : toast.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                  : "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
            }`}
          >
            {toast.type === "error" ? (
              <Icons.Bug className="w-4 h-4" />
            ) : (
              <Icons.Bell className="w-4 h-4" />
            )}
            <span className="text-xs font-bold">{toast.message}</span>
            <button
              onClick={() =>
                setState((p) => ({
                  ...p,
                  toasts: p.toasts.filter((t) => t.id !== toast.id),
                }))
              }
              className="ms-auto p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
            >
              <Icons.Close className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isVoiceModeOpen && (
          <LiveVoiceMode
            systemInstruction={getSystemInstruction(
              state.activeModes,
              state.settings,
              state.user?.memory || [],
              undefined,
              undefined,
              undefined,
              undefined,
              state.user?.email,
            )}
            onClose={() => setIsVoiceModeOpen(false)}
            onTranscriptMessage={(role, text) => {
              const newMsg: Message = {
                id: crypto.randomUUID(),
                role: role,
                content: text,
                timestamp: new Date().toISOString(),
              };
              setState((p) => {
                const activeSession = p.sessions.find(
                  (s) => s.id === p.currentSessionId,
                );
                if (!activeSession) return p;
                const updatedSession = {
                  ...activeSession,
                  messages: [...activeSession.messages, newMsg],
                };
                return {
                  ...p,
                  sessions: p.sessions.map((s) =>
                    s.id === updatedSession.id ? updatedSession : s,
                  ),
                };
              });
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {narrativeVideoData && (
          <NarrativePresentation
            title={narrativeVideoData.title}
            theme={narrativeVideoData.theme}
            scenes={narrativeVideoData.scenes}
            onClose={() => setNarrativeVideoData(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
