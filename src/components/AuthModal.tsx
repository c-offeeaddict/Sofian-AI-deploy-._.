
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../constants';
import { User } from '../types';
import { saveUser } from '../services/firebaseService';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { useTranslation } from '../translations';

interface AuthModalProps {
  language?: string;
  onClose: () => void;
  onSuccess: (user: User, token?: string) => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess, language = "en" }) => {
  const { t } = useTranslation(language);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const CREATOR_EMAIL = "sofian20118@gmail.com";

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/tasks');
      provider.addScope('https://www.googleapis.com/auth/keep');
      provider.addScope('https://www.googleapis.com/auth/contacts');
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || undefined;
      const user = result.user;
      
      const isCreator = user.email === CREATOR_EMAIL;
      
      const appUser: User = {
        uid: user.uid,
        displayName: user.displayName || 'User',
        email: user.email || '',
        isCreator: isCreator,
        photoURL: user.photoURL || undefined
      };
      
      await saveUser(user);
      onSuccess(appUser, token);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError(t("loginCancelled") || 'Sign-in cancelled. Please try again.');
      } else {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const result = await signInAnonymously(auth);
      const user = result.user;
      
      const appUser: User = {
        uid: user.uid,
        displayName: 'Guest User',
        email: '',
        isCreator: false,
      };
      
      await saveUser(user);
      onSuccess(appUser);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed') {
        setError('Please enable Anonymous Auth in your Firebase Console (Authentication > Sign-in method).');
      } else {
        setError(err.message || 'Failed to sign in as guest');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 40 }}
        transition={{ type: "spring", damping: 30, stiffness: 400 }}
        className="relative w-full max-w-md p-10 rounded-3xl shadow-[0_20px_80px_rgba(0,0,0,0.8)] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/50 overflow-hidden group"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-50" />
        
        <div className="flex flex-col items-center mb-10 relative z-10">
          <div className="mb-6 p-4 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 shadow-2xl shadow-indigo-600/10">
            <Icons.Logo className="w-12 h-12 text-indigo-500" />
          </div>
          <h2 className="text-3xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">
            {t("welcomeToSofianAI")}
          </h2>
          <p className="text-zinc-500 text-[15px] mt-3 text-center leading-relaxed max-w-[280px]">
            {t("signInToSync")}
          </p>
        </div>

        <div className="space-y-4 relative z-10">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold text-center"
            >
              {error}
            </motion.div>
          )}

          <button 
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-4 bg-white dark:bg-white hover:bg-zinc-100 dark:hover:bg-zinc-100 text-black rounded-2xl text-[15px] font-bold shadow-xl border border-zinc-200 dark:border-transparent transition-all active:scale-[0.97] flex items-center justify-center gap-3 disabled:opacity-50 group/btn"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5 transition-transform group-hover/btn:scale-110" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {t("continueWithGoogle")}
              </>
            )}
          </button>

          <button 
            onClick={handleGuestLogin}
            disabled={isLoading}
            className="w-full py-4 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-2xl text-[15px] font-bold border border-zinc-200 dark:border-zinc-800 transition-all active:scale-[0.97] flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {t("continueAsGuest")}
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-zinc-900 flex justify-center relative z-10">
          <p className="text-[11px] text-zinc-600 font-bold uppercase tracking-widest">
            {t("premiumExperience")}
          </p>
        </div>
        
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
      </motion.div>
    </div>
  );
};

export default AuthModal;
