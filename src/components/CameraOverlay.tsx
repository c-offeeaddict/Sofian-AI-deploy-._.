import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../constants';
import VisualTrackingHUD from './VisualTrackingHUD';

interface CameraOverlayProps {
  onCapture: (base64: string) => void;
  onClose: () => void;
}

const CameraOverlay: React.FC<CameraOverlayProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      setError(null);
      try {
        if (videoRef.current && videoRef.current.srcObject) {
            const oldStream = videoRef.current.srcObject as MediaStream;
            oldStream.getTracks().forEach(t => t.stop());
        }

        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode } 
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        
        // Reset flash state on camera switch
        setIsFlashOn(false);

      } catch (err: any) {
        console.error("Camera error:", err);
        // Fallback
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (e: any) {
            console.error("Fallback failed", e);
            setError(e.message || "Could not access camera. Please check permissions or ensure no other app is using it.");
        }
      }
    };
    startCamera();
    return () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [facingMode]);

  const toggleFlash = async () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getVideoTracks();
      if (!tracks || tracks.length === 0) return;
      const track = tracks[0];
      
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      // @ts-ignore - Torch is part of ImageCapture spec but often available in advanced constraints
      if (capabilities.torch || 'torch' in capabilities) {
          const newFlashState = !isFlashOn;
          try {
            await track.applyConstraints({ advanced: [{ torch: newFlashState }] } as any);
            setIsFlashOn(newFlashState);
          } catch(e) { 
              console.error(e);
              alert("Could not toggle flash.");
          }
      } else {
          alert("Flash is not available on this camera.");
      }
    }
  };

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      setIsCapturing(true);
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      // Mirror if user facing
      if (facingMode === 'user') {
          ctx?.translate(canvas.width, 0);
          ctx?.scale(-1, 1);
      }
      
      ctx?.drawImage(video, 0, 0);
      const data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      setTimeout(() => {
          onCapture(data);
          setIsCapturing(false);
      }, 400);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
    >
      <video ref={videoRef} autoPlay playsInline className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
      <canvas ref={canvasRef} className="hidden" />
      
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mb-6 border border-red-500/30">
            <Icons.AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Camera Access Error</h3>
          <p className="text-zinc-400 text-sm max-w-xs mb-8">{error}</p>
          <div className="flex gap-4">
            <button 
              onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm font-bold transition-all"
            >
              Switch Camera
            </button>
            <button 
              onClick={onClose}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl text-white text-sm font-bold transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Augmented Reality Layer */}
      <VisualTrackingHUD />
      
      <div className="absolute inset-x-0 top-0 p-6 z-20 flex justify-end items-start">
         <button onClick={onClose} className="p-3 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-md border border-white/10 transition-colors">
          <Icons.Close />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 pb-12 pt-24 bg-gradient-to-t from-black/90 to-transparent z-20 flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
            <p className="text-white text-xs font-bold uppercase tracking-widest bg-black/40 px-4 py-2 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
            Tap to Analyze
            </p>
        </div>
        
        <div className="flex items-center gap-8">
            <button 
                onClick={toggleFlash}
                className={`p-4 rounded-full backdrop-blur-md border transition-all duration-500 relative overflow-hidden group/flash ${
                    isFlashOn 
                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.3)]' 
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                }`}
            >
                {isFlashOn && (
                    <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute inset-0 bg-yellow-500/10 blur-md"
                    />
                )}
                <span className="relative z-10">
                    {isFlashOn ? <Icons.FlashOn className="w-6 h-6" /> : <Icons.FlashOff className="w-6 h-6" />}
                </span>
            </button>

            <button 
            onClick={captureFrame} 
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-300 ${isCapturing ? 'bg-indigo-500 border-indigo-400 scale-90' : 'bg-white/10 border-white hover:bg-white/20 hover:scale-105'}`}
            >
            <div className={`rounded-full bg-white transition-all duration-300 ${isCapturing ? 'w-4 h-4' : 'w-16 h-16'}`} />
            </button>
            
            <button 
                onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                className="p-4 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-all duration-500 hover:scale-110 active:scale-90 group/rotate"
            >
                <Icons.Rotate className="w-6 h-6 transition-transform duration-500 group-hover/rotate:rotate-180" />
            </button>
        </div>
      </div>
    </motion.div>
  );
};

export default CameraOverlay;