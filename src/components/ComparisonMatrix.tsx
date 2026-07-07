
import React from 'react';
import { motion } from 'motion/react';

interface ComparisonMatrixProps {
  headers: string[];
  rows: { label: string; values: string[] }[];
}

const ComparisonMatrix: React.FC<ComparisonMatrixProps> = ({ headers, rows }) => {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900/50">
              <th className="p-4 font-bold text-zinc-400 uppercase tracking-widest text-[10px]">Criteria</th>
              {headers.map((h, i) => (
                <th key={i} className="p-4 font-bold text-zinc-900 dark:text-white border-l border-zinc-200 dark:border-zinc-800">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <motion.tr 
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
              >
                <td className="p-4 font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-50/10 dark:bg-zinc-900/10">{row.label}</td>
                {row.values.map((v, j) => (
                  <td key={j} className="p-4 text-zinc-500 dark:text-zinc-400 border-l border-zinc-200 dark:border-zinc-800">{v}</td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ComparisonMatrix;
