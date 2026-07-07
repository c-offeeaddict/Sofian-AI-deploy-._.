
import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../constants';

interface ImageEditorProps {
  imageData: string; // Data URL
  onSave: (newImageData: string) => void;
  onCancel: () => void;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ imageData, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const [selection, setSelection] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = new Image();
    img.src = imageData;
    img.onload = () => {
      setImage(img);
    };
  }, [imageData]);

  useEffect(() => {
      if (image && canvasRef.current && containerRef.current) {
          const container = containerRef.current;
          const canvas = canvasRef.current;
          
          // Fit image to container while maintaining aspect ratio
          const scale = Math.min(container.clientWidth / image.width, container.clientHeight / image.height);
          const w = image.width * scale;
          const h = image.height * scale;
          
          setDimensions({ w, h });
          canvas.width = w;
          canvas.height = h;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(image, 0, 0, w, h);
          }
      }
  }, [image]);

  useEffect(() => {
     if (canvasRef.current && image) {
         const ctx = canvasRef.current.getContext('2d');
         if (ctx) {
            // Redraw image
            ctx.clearRect(0,0, dimensions.w, dimensions.h);
            ctx.drawImage(image, 0, 0, dimensions.w, dimensions.h);
            
            // Draw Selection Overlay
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, dimensions.w, dimensions.h);
            
            if (selection) {
                // Clear the selection area to show original image
                ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
                ctx.drawImage(image, 
                    (selection.x / dimensions.w) * image.width, 
                    (selection.y / dimensions.h) * image.height,
                    (selection.w / dimensions.w) * image.width,
                    (selection.h / dimensions.h) * image.height,
                    selection.x, selection.y, selection.w, selection.h
                );
                
                // Draw Border
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
                
                // Draw Guidelines
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(selection.x + selection.w/3, selection.y);
                ctx.lineTo(selection.x + selection.w/3, selection.y + selection.h);
                ctx.moveTo(selection.x + 2*selection.w/3, selection.y);
                ctx.lineTo(selection.x + 2*selection.w/3, selection.y + selection.h);
                ctx.moveTo(selection.x, selection.y + selection.h/3);
                ctx.lineTo(selection.x + selection.w, selection.y + selection.h/3);
                ctx.moveTo(selection.x, selection.y + 2*selection.h/3);
                ctx.lineTo(selection.x + selection.w, selection.y + 2*selection.h/3);
                ctx.stroke();
            }
         }
     }
  }, [selection, dimensions, image]);

  const handlePointerDown = (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setStartPos({ x, y });
      setSelection({ x, y, w: 0, h: 0 });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!startPos) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(e.clientX - rect.left, dimensions.w));
      const currentY = Math.max(0, Math.min(e.clientY - rect.top, dimensions.h));
      
      const x = Math.min(startPos.x, currentX);
      const y = Math.min(startPos.y, currentY);
      const w = Math.abs(currentX - startPos.x);
      const h = Math.abs(currentY - startPos.y);
      
      setSelection({ x, y, w, h });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      setStartPos(null);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleSave = () => {
      if (!selection || !image || selection.w < 5 || selection.h < 5) {
          onSave(imageData); // Return original if selection is invalid
          return;
      }
      
      const tempCanvas = document.createElement('canvas');
      const scaleX = image.width / dimensions.w;
      const scaleY = image.height / dimensions.h;
      
      tempCanvas.width = selection.w * scaleX;
      tempCanvas.height = selection.h * scaleY;
      
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(image,
            selection.x * scaleX, selection.y * scaleY, selection.w * scaleX, selection.h * scaleY,
            0, 0, tempCanvas.width, tempCanvas.height
          );
          onSave(tempCanvas.toDataURL('image/jpeg', 0.9));
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
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between z-20 bg-gradient-to-b from-black/80 to-transparent">
            <button onClick={onCancel} className="p-2 text-white"><Icons.Close /></button>
            <h3 className="text-white font-bold">Crop Image</h3>
            <button onClick={handleSave} className="p-2 text-indigo-400 font-bold">Done</button>
        </div>
        
        <div ref={containerRef} className="relative w-full h-full p-4 flex items-center justify-center touch-none">
            <canvas 
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="max-w-full max-h-full cursor-crosshair touch-none"
            />
        </div>

        <div className="absolute bottom-8 text-white/50 text-xs pointer-events-none">
            Drag to crop
        </div>
    </motion.div>
  );
};

export default ImageEditor;
