import React, { useState } from 'react';
import { WidgetManager } from './WidgetManager';
import { CommandConsole } from './CommandConsole';
import { ModeSelector } from './ModeSelector';

interface DashboardProps {
  state: any;
  onSendMessage: (text: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ state, onSendMessage }) => {
  const [selectedMode, setSelectedMode] = useState<string>('Assistant');

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 text-white overflow-hidden">
      <header className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold">Sofian AI</h1>
        <ModeSelector selectedMode={selectedMode} onModeSelect={setSelectedMode} />
      </header>
      <main className="flex-1 overflow-hidden p-4">
        <WidgetManager selectedMode={selectedMode} />
      </main>
      <footer className="p-4 border-t border-zinc-800">
        <CommandConsole />
      </footer>
    </div>
  );
};
