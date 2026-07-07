import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icons } from "../constants";
import { Attachment, MindState, UserSettings } from "../types";
import { useTranslation } from "../translations";

interface ChatInputProps {
  onSendMessage: (text: string, attachment?: Attachment) => void;
  onTyping?: (isTyping: boolean) => void;
  activeModes: MindState[];
  settings: UserSettings;
  isModeMenuOpen: boolean;
  setIsModeMenuOpen: (open: boolean) => void;
  currentModeData: any;
  attachment: Attachment | null;
  setAttachment: (att: Attachment | null) => void;
  onUpdateSettings: (s: Partial<UserSettings>) => void;
  onOpenLiveVoice?: () => void;
  onEditImage?: () => void;
}

export interface ChatInputRef {
  appendInput: (text: string) => void;
}

const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  (
    {
      onSendMessage,
      onTyping,
      activeModes,
      settings,
      isModeMenuOpen,
      setIsModeMenuOpen,
      currentModeData,
      attachment,
      setAttachment,
      onUpdateSettings,
      onOpenLiveVoice,
      onEditImage,
    },
    ref,
  ) => {
    const { t } = useTranslation(settings.language || "en");
    const [input, setInput] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [isProcessingAudio, setIsProcessingAudio] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      appendInput: (text: string) => {
        setInput((prev) => (prev ? prev + " " : "") + text);
      },
    }));

    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height =
          Math.min(textareaRef.current.scrollHeight, 60) + "px";
      }
    }, [input]);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      if (onTyping) {
        onTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          onTyping(false);
        }, 1500);
      }
    };

    const handleToggleDictation = async () => {
      if (isListening) {
        // Stop recording
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream
            .getTracks()
            .forEach((track) => track.stop());
        }
        setIsListening(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          audioChunksRef.current = [];

          setIsProcessingAudio(true);
          try {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
              const base64data = (reader.result as string).split(",")[1];
              // Import dynamically to avoid circular dependencies
              const { transcribeAudio } =
                await import("../services/neuralService");
              const transcription = await transcribeAudio(
                base64data,
                "audio/webm",
              );
              if (transcription) {
                setInput((prev) => prev + (prev ? " " : "") + transcription);
              }
              setIsProcessingAudio(false);
            };
          } catch (e) {
            console.error("Transcription error:", e);
            alert("Failed to transcribe audio.");
            setIsProcessingAudio(false);
          }
        };

        mediaRecorder.start();
        setIsListening(true);
      } catch (e: any) {
        console.error("Failed to start recording:", e);
        alert("Microphone permission denied or not available. " + String(e));
        setIsListening(false);
      }
    };

    return (
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 35, delay: 0.2 }}
        className="w-full flex flex-col gap-2 relative group/input bg-white/80 dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] transition-all duration-300 focus-within:border-indigo-500/50 focus-within:bg-white dark:focus-within:bg-zinc-900/60"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() || attachment) {
                if (isListening) {
                  handleToggleDictation();
                }
                onSendMessage(input, undefined);
                setInput("");
              }
            }
          }}
          placeholder={
            isListening
              ? t("stopDictating")
              : activeModes.includes("Artist")
                ? t("describeYourVision")
                : t("typeAMessage")
          }
          rows={1}
          className={`w-full px-5 py-4 bg-transparent text-[15px] font-medium focus:outline-none resize-none overflow-hidden max-h-48 min-h-[3rem] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all duration-300`}
        />

        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1.5 z-20">
            <button
              onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
              className={`h-10 px-3 rounded-2xl flex items-center justify-center gap-2 transition-all duration-500 relative overflow-hidden group/mode-toggle ${
                isModeMenuOpen
                  ? "bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] scale-105"
                  : "bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              {isModeMenuOpen && (
                <motion.div
                  layoutId="mode-toggle-glow"
                  className="absolute inset-0 bg-white/20 blur-md"
                />
              )}
              <span className="relative z-10 font-bold tracking-wide text-sm whitespace-nowrap transition-transform group-active/mode-toggle:scale-90 uppercase">
                {isModeMenuOpen ? (
                  <Icons.Close className="w-4 h-4" />
                ) : activeModes.length === 1 ? (
                  activeModes[0]
                ) : (
                  t("mix")
                )}
              </span>
            </button>

            <button
              onClick={handleToggleDictation}
              className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-500 relative overflow-hidden group/mic-toggle ${
                isListening
                  ? "text-white bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.4)] scale-110"
                  : "text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 border border-transparent hover:border-zinc-200/80 dark:hover:border-zinc-700/50"
              }`}
              title={isListening ? t("stopDictating") : t("dictate")}
            >
              {isListening && (
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-white/30 rounded-full"
                />
              )}
              {isProcessingAudio ? (
                <Icons.Logo className="w-5 h-5 relative z-10 animate-spin text-zinc-500" />
              ) : (
                <Icons.Mic
                  className={`w-5 h-5 relative z-10 transition-transform group-active/mic-toggle:scale-90 ${isListening ? "animate-pulse" : ""}`}
                />
              )}
            </button>

            {onOpenLiveVoice && (
              <button
                onClick={onOpenLiveVoice}
                className="w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-300 relative overflow-hidden group/live-toggle text-zinc-400 dark:text-zinc-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-100/80 dark:hover:bg-purple-900/40 border border-transparent hover:border-purple-200/80 dark:hover:border-purple-700/50"
                title="Live Voice Mode"
              >
                <Icons.Headphones className="w-5 h-5 relative z-10 transition-transform group-active/live-toggle:scale-90" />
              </button>
            )}

            <label className="w-10 h-10 flex items-center justify-center cursor-pointer rounded-2xl transition-all duration-300 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 border border-transparent hover:border-zinc-200/80 dark:hover:border-zinc-700/50 active:scale-90 opacity-100" title={t("attachFile")}>
              <Icons.Plus className="w-5 h-5" />
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  if (
                    file.type === "text/plain" ||
                    file.type === "text/csv" ||
                    file.name.endsWith(".txt") ||
                    file.name.endsWith(".csv") ||
                    file.name.endsWith(".md")
                  ) {
                    const text = await file.text();
                    setInput(
                      (prev) =>
                        prev +
                        (prev ? "\n\n" : "") +
                        `[${t("fileContent")}: ${file.name}]\n${text}\n`,
                    );
                    return;
                  }
                  
                  // For images, PDFs, PPTX, they get added as attachments
                  const r = new FileReader();
                  r.onloadend = () => {
                    setAttachment({
                      data: (r.result as string).split(",")[1],
                      mimeType: file.type,
                      name: file.name,
                      fullData: r.result as string,
                    });
                  };
                  r.readAsDataURL(file);
                }}
              />
            </label>

            <AnimatePresence>
              {attachment && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative group/attachment ml-2 flex items-center"
                >
                  {attachment.mimeType.startsWith("image/") ? (
                    <>
                      <img
                        src={
                          attachment.fullData ||
                          `data:${attachment.mimeType};base64,${attachment.data}`
                        }
                        alt="Attachment Preview"
                        className="h-10 w-10 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm transition-opacity"
                      />
                      <button
                        className="absolute inset-0 bg-black/50 text-white rounded-xl flex items-center justify-center opacity-0 group-hover/attachment:opacity-100 transition-opacity"
                        onClick={onEditImage}
                        title="Edit Image"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-5 h-5 pointer-events-none"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <div className="h-10 w-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      <Icons.FileText className="w-5 h-5 text-zinc-500" />
                    </div>
                  )}
                  <button
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/attachment:opacity-100 transition-opacity"
                    onClick={() => setAttachment(null)}
                  >
                    <Icons.Close className="w-2.5 h-2.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 z-20">
            <button
              onClick={() => {
                if (input.trim() || attachment) {
                  if (isListening) {
                    handleToggleDictation();
                  }
                  onSendMessage(input, undefined);
                  setInput("");
                }
              }}
              disabled={!input.trim() && !attachment}
              className="w-10 h-10 flex items-center justify-center text-white bg-indigo-600 rounded-2xl hover:bg-indigo-500 transition-all duration-300 shadow-lg shadow-indigo-600/20 active:scale-90 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed"
            >
              <Icons.Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  },
);

export default ChatInput;
