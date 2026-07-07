
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icons } from '../constants';

interface Scene {
  heading?: string;
  bullets?: string[];
  narrationScript: string;
  visualKeyword?: string;
}

interface NarrativePresentationProps {
  title: string;
  theme: 'minimal' | 'futuristic' | 'dark' | 'light';
  scenes: Scene[];
  onClose: () => void;
}

const NarrativePresentation: React.FC<NarrativePresentationProps> = ({ title, theme, scenes, onClose }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  const currentScene = scenes[currentSceneIndex];

  const playScene = (index: number) => {
    if (!window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(scenes[index].narrationScript);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    utterance.onend = () => {
      if (index < scenes.length - 1) {
        setCurrentSceneIndex(index + 1);
      } else {
        setIsPlaying(false);
      }
    };

    synthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (isStarted && isPlaying) {
      playScene(currentSceneIndex);
    }
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [currentSceneIndex, isStarted]);

  const togglePlayback = () => {
    if (isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
    } else {
      window.speechSynthesis.resume();
      setIsPlaying(true);
    }
  };

  const getThemeStyles = () => {
    switch (theme) {
      case 'futuristic': return 'bg-black text-indigo-400 border-indigo-500/30';
      case 'dark': return 'bg-zinc-950 text-white border-white/10';
      case 'light': return 'bg-white text-zinc-900 border-black/5';
      default: return 'bg-zinc-900 text-zinc-100 border-white/5';
    }
  };

  if (!isStarted) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-3xl">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full p-10 rounded-[40px] bg-zinc-900 border border-white/10 text-center"
        >
          <div className="mb-8 p-6 rounded-3xl bg-indigo-500/10 inline-block border border-indigo-500/20">
             <Icons.Play className="w-12 h-12 text-indigo-500" />
          </div>
          <h2 className="text-3xl font-display font-bold text-white mb-4 tracking-tight">{title}</h2>
          <p className="text-zinc-500 mb-10 leading-relaxed text-sm">
            Experience an immersive narrative presentation with synchronized visuals and voice synthesis.
          </p>
          <button 
            onClick={() => setIsStarted(true)}
            className="w-full py-5 rounded-2xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-500 transition-all active:scale-95 shadow-2xl shadow-indigo-600/20"
          >
            Start Presentation
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-[200] flex flex-col overflow-hidden ${getThemeStyles()}`}>
      {/* Background Graphic */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={currentSceneIndex}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 0.3, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 2.5 }}
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: currentScene.visualKeyword 
              ? `url(https://image.pollinations.ai/prompt/${encodeURIComponent(currentScene.visualKeyword)}?width=1920&height=1080&nologo=true&seed=${currentSceneIndex})`
              : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-1" />

      {/* Header */}
      <div className="relative z-10 px-8 py-6 flex items-center justify-between border-b border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">SA</div>
          <span className="font-bold tracking-tight opacity-70">{title}</span>
        </div>
        <button 
          onClick={onClose}
          className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all active:scale-90"
        >
          <Icons.Close className="w-5 h-5" />
        </button>
      </div>

      {/* Main Slide Area */}
      <div className="flex-1 relative z-10 flex items-center justify-center p-8 sm:p-20">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentSceneIndex}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ type: "spring", damping: 25, stiffness: 120 }}
            className="max-w-4xl w-full"
          >
            {currentScene.heading && (
              <h1 className="text-4xl sm:text-7xl font-display font-bold mb-10 tracking-tight leading-tight">
                {currentScene.heading}
              </h1>
            )}
            {currentScene.bullets && (
              <ul className="space-y-6">
                {currentScene.bullets.map((b, i) => (
                  <motion.li 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="flex items-start gap-5 text-lg sm:text-2xl opacity-80"
                  >
                    <div className="mt-2.5 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                    <span>{b}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls / Progress */}
      <div className="relative z-10 px-8 pb-10 flex flex-col gap-8">
        <div className="flex items-center gap-4 w-full">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
             <motion.div 
                animate={{ width: `${((currentSceneIndex + 1) / scenes.length) * 100}%` }}
                className="h-full bg-indigo-500"
             />
          </div>
          <span className="text-xs font-mono opacity-50">{currentSceneIndex + 1} / {scenes.length}</span>
        </div>

        <div className="flex items-center justify-center gap-6">
          <button 
            disabled={currentSceneIndex === 0}
            onClick={() => setCurrentSceneIndex(p => Math.max(0, p - 1))}
            className="p-4 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-20 transition-all rtl:rotate-180"
          >
            <Icons.Back className="w-6 h-6" />
          </button>

          <button 
            onClick={togglePlayback}
            className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-indigo-600/30"
          >
            {isPlaying ? <Icons.Pause className="w-8 h-8" /> : <Icons.Play className="w-8 h-8 ml-1" />}
          </button>

          <button 
            disabled={currentSceneIndex === scenes.length - 1}
            onClick={() => setCurrentSceneIndex(p => Math.min(scenes.length - 1, p + 1))}
            className="p-4 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-20 transition-all rtl:rotate-180"
          >
            <Icons.ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NarrativePresentation;
