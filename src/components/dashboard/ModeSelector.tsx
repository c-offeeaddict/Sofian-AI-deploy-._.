import React from 'react';
import { MIND_MODES } from '../../constants';

interface ModeSelectorProps {
  selectedMode: string;
  onModeSelect: (mode: string) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ selectedMode, onModeSelect }) => {
  return (
    <div className="flex gap-2">
      {MIND_MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onModeSelect(mode.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            selectedMode === mode.id ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          <span>{mode.icon}</span>
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
};
