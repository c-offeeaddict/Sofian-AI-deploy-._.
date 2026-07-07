import React, { useEffect, useRef } from 'react';

interface VisualTrackingHUDProps {
    status?: string;   // Current system status
}

const VisualTrackingHUD: React.FC<VisualTrackingHUDProps> = ({ status }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Refs for animation state to persist across renders
  const objectsRef = useRef<any[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
        if (canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }
    };
    window.addEventListener('resize', resize);
    resize();

    // Utility: Linear Interpolation
    const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

    const createObject = (label?: string) => ({
        x: Math.random() * (canvas.width - 100),
        y: Math.random() * (canvas.height - 100),
        targetX: Math.random() * (canvas.width - 100),
        targetY: Math.random() * (canvas.height - 100),
        w: 100 + Math.random() * 100,
        h: 100 + Math.random() * 100,
        label: label || null,
        life: 0,
        state: 'locking', // locking, tracked
        color: '#10b981'
    });

    const drawBracket = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha: number) => {
        const len = 15;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        
        // Top Left
        ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
        // Top Right
        ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
        // Bottom Right
        ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
        // Bottom Left
        ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
        
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    };

    const render = () => {
        if (!canvasRef.current || !ctx) return;
        const { width, height } = canvasRef.current;
        ctx.clearRect(0, 0, width, height);
        frameRef.current++;

        // 3. Update & Draw
        for (let i = objectsRef.current.length - 1; i >= 0; i--) {
            const obj = objectsRef.current[i];
            
            // Logic
            // Stabilize near center-ish
            obj.targetX = width/2 - obj.w/2 + Math.sin(frameRef.current * 0.02 + i) * 30;
            obj.targetY = height/2 - obj.h/2 + Math.cos(frameRef.current * 0.03 + i) * 30;
            obj.x = lerp(obj.x, obj.targetX, 0.1);
            obj.y = lerp(obj.y, obj.targetY, 0.1);

            // Draw
            const opacity = 0.8;
            drawBracket(ctx, obj.x, obj.y, obj.w, obj.h, obj.color, opacity);

            // Label
            if (obj.label) {
                ctx.font = "10px 'JetBrains Mono'";
                ctx.fillStyle = obj.color;
                ctx.globalAlpha = opacity;
                const txt = `DETECT: ${obj.label.toUpperCase()}`;
                ctx.fillText(txt, obj.x + 4, obj.y - 6);
                
                // Tech decor
                ctx.fillRect(obj.x, obj.y - 12, 2, 8);
                ctx.globalAlpha = 1.0;
            }
        }

        // Center Crosshair
        const isDark = document.documentElement.classList.contains('dark');
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 10, height / 2); ctx.lineTo(width / 2 + 10, height / 2);
        ctx.moveTo(width / 2, height / 2 - 10); ctx.lineTo(width / 2, height / 2 + 10);
        ctx.stroke();
        
        animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(animationFrameId);
    };
  }, [status]);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10 w-full h-full" />;
};

export default VisualTrackingHUD;