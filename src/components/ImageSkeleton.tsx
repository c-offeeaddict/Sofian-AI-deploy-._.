import React from 'react';
import { motion } from 'motion/react';

const ImageSkeleton: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 0.5 }}
      animate={{ opacity: 1 }}
      transition={{ repeat: Infinity, repeatType: "reverse", duration: 1 }}
      className="w-full max-w-[240px] h-48 rounded-2xl bg-zinc-200 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 flex items-center justify-center"
    >
      <div className="text-zinc-400 dark:text-zinc-600 animate-pulse">Processing...</div>
    </motion.div>
  );
};

export default ImageSkeleton;
