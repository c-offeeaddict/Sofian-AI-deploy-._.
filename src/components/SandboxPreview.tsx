import React, { useMemo, useState, useEffect } from "react";
import { Icons } from "../constants";
import { motion, AnimatePresence } from "motion/react";

interface SandboxPreviewProps {
  code: string;
  type: "html" | "react";
  title?: string;
  dependencies?: string[];
  onClose?: () => void;
}

const SandboxPreview: React.FC<SandboxPreviewProps> = ({
  code,
  type,
  title,
  dependencies = [],
  onClose,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("preview");
  const [refreshKey, setRefreshKey] = useState(0);

  // Prevent scrolling when expanded
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isExpanded]);

  const renderDeps = (deps: string[]) => {
    return deps
      .map((d) => {
        if (d.endsWith(".css")) {
          return `<link rel="stylesheet" href="${d}">`;
        }
        return `<script src="${d}"></script>`;
      })
      .join("\n");
  };

  const srcDoc = useMemo(() => {
    if (type === "html") {
      const deps = renderDeps(dependencies);
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            ${deps}
            <style>
              body { margin: 0; padding: 0; font-family: sans-serif; min-height: 100vh; display: flex; flex-direction: column; }
              #content { flex: 1; }
            </style>
          </head>
          <body>
            <div id="content">${code}</div>
          </body>
        </html>
      `;
    } else {
      // React Template
      const deps = renderDeps(dependencies);
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://unpkg.com/lucide-react/dist/umd/lucide-react.js"></script>
            <script src="https://unpkg.com/recharts/umd/Recharts.js"></script>
            ${deps}
            <style>
              body { margin: 0; padding: 0; min-height: 100vh; background: transparent; }
              #root { min-height: 100vh; display: flex; flex-direction: column; }
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel" data-type="module" data-presets="react,env">
              window.exports = {};
              window.module = { exports: window.exports };
              window.require = function(moduleName) {
                if (moduleName === 'react') return React;
                if (moduleName === 'react-dom') return ReactDOM;
                if (moduleName === 'lucide-react') return window.lucide || {};
                if (moduleName === 'recharts') return window.Recharts || {};
                console.warn('Module not found in sandbox:', moduleName);
                return {};
              };

              const { useState, useEffect, useMemo, useRef, useCallback } = React;
              
              try {
                ${code}
              } catch (parseError) {
                console.error("Sandbox Parse Error:", parseError);
                document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif;"><b>Parse Error:</b><br/>' + parseError.message + '</div>';
              }

              try {
                const AppComp = window.exports.default || (typeof App !== 'undefined' ? App : (typeof Main !== 'undefined' ? Main : null));
                if (AppComp) {
                    const root = ReactDOM.createRoot(document.getElementById('root'));
                    root.render(React.createElement(AppComp));
                } else {
                    console.warn("No App component exported or defined.");
                }
              } catch (e) {
                console.error("Sandbox Runtime Error:", e);
                document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif;"><b>Runtime Error:</b><br/>' + e.message + '</div>';
              }
            </script>
          </body>
        </html>
      `;
    }
  }, [code, type, dependencies]);

  const handleDownload = () => {
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "sandbox-app").toLowerCase().replace(/\s+/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const PreviewContent = ({
    expanded = false,
    onToggleExpand,
  }: {
    expanded?: boolean;
    onToggleExpand?: () => void;
  }) => {
    const handleClose = () => {
      if (expanded && onToggleExpand) {
        onToggleExpand();
      } else {
        setIsDismissed(true);
      }
    };

    return (
      <div
        className={`flex flex-col h-full bg-white dark:bg-zinc-950 ${expanded ? "fixed inset-0 z-[10000]" : "rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"}`}
      >
        {/* Mobile App Style Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 select-none shrink-0 bg-[#161616] text-zinc-100 ${expanded ? "absolute top-0 left-0 right-0 z-[10001] h-14" : "h-14 rounded-t-2xl"}`}
        >
          <button
            onClick={handleClose}
            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
          >
            <Icons.ArrowLeft className="w-4 h-4" />
            <span className="font-medium text-[15px]">
              {type === "html" ? "html" : "react"}
            </span>
          </button>

          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors hidden sm:flex"
          >
            <Icons.RefreshCw className="w-4 h-4" />
          </button>

          <div className="flex items-center bg-[#282828] rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab("code")}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${activeTab === "code" ? "bg-[#3b3b3b] text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Code
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${activeTab === "preview" ? "bg-[#3b3b3b] text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Preview
            </button>
          </div>
        </div>

        <div
          className={`relative w-full bg-white dark:bg-zinc-950 flex-1 overflow-auto ${expanded ? "h-full pt-14" : "aspect-[9/16] sm:aspect-video"}`}
        >
          {activeTab === "preview" ? (
            <iframe
              key={refreshKey}
              title={title || "Sandbox Preview"}
              srcDoc={srcDoc}
              className="w-full h-full border-none bg-white"
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
            />
          ) : (
            <div className="p-4 bg-zinc-950 h-full w-full overflow-auto text-zinc-300 font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {code}
            </div>
          )}

          {!expanded && (
            <div className="absolute bottom-4 right-4 z-10 flex gap-2">
              <button
                onClick={onToggleExpand || (() => setIsExpanded(!expanded))}
                className="p-2 bg-black/50 hover:bg-black/80 backdrop-blur-md rounded-full text-white transition-all shadow-lg"
              >
                <Icons.Maximize className="w-4 h-4" />
              </button>
              <button
                onClick={handleDownload}
                className="p-2 bg-black/50 hover:bg-black/80 backdrop-blur-md rounded-full text-white transition-all shadow-lg"
              >
                <Icons.Download className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isDismissed) return null;

  return (
    <>
      <div className="mt-4 w-full">
        <PreviewContent />
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
            onClick={() => setIsExpanded(false)}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <PreviewContent
                expanded
                onToggleExpand={() => setIsExpanded(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SandboxPreview;
