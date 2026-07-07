import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, deleteDoc, onSnapshot, serverTimestamp, limitToLast } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, ChatSession, Message, UserSettings, MindMode, Memory } from '../types';
import { generateId } from '../lib/utils';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  if (errorMessage.toLowerCase().includes('permission')) {
    throw new Error(JSON.stringify(errInfo));
  } else if (!errorMessage.toLowerCase().includes('offline')) {
    throw error;
  }
}

export const updateUserProfile = async (uid: string, updates: Partial<User>) => {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, updates, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const updateUserSettings = async (uid: string, settings: Partial<UserSettings>) => {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, { settings }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const saveUser = async (user: any) => {
  if (!user) return;
  const path = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || 'unknown@example.com',
      displayName: user.displayName || user.name || null,
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      settings: {}
    }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const saveSession = async (session: ChatSession, userId: string) => {
  const path = `sessions/${session.id}`;
  try {
    const data: any = {
      id: String(session.id),
      title: session.title || 'New Session',
      userId,
      modes: session.modes || ['Assistant'],
      timestamp: Number(session.timestamp) || Date.now(),
      updatedAt: serverTimestamp(),
      isFavorite: session.isFavorite || false
    };
    
    const sessionRef = doc(db, 'sessions', String(session.id));
    await setDoc(sessionRef, data, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

const sanitizeData = (data: any): any => {
  if (data === undefined) return null;
  if (data === null) return null;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeData);
  
  return Object.fromEntries(
    Object.entries(data)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, sanitizeData(v)])
  );
};

export const saveMessage = async (message: Message, userId: string) => {
  const path = `messages/${message.id}`;
  try {
    let sanitizedMessage = sanitizeData(message);
    
    let payload = {
      ...sanitizedMessage,
      id: String(message.id),
      sessionId: String(message.sessionId),
      userId,
      content: message.content || '',
      timestamp: Number(message.timestamp) || Date.now()
    };

    // Check if payload size exceeds Firestore 1MB limit (approx 1,048,576 bytes)
    // We use a safe margin (900KB)
    const MAX_SIZE = 900 * 1024;
    let payloadString = JSON.stringify(payload);
    
    if (payloadString.length > MAX_SIZE) {
      // Firebase document limit is 1MB. We gracefully strip large image/attachment sources,
      // as App.tsx merges these back via local state for the active session.
      
      // Attempt to strip redundant or large fields
      if (payload.attachment?.fullData) {
        delete payload.attachment.fullData;
      }
      
      payloadString = JSON.stringify(payload);
      if (payloadString.length > MAX_SIZE && payload.attachment?.data) {
        // If still too large, replace data with a placeholder
        payload.attachment.data = "[File too large to persist]";
        payload.attachment.isTooLarge = true;
      }
      
      payloadString = JSON.stringify(payload);
      if (payloadString.length > MAX_SIZE && payload.generatedImage) {
        delete payload.generatedImage;
      }
      
      payloadString = JSON.stringify(payload);
      if (payloadString.length > MAX_SIZE && payload.content) {
        // As a last resort, truncate content if it's somehow massive
        payload.content = payload.content.slice(0, 10000) + "... [Content truncated due to size]";
      }
    }
    
    await setDoc(doc(db, 'messages', String(message.id)), payload, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const saveMemory = async (fact: string, userId: string) => {
  const id = generateId();
  const path = `memories/${id}`;
  try {
    await setDoc(doc(db, 'memories', id), {
      id,
      fact,
      userId,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const subscribeToSessions = (userId: string, callback: (sessions: ChatSession[]) => void) => {
  const q = query(collection(db, 'sessions'), where('userId', '==', userId), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map(doc => ({ ...doc.data() } as ChatSession));
    callback(sessions);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'sessions');
  });
};

export const subscribeToMessages = (sessionId: string, callback: (messages: Message[]) => void) => {
  const q = query(
    collection(db, 'messages'), 
    where('sessionId', '==', sessionId), 
    orderBy('timestamp', 'asc'),
    limitToLast(100)
  );
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({ ...doc.data() } as Message));
    callback(messages);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'messages');
  });
};

export const subscribeToMemories = (userId: string, callback: (memories: Memory[]) => void) => {
  const q = query(collection(db, 'memories'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const memories = snapshot.docs.map(doc => ({ ...doc.data() } as Memory));
    callback(memories);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'memories');
  });
};

export const saveCustomMode = async (mode: MindMode) => {
  const path = `mindModes/${mode.id}`;
  try {
    const sanitizedMode = sanitizeData(mode);
    const modeRef = doc(db, 'mindModes', mode.id);
    const payload: any = { ...sanitizedMode };
    // To ensure createdAt isn't constantly overwritten but avoiding getDoc, we rely on merge
    await setDoc(modeRef, payload, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const deleteSession = async (sessionId: string) => {
  const path = `sessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'sessions', sessionId));
    
    // Also delete all messages associated with this session
    if (auth.currentUser) {
      const q = query(
        collection(db, 'messages'), 
        where('sessionId', '==', sessionId),
        where('userId', '==', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const deleteCustomMode = async (modeId: string) => {
  const path = `mindModes/${modeId}`;
  try {
    await deleteDoc(doc(db, 'mindModes', modeId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
};

export const subscribeToCustomModes = (userId: string, callback: (modes: MindMode[]) => void) => {
  const q = query(collection(db, 'mindModes'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const modes = snapshot.docs.map(doc => ({ ...doc.data() } as MindMode));
    callback(modes);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'mindModes');
  });
};
