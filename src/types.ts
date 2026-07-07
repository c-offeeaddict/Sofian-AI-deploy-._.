
export type MindState = 'Assistant' | 'Genius' | 'Academic' | 'Technologist' | 'Research' | 'Fact-Checker' | 'Artist' | 'DeepThinking' | 'AgentSwarm' | 'Beta';

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  category?: string;
  reminderAt?: number;
}

export interface Attachment {
  data: string;
  mimeType: string;
  name: string;
  fullData?: string;
  isTooLarge?: boolean;
}

export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  timestamp: number;
  metadata?: any;
}

export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role?: 'user' | 'admin';
  createdAt?: any;
  settings?: Partial<UserSettings>;
  preferences?: string;
  isCreator?: boolean;
  memory?: string[];
  vectorDb?: VectorDocument[];
}

export interface ToolOutput {
  type: 'code' | 'integration' | 'success' | 'error' | 'chart' | 'pdf' | 'ppt' | 'sandbox' | 'timeline' | 'comparison_matrix' | 'image' | 'xlsx' | 'docx' | 'agent_swarm' | 'call_e';
  service?: 'jira' | 'github' | 'slack' | 'terminal' | 'custom' | 'sandbox' | 'research' | 'tasks' | 'keep' | 'contacts' | 'artist' | 'genius';
  content: string;
  meta?: any;
}

export interface Memory {
  id: string;
  fact: string;
  userId: string;
  createdAt: any;
}

export interface MindMode {
  id: string;
  label: string;
  icon: string;
  color?: string;
  systemInstruction: string;
  userId: string;
  createdAt: any;
}

export interface Message {
  id: string;
  sessionId?: string;
  userId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: any;
  attachment?: Attachment;
  suggestions?: string[];
  isSaved?: boolean;
  thought?: string;
  sources?: any[];
  generatedImage?: string;
  toolOutputs?: ToolOutput[]; // Store execution results
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  modes: MindState[]; 
  timestamp: any;
  createdAt?: any;
  updatedAt?: any;
  userId?: string;
  isFavorite?: boolean;
  isPublic?: boolean;
}

export interface UserSettings {
  memory: boolean;
  creativity: number;
  length: 'short' | 'detailed';
  darkMode: boolean | 'system';
  language: string;
  focusMode: boolean;
  useEmojis: boolean;
  bugSearching: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface SofianAIState {
  currentSessionId: string;
  sessions: ChatSession[];
  isLoading: boolean;
  error: string | null;
  activeModes: MindState[]; 
  customModes: MindMode[];
  tasks: Task[];
  settings: UserSettings;
  savedMessages: Message[];
  user: User | null;
  toasts: Toast[];
}


