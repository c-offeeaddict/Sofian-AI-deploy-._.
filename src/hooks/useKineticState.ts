import { useState, useEffect } from 'react';

export type KineticState = 'high' | 'low' | 'unknown';
export type SpatialOrientation = 'face-down' | 'held-up' | 'unknown';

export interface KCSData {
  kineticState: KineticState;
  orientation: SpatialOrientation;
  acceleration: { x: number; y: number; z: number };
  rotation: { alpha: number; beta: number; gamma: number };
}

export function useKineticState(enabled: boolean): KCSData {
  const [data, setData] = useState<KCSData>({
    kineticState: 'unknown',
    orientation: 'unknown',
    acceleration: { x: 0, y: 0, z: 0 },
    rotation: { alpha: 0, beta: 0, gamma: 0 }
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let lastAccel = { x: 0, y: 0, z: 0 };
    let accelVariance = 0;
    let samples = 0;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.acceleration || event.accelerationIncludingGravity;
      if (!acc) return;

      const x = acc.x || 0;
      const y = acc.y || 0;
      const z = acc.z || 0;

      // Calculate simple variance/magnitude of change
      const deltaX = Math.abs(x - lastAccel.x);
      const deltaY = Math.abs(y - lastAccel.y);
      const deltaZ = Math.abs(z - lastAccel.z);
      
      const totalDelta = deltaX + deltaY + deltaZ;
      
      // Smooth the variance
      accelVariance = (accelVariance * 0.8) + (totalDelta * 0.2);
      samples++;

      lastAccel = { x, y, z };

      if (samples % 10 === 0) { // Update state periodically to avoid too many re-renders
        setData(prev => {
          let newState: KineticState = prev.kineticState;
          if (accelVariance > 3.0) {
            newState = 'high';
          } else if (accelVariance < 1.0) {
            newState = 'low';
          }

          return {
            ...prev,
            kineticState: newState,
            acceleration: { x, y, z }
          };
        });
      }
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const alpha = event.alpha || 0;
      const beta = event.beta || 0;
      const gamma = event.gamma || 0;

      setData(prev => {
        let newOrientation: SpatialOrientation = prev.orientation;
        
        // Face down: beta is around 180 or -180
        if (Math.abs(beta) > 150) {
          newOrientation = 'face-down';
        } 
        // Held up: beta is around 45 to 90
        else if (beta > 30 && beta < 120) {
          newOrientation = 'held-up';
        }

        return {
          ...prev,
          orientation: newOrientation,
          rotation: { alpha, beta, gamma }
        };
      });
    };

    // Request permissions if needed (iOS 13+)
    const requestPermissions = async () => {
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        try {
          const permissionState = await (DeviceMotionEvent as any).requestPermission();
          if (permissionState === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
            window.addEventListener('deviceorientation', handleOrientation);
          }
        } catch (e) {
          console.error("Error requesting device motion permission", e);
        }
      } else {
        window.addEventListener('devicemotion', handleMotion);
        window.addEventListener('deviceorientation', handleOrientation);
      }
    };

    requestPermissions();

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [enabled]);

  return data;
}
