import React from 'react';

interface WidgetManagerProps {
  selectedMode: string;
}

export const WidgetManager: React.FC<WidgetManagerProps> = ({ selectedMode }) => {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
        <h2 className="text-lg font-bold mb-4">Central Workspace: {selectedMode}</h2>
        <div className="h-full flex items-center justify-center text-zinc-500">
          {selectedMode === 'Artist' ? 'Canvas Area' : 'Chat/Analysis Area'}
        </div>
      </div>
      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
        <h2 className="text-lg font-bold mb-4">Secondary Context</h2>
        <div className="h-full flex items-center justify-center text-zinc-500">
          Context for {selectedMode}
        </div>
      </div>
    </div>
  );
};
