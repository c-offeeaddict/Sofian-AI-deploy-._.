import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icons } from '../constants';
import { GoogleGenAI, Modality } from '@google/genai';
import { getGeminiApiKey } from '../services/neuralService';

interface LiveVoiceModeProps {
  onClose: () => void;
  systemInstruction?: string;
  onTranscriptMessage?: (role: 'user' | 'assistant', text: string) => void;
}

export default function LiveVoiceMode({ onClose, systemInstruction, onTranscriptMessage }: LiveVoiceModeProps) {
  const [status, setStatusState] = useState<'connecting' | 'listening' | 'speaking' | 'error'>('connecting');
  const [isMuted, setIsMutedState] = useState(false);
  const [ccText, setCcText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  const [activeVoice, setActiveVoice] = useState('Puck');
  const [voiceTone, setVoiceTone] = useState('Conversational');
  const [voiceSpeed, setVoiceSpeed] = useState('Normal');
  const [showCC, setShowCC] = useState(true);

  const statusRef = useRef<'connecting' | 'listening' | 'speaking' | 'error'>('connecting');
  const isMutedRef = useRef(false);

  const setStatus = (s: 'connecting' | 'listening' | 'speaking' | 'error') => {
      setStatusState(s);
      statusRef.current = s;
  };

  const toggleMute = () => {
     const newMuted = !isMuted;
     setIsMutedState(newMuted);
     isMutedRef.current = newMuted;
  };
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const playbackContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef<number>(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const ccContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ccContainerRef.current) {
        ccContainerRef.current.scrollTop = ccContainerRef.current.scrollHeight;
    }
  }, [ccText]);

  useEffect(() => {
    let active = true;

    async function startLiveSession() {
      try {
        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
           setStatusState('error');
           setCcText('Error: Please configure the Gemini API Key to use Live Voice Mode.');
           return;
        }
        aiRef.current = new GoogleGenAI({ apiKey });

        playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        nextPlayTimeRef.current = playbackContextRef.current.currentTime;

        const sessionPromise = aiRef.current.live.connect({
          model: "gemini-3.1-flash-live-preview",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: activeVoice } },
            },
            systemInstruction: `${systemInstruction || "You are a helpful, conversational AI."}\nAdopt a ${voiceTone} tone of voice.\nSpeak at a ${voiceSpeed} pace. Keep responses concise like a spoken conversation.`,
            // @ts-ignore - The Live API typings currently lack the safetySettings property, but it's supported by the underlying implementation.
            safetySettings: [
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }
            ],
            // Request both server (output) and user (input) transcription for CC
            outputAudioTranscription: {},
            inputAudioTranscription: {},
          },
          callbacks: {
            onopen: async () => {
              if (!active) return;
              try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                sourceRef.current = audioContextRef.current.createMediaStreamSource(streamRef.current);
                processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
                
                sourceRef.current.connect(processorRef.current);
                processorRef.current.connect(audioContextRef.current.destination);

                processorRef.current.onaudioprocess = (e) => {
                  if (statusRef.current === 'speaking' || isMutedRef.current) {
                     // Only collect and send when not speaking and not muted
                     return;
                  }
                  const pcmData = e.inputBuffer.getChannelData(0);
                  const int16Array = new Int16Array(pcmData.length);
                  for (let i = 0; i < pcmData.length; i++) {
                    let s = Math.max(-1, Math.min(1, pcmData[i]));
                    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                  }
                  
                  let binary = '';
                  const bytes = new Uint8Array(int16Array.buffer);
                  for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                  }
                  const base64Data = btoa(binary);

                  sessionPromise.then(session => {
                      session.sendRealtimeInput({
                          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                      });
                  });
                };
                setStatus('listening');
                startVisualizer();
              } catch (err: any) {
                console.error("Audio capture error", err);
                setErrorMsg("Microphone access denied.");
                setStatus('error');
              }
            },
            onmessage: (msg: any) => {
               // Handle transcription
               if (msg.serverContent?.modelTurn) {
                   const tParts = msg.serverContent.modelTurn.parts;
                   for(const p of tParts) {
                       if (p.text) {
                           setCcText(prev => prev ? prev + " " + p.text : p.text);
                       }
                   }
               }
               // Also check for raw transcription objects sometimes sent by live API
               if (msg.serverContent?.outputAudioTranscription) {
                  // Ensure standard model generation populates the CC text
                  const aiText = msg.serverContent.outputAudioTranscription.text || '';
                  if (aiText) {
                      setCcText(aiText);
                  }
               }

               // User transcription (what they said) sent back from the Live API
               if (msg.serverContent?.inputAudioTranscription?.text) {
                   const userText = msg.serverContent.inputAudioTranscription.text;
                   if (userText && onTranscriptMessage) {
                       onTranscriptMessage('user', userText);
                   }
               }
               
               // Handle audio playback
               const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
               if (audioData) {
                   setStatus('speaking');
                   playAudioParams(audioData);
               }

               if (msg.serverContent?.interrupted) {
                  stopPlayback();
                  setStatus('listening');
                  if (onTranscriptMessage && ccText) onTranscriptMessage('assistant', ccText);
                  setCcText('');
               }
               
               if (msg.serverContent?.turnComplete) {
                  setStatus('listening');
                  if (onTranscriptMessage && ccText) {
                      onTranscriptMessage('assistant', ccText);
                      setCcText('');
                  }
               }
            },
            onerror: (err: any) => {
              console.error("Live session error:", err);
              setErrorMsg(String(err));
              setStatus('error');
            },
            onclose: () => {
              // stopPlayback();
            }
          }
        });
        
        sessionRef.current = await sessionPromise;
      } catch (err: any) {
        console.error("Failed to connect live session", err);
        setErrorMsg("Failed to connect to Live API. " + err.message);
        setStatus('error');
      }
    }

    startLiveSession();

    return () => {
      active = false;
      stopPlayback();
      if (processorRef.current) processorRef.current.disconnect();
      if (sourceRef.current) sourceRef.current.disconnect();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
      if (sessionRef.current) sessionRef.current.close();
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [systemInstruction, activeVoice, voiceTone, voiceSpeed]);

  const playAudioParams = (base64: string) => {
      if (!playbackContextRef.current) return;
      const ctx = playbackContextRef.current;
      
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
      
      const int16Data = new Int16Array(bytes.buffer);
      const audioBuffer = ctx.createBuffer(1, int16Data.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < int16Data.length; i++) {
          channelData[i] = int16Data[i] / 32768.0;
      }
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      if (nextPlayTimeRef.current < ctx.currentTime) {
        nextPlayTimeRef.current = ctx.currentTime + 0.05;
      }
      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += audioBuffer.duration;
      
      activeSourcesRef.current.push(source);
      source.onended = () => {
          activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
          if (activeSourcesRef.current.length === 0) {
              setStatus('listening');
          }
      };
  };

  const stopPlayback = () => {
      activeSourcesRef.current.forEach(s => {
          try { s.stop(); } catch(e) {}
      });
      activeSourcesRef.current = [];
      if (playbackContextRef.current) {
          nextPlayTimeRef.current = playbackContextRef.current.currentTime;
      }
  };

  const startVisualizer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const draw = () => {
      // Very smooth, fluid UI orb
      const width = canvas.width = canvas.offsetWidth;
      const height = canvas.height = canvas.offsetHeight;
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      const isSpeaking = statusRef.current === 'speaking';
      const baseRadius = isSpeaking ? 120 : 80;
      const amplitude = isSpeaking ? 40 : 10;
      const speed = isSpeaking ? 0.08 : 0.02;

      phase += speed;

      // Draw multi-layered glowing orbs
      for (let i = 0; i < 3; i++) {
        const offset = i * Math.PI / 3;
        const radius = baseRadius + Math.sin(phase + offset) * amplitude;
        
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        
        if (isSpeaking) {
            ctx.fillStyle = `rgba(168, 85, 247, ${0.2 - i*0.05})`; // Purple for AI speaking
        } else {
            ctx.fillStyle = `rgba(99, 102, 241, ${0.4 - i*0.1})`; // Indigo for listening
        }
        
        ctx.fill();
      }

      // Center solid orb
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = isSpeaking ? 'rgba(168, 85, 247, 0.8)' : 'rgba(99, 102, 241, 0.9)';
      ctx.fill();
      
      // Glow
      ctx.shadowBlur = 40;
      ctx.shadowColor = isSpeaking ? '#a855f7' : '#6366f1';
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  useEffect(() => {
    if (status === 'listening' || status === 'speaking') {
       // Restart visualizer if state changes to update colors immediately
    }
  }, [status]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 100, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-[100] bg-zinc-950/80 backdrop-blur-2xl flex flex-col items-center justify-between overflow-hidden"
    >
      {/* Header */}
      <div className="w-full flex justify-end p-6 z-50">
      </div>

      {/* Main Visualizer Area */}
      <div className="flex-1 w-full relative flex items-center justify-center">
          {status === 'connecting' && (
              <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 className="flex flex-col items-center gap-4"
              >
                 <Icons.Logo className="w-12 h-12 text-indigo-500 animate-spin" />
                 <p className="text-white/60 font-medium tracking-tight">Connecting to Neural Link...</p>
              </motion.div>
          )}

          {status === 'error' && (
              <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                     <Icons.Close className="w-8 h-8" />
                  </div>
                  <h3 className="text-white text-xl font-bold">Connection Failed</h3>
                  <p className="text-red-400/80">{errorMsg}</p>
              </div>
          )}

          <canvas 
             ref={canvasRef} 
             className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${
                 (status === 'listening' || status === 'speaking') ? 'opacity-100' : 'opacity-0'
             }`}
          />
      </div>

      {/* Closed Captions & Status Footer */}
      <div className="w-full max-w-3xl px-4 pb-8 relative z-10 flex flex-col items-center gap-6">
          <AnimatePresence>
              {showCC && ccText && (status === 'speaking' || status === 'listening') && (
                  <motion.div 
                     ref={ccContainerRef}
                     layout
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: 10 }}
                     transition={{ duration: 0.3 }}
                     className="w-full max-h-[30vh] overflow-y-auto no-scrollbar flex flex-col py-4"
                     style={{ maskImage: 'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)' }}
                  >
                      <p className="text-white text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-center leading-snug drop-shadow-2xl px-4 py-8">
                          {ccText}
                      </p>
                  </motion.div>
              )}
          </AnimatePresence>

          <div className="w-full flex-col sm:flex-row flex justify-center items-center gap-3 bg-black/60 backdrop-blur-3xl border border-white/10 p-3 rounded-[2rem] shadow-2xl relative">
              
              <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/5 w-full sm:w-auto overflow-x-auto no-scrollbar justify-center">
                  <div className={`flex items-center gap-2 px-4 h-10 rounded-full transition-all ${isMuted ? 'bg-red-500/20' : 'bg-transparent'}`}>
                      <div className={`w-2 h-2 rounded-full ${status === 'listening' && !isMuted ? 'bg-emerald-400 animate-pulse' : status === 'speaking' ? 'bg-indigo-400' : 'bg-red-500'}`} />
                      <span className={`font-semibold tracking-widest uppercase text-[10px] whitespace-nowrap ${isMuted ? 'text-red-400' : 'text-white'}`}>
                          {status === 'speaking' ? 'Speaking...' : isMuted ? 'Muted' : 'Listening...'}
                      </span>
                  </div>

                  <div className="w-px h-6 bg-white/10 mx-1" />

                  {/* Explicit CC Toggle */}
                  <button 
                      onClick={() => setShowCC(!showCC)}
                      className={`h-10 px-4 rounded-full flex items-center justify-center transition-all text-xs font-bold tracking-wider uppercase ${showCC ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                      title="Toggle Closed Captions"
                  >
                      CC
                  </button>

                  <div className="w-px h-6 bg-white/10 mx-1" />

                  {/* Manual Transcript Link Button */}
                  <button 
                      onClick={() => {
                          if (onTranscriptMessage && ccText) {
                              onTranscriptMessage('assistant', ccText);
                              setCcText('');
                          }
                      }}
                      className="h-10 px-4 rounded-full flex items-center justify-center transition-all text-xs font-bold tracking-wider uppercase text-white/50 hover:text-indigo-400 hover:bg-white/10"
                      title="Link Transcript to Chat"
                  >
                      <Icons.FileText className="w-4 h-4" />
                  </button>

                  <div className="w-px h-6 bg-white/10 mx-1" />

                  {/* Explicit Voice Selection */}
                  <div className="relative flex items-center">
                      <select 
                          value={activeVoice} 
                          onChange={(e) => setActiveVoice(e.target.value)} 
                          className="h-10 bg-transparent text-white/80 hover:text-white text-xs font-bold tracking-wider uppercase px-4 rounded-full border-none outline-none focus:ring-0 appearance-none cursor-pointer transition-colors"
                      >
                          {["Aoede", "Charon", "Fenrir", "Kore", "Puck"].map(v => <option key={v} value={v} className="bg-zinc-900 text-white p-2">{v}</option>)}
                      </select>
                      <Icons.ChevronDown className="w-3 h-3 text-white/50 absolute right-3 pointer-events-none" />
                  </div>
              </div>

              <div className="flex items-center gap-2">
                  {/* The Mute Button */}
                  <button 
                     onClick={toggleMute}
                     className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/10 text-white hover:bg-white/20 hover:scale-105'}`}
                     title={isMuted ? "Unmute" : "Mute"}
                  >
                      {isMuted ? <Icons.MicOff className="w-5 h-5" /> : <Icons.Mic className="w-5 h-5" />}
                  </button>

                  {/* End Call Button */}
                  <button 
                      onClick={onClose}
                      className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 hover:scale-105 text-white flex items-center justify-center transition-all shadow-lg shadow-red-500/20"
                  >
                      <Icons.Phone className="w-5 h-5" />
                  </button>
              </div>

          </div>
      </div>
    </motion.div>
  );
}
