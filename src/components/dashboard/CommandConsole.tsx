import React, { useState } from 'react';
import { Icons } from '../../constants';

export const CommandConsole: React.FC = () => {
  const [input, setInput] = useState('');

  return (
    <div className="flex items-center gap-2 bg-zinc-900 p-2 rounded-xl border border-zinc-700">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter command or chat..."
        className="flex-1 bg-transparent outline-none text-white px-2"
      />
      <button className="p-2 bg-indigo-600 rounded-lg hover:bg-indigo-500">
        <Icons.Send className="w-4 h-4" />
      </button>
    </div>
  );
};
