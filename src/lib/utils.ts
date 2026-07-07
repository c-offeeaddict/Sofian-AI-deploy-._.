import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

export const cn = (...classes: (string | boolean | undefined)[]) => {
  return classes.filter(Boolean).join(' ');
};

export const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Medium) => {
  try {
    await Haptics.impact({ style });
  } catch (e) {
    // Fail silently
  }
};
