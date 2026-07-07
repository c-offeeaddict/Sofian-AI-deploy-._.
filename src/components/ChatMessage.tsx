
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Message, ToolOutput } from '../types';
import { Icons } from '../constants';
import DataChart from './DataChart';
import SandboxPreview from './SandboxPreview';
import MapComponent from './MapComponent';
import Timeline from './Timeline';
import ComparisonMatrix from './ComparisonMatrix';
import { AgentSwarmDashboard } from './AgentSwarmDashboard';
import { useMapsLibrary, useMap } from '@vis.gl/react-google-maps';
import { useTranslation } from '../translations';

const CodeBlock = ({ children, language = 'en', ...props }: any) => {
    const [isCopied, setIsCopied] = useState(false);
    const { t } = useTranslation(language);
    
    const getCodeText = (nodes: any): string => {
        return React.Children.toArray(nodes)
            .map((node: any) => {
                if (typeof node === 'string') return node;
                if (node.props && node.props.children) return getCodeText(node.props.children);
                return '';
            })
            .join('');
    };

    const copyCode = () => {
        const text = getCodeText(children);
        navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <div className="relative group/code my-4">
            <button 
                onClick={copyCode}
                className={`absolute right-4 top-4 p-2.5 rounded-xl transition-all duration-500 z-10 shadow-xl backdrop-blur-md border ${
                    isCopied 
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 scale-110 opacity-100' 
                    : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 text-zinc-500 opacity-0 group-hover/code:opacity-100 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
                } shadow-md dark:shadow-xl`}
                title={t("copyCode")}
            >
                {isCopied && (
                    <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute inset-0 bg-emerald-500/10 blur-md"
                    />
                )}
                <span className="relative z-10">
                    {isCopied ? <Icons.Check className="w-4 h-4" /> : <Icons.Copy className="w-4 h-4" />}
                </span>
            </button>
            <pre {...props} className="bg-zinc-50 dark:bg-black/60 border border-zinc-200 dark:border-white/5 p-6 rounded-2xl overflow-x-auto shadow-inner font-mono text-[13px] leading-relaxed">
                {children}
            </pre>
        </div>
    );
};
import ImageSkeleton from './ImageSkeleton';

interface ChatMessageProps {
  message: Message;
  stopAllTrigger: number;
  onSave?: (msg: Message) => void;
  onSuggestionClick?: (s: string) => void;
  onEdit?: (newContent: string) => void;
  onCameraClick?: () => void;
  onSettingsClick?: () => void;
  focusMode?: boolean;
  language?: string;
}

const MapSearchWrapper: React.FC<{ query: string, location?: string }> = ({ query, location: locOverride }) => {
    const placesLib = useMapsLibrary('places');
    const [places, setPlaces] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const MAPS_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
    const hasGoogleKey = Boolean(MAPS_KEY) && MAPS_KEY !== 'YOUR_API_KEY' && MAPS_KEY !== '';
    const [engine, setEngine] = useState<'google' | 'osm'>(hasGoogleKey ? 'google' : 'osm');

    const searchOSM = async (searchQuery: string) => {
        try {
            setLoading(true);
            setError(null);
            
            // Try querying through our secure, CORS-compliant backup proxy first
            let response = await fetch(`/api/places?q=${encodeURIComponent(searchQuery)}`);
            
            // Safeguard fallback to direct client-side OSM query if the proxy is unresponsive or fails
            if (!response.ok) {
                response = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=10`,
                    {
                        headers: {
                            'Accept-Language': 'en'
                        }
                    }
                );
            }
            
            if (!response.ok) {
                throw new Error(`OpenStreetMap Search failed: ${response.statusText}`);
            }
            const data = await response.json();
            const mapped = data.map((item: any) => ({
                id: `osm-${item.place_id}`,
                displayName: item.name || item.display_name.split(',')[0],
                formattedAddress: item.display_name,
                location: {
                    lat: parseFloat(item.lat),
                    lng: parseFloat(item.lon)
                },
                rating: undefined,
                userRatingCount: undefined
            }));
            setPlaces(mapped);
            setLoading(false);
        } catch (err: any) {
            console.error("OSM Search Error:", err);
            setError(err.message || String(err));
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!query) return;

        if (engine === 'osm') {
            searchOSM(query);
            return;
        }

        if (!placesLib) {
            // If the Map library is not loaded but we have the Google Key, wait or fallback
            if (!hasGoogleKey) {
                setEngine('osm');
            }
            return;
        }
        
        setLoading(true);
        setError(null);
        placesLib.Place.searchByText({
            textQuery: query,
            fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount'],
            maxResultCount: 10,
        }).then(({ places }) => {
            const mappedPlaces = places.map(p => ({
                id: p.id!,
                displayName: (p as any).displayName || 'Unknown',
                formattedAddress: (p as any).formattedAddress || '',
                location: {
                    lat: p.location!.lat(),
                    lng: p.location!.lng()
                },
                rating: (p as any).rating,
                userRatingCount: (p as any).userRatingCount
            }));
            setPlaces(mappedPlaces);
            setLoading(false);
        }).catch(err => {
            console.error("Place search error:", err);
            const errMsg = err.message || String(err);
            const lowerMsg = errMsg.toLowerCase();
            
            // If Google Search fails due to billing, permissions, invalid key, or invalid arguments, offer OSM fallback gracefully
            if (
                lowerMsg.includes('permission_denied') || 
                lowerMsg.includes('unregistered') || 
                lowerMsg.includes('api key') ||
                lowerMsg.includes('invalid') ||
                lowerMsg.includes('credentials') ||
                lowerMsg.includes('not allow') ||
                lowerMsg.includes('billing') ||
                lowerMsg.includes('quota') ||
                lowerMsg.includes('invalid_argument')
            ) {
                console.log("Permission/Billing/Invalid-key issue detected in Google Places API. Switching automatically to OpenStreetMap.");
                setEngine('osm');
            } else {
                setError(errMsg);
                setLoading(false);
            }
        });
    }, [placesLib, query, engine]);

    if (loading) {
        return (
            <div className="w-full h-[350px] rounded-2xl bg-zinc-100 dark:bg-zinc-900/50 animate-pulse border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 rounded-full border-t-2 border-indigo-500 animate-spin" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Searching local intelligence...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full rounded-2xl bg-red-500/5 border border-red-500/20 p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3 text-red-500">
                    <Icons.AlertTriangle className="w-5 h-5" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Local Intelligence Search Error</span>
                </div>
                <p className="text-[12px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
                    Search engine was unable to load results: {error}
                </p>
                <button 
                    onClick={() => setEngine('osm')}
                    className="self-start px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
                >
                    Switch to Free OpenStreetMap
                </button>
            </div>
        );
    }

    if (places.length === 0) {
        return (
            <div className="w-full h-32 rounded-2xl bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center p-6 gap-2">
                <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider text-center">No results found for "{query}" in this area.</p>
                {engine === 'google' && (
                    <button 
                        onClick={() => setEngine('osm')} 
                        className="text-[10px] text-indigo-500 hover:underline capitalize"
                    >
                        Try with OpenStreetMap (Free, Billing-exempt)
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <MapComponent places={places} engine={engine} />
            
            <div className="flex items-center justify-between px-2 text-[10px] text-zinc-400 font-medium">
                {engine === 'google' ? (
                    <>
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Google Maps Engine Active
                        </span>
                        <button 
                            onClick={() => setEngine('osm')} 
                            className="text-indigo-500 hover:underline hover:text-indigo-400"
                        >
                            Switch to Free OpenStreetMap (No Card Required)
                        </button>
                    </>
                ) : (
                    <>
                        <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            OpenStreetMap Engine Active (No Billing Required)
                        </span>
                        {hasGoogleKey && (
                            <button 
                                onClick={() => setEngine('google')} 
                                className="text-indigo-500 hover:underline hover:text-indigo-400"
                            >
                                Switch to Google Maps
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

const ToolOutputView: React.FC<{ output: ToolOutput, language?: string }> = ({ output, language = 'en' }) => {
    const { t } = useTranslation(language);

    if (output.type === 'agent_swarm') {
        return <AgentSwarmDashboard query={output.meta?.query || ""} />;
    }

    if (output.type === 'call_e') {
        return (
            <div className="mt-4 flex justify-start">
                <div className="flex flex-col items-center justify-center px-10 py-8 rounded-[32px] bg-[#1e1412] shadow-2xl min-w-[300px]">
                    <div className="w-14 h-14 bg-[#ffd13b] rounded-full flex items-center justify-center mb-5">
                       <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="#ffd13b" stroke="#100a09" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                         <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                         <line x1="10" y1="9" x2="10" y2="12" strokeWidth="3"></line>
                         <line x1="15" y1="9" x2="15" y2="12" strokeWidth="3"></line>
                         <path d="M10 16h5"></path>
                       </svg>
                    </div>
                    <div className="text-[#f5f5f5] text-[22px] font-medium tracking-wide mb-1.5 flex items-center gap-2">
                        CALL-E
                    </div>
                    <div className="text-[#cac4c2] text-[15px] font-medium">dashboard.heycall-e.com</div>
                </div>
            </div>
        );
    }

    if (output.type === 'timeline') {
        return (
            <div className="mt-4 p-6 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800/50">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6 px-1">Neural Timeline Breakdown</h3>
                <Timeline items={output.meta?.items || []} />
            </div>
        );
    }

    if (output.type === 'comparison_matrix') {
        return (
            <div className="mt-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 px-1">Side-by-Side Analysis</h3>
                <ComparisonMatrix headers={output.meta?.headers || []} rows={output.meta?.rows || []} />
            </div>
        );
    }

    if (output.type === 'code') {
        return (
            <div className="mt-3 rounded-2xl overflow-hidden font-mono text-[11px] border bg-zinc-50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800/50 shadow-inner">
                <div className="flex items-center px-4 py-2 border-b bg-zinc-100 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800/50">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/30 border border-red-500/20" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/30 border border-amber-500/20" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/30 border border-green-500/20" />
                    </div>
                    <span className="ms-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t("terminal")}</span>
                </div>
                <div className="p-4">
                    <div className="text-indigo-600 dark:text-indigo-400/80 mb-2 font-bold">$ {output.meta?.language === 'python' ? 'python3' : 'node'} script.js</div>
                    <pre className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed">{output.content}</pre>
                </div>
            </div>
        );
    }
    
    if (output.type === 'integration') {
        const isJira = output.service === 'jira';
        const isGithub = output.service === 'github';
        
        return (
            <div className="mt-3 flex items-center gap-4 p-4 rounded-2xl border bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/50 hover:border-zinc-300 transition-all group/tool shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-lg ${isJira ? 'bg-blue-600/20 text-blue-400' : isGithub ? 'bg-zinc-800 text-white' : 'bg-purple-600/20 text-purple-400'}`}>
                    {isJira ? '🔷' : isGithub ? '🐙' : '#'}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white transition-colors">{output.content}</p>
                    <p className="text-[11px] text-zinc-500 truncate font-medium mt-0.5">
                        {isJira ? output.meta?.summary : isGithub ? `${output.meta?.repo} (${output.meta?.commit})` : output.meta?.channel}
                    </p>
                </div>
                <div className="px-3 py-1 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest font-bold">
                    {t("success")}
                </div>
            </div>
        );
    }

    if (output.type === 'pdf' || output.type === 'docx') {
        const isDocx = output.type === 'docx';
        return (
            <div className={`mt-3 flex items-center gap-4 p-4 rounded-2xl border bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/50 transition-all shadow-sm ${isDocx ? 'hover:border-blue-500/50 group/docx' : 'hover:border-indigo-500/50 group/pdf'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform ${isDocx ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover/docx:scale-110' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 group-hover/pdf:scale-110'}`}>
                    <Icons.FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{output.meta?.filename || (isDocx ? 'document.docx' : 'document.pdf')}</p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5 uppercase tracking-wider">{isDocx ? 'Word Document' : t("pdfDocument")}</p>
                </div>
                {output.meta?.dataUri && (
                    <a 
                        href={output.meta?.dataUri} 
                        download={output.meta?.filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-4 py-2 rounded-xl text-white text-[11px] font-bold transition-all active:scale-95 shadow-lg flex items-center gap-2 ${isDocx ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'}`}
                    >
                        <Icons.Download className="w-3.5 h-3.5" />
                        {t("download")}
                    </a>
                )}
            </div>
        );
    }

    if (output.type === 'xlsx') {
        return (
            <div className="mt-3 flex items-center gap-4 p-4 rounded-2xl border bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/50 hover:border-emerald-500/50 transition-all group/xlsx shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm transition-transform group-hover/xlsx:scale-110">
                    <Icons.Table className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{output.meta?.filename || 'spreadsheet.xlsx'}</p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5 uppercase tracking-wider">Excel Spreadsheet</p>
                </div>
                {output.meta?.dataUri && (
                    <a 
                        href={output.meta?.dataUri} 
                        download={output.meta?.filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all active:scale-95 shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                    >
                        <Icons.Download className="w-3.5 h-3.5" />
                        {t("download")}
                    </a>
                )}
            </div>
        );
    }

    if (output.type === 'ppt') {
        return (
            <div className="mt-3 flex items-center gap-4 p-4 rounded-2xl border bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/50 hover:border-orange-500/50 transition-all group/ppt shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-sm transition-transform group-hover/ppt:scale-110">
                    <Icons.Presentation className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{output.meta?.filename || 'presentation.pptx'}</p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5 uppercase tracking-wider">PowerPoint</p>
                </div>
                {/* Note: pptxgenjs downloads in place normally, but we can try to use standard data URI if available. Let's just create a button that uses the data URI */}
                {output.meta?.dataUri && (
                  <a 
                      href={output.meta?.dataUri} 
                      download={output.meta?.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold transition-all active:scale-95 shadow-lg shadow-orange-600/20 flex items-center gap-2"
                  >
                      <Icons.Download className="w-3.5 h-3.5" />
                      {t("download")}
                  </a>
                )}
            </div>
        );
    }

    if (output.type === 'sandbox') {
        return (
            <SandboxPreview 
                code={output.meta?.code} 
                type={output.meta?.type} 
                title={output.meta?.title} 
                dependencies={output.meta?.dependencies} 
            />
        );
    }

    if (output.service === 'research') {
        const isScreenshot = !!output.meta?.screenshot || !!output.meta?.screenshot_loading;
        const isLoading = !!output.meta?.loading;
        const url = output.meta?.url;
        const title = output.meta?.title;

        return (
            <div className="mt-4 space-y-4">
                {/* Kimi-style Progress Timeline */}
                <div className="space-y-3 px-1">
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full border-2 border-indigo-500 flex items-center justify-center">
                            {isLoading ? (
                                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                            ) : (
                                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            )}
                        </div>
                        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                           {isLoading ? t('researching') : 'Research complete'}
                           <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 text-[8px] tracking-widest">DEEP_ANALYSIS</span>
                        </span>
                    </div>

                    <div className="ml-2.5 pl-6 border-l-2 border-zinc-100 dark:border-zinc-800 space-y-4 pb-2">
                        {/* Step 1: Browse */}
                        <div className="relative">
                            <div className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" />
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400">Navigated to Source</p>
                                <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 flex items-center justify-between group">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Icons.Monitor className="w-3 h-3 text-zinc-400" />
                                        <span className="text-[9px] font-mono text-zinc-400 truncate">{url}</span>
                                    </div>
                                    <a href={url} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-indigo-500 transition-colors">
                                        <Icons.ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        </div>

                        {/* Step 2: Content/Screenshot */}
                        <div className="relative">
                            <div className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-950 ${isLoading ? 'bg-zinc-300 dark:bg-zinc-700 animate-pulse' : 'bg-emerald-500'}`} />
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
                                        {isScreenshot ? t('viewingInterface') : 'Extracted Intelligence'}
                                    </p>
                                    {!isLoading && (
                                        <span className="text-[9px] text-emerald-500 font-bold tracking-tighter uppercase italic">Verified</span>
                                    )}
                                </div>

                                {isLoading ? (
                                    <div className="h-24 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col items-center justify-center gap-2">
                                        <Icons.Search className="w-5 h-5 text-zinc-400 animate-spin" />
                                        <span className="text-[10px] text-zinc-500 font-mono">Connecting to source data stream...</span>
                                    </div>
                                ) : isScreenshot ? (
                                    <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 group bg-zinc-50 dark:bg-black/20">
                                        <img 
                                            src={output.meta.screenshot} 
                                            alt="Intelligence Capture" 
                                            className="w-full h-auto max-h-[300px] object-cover transition-transform duration-700 group-hover:scale-105" 
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-4 flex flex-col justify-end">
                                            <p className="text-white text-[10px] font-bold tracking-widest uppercase">Visual Fingerprint</p>
                                            <p className="text-zinc-400 text-[9px] font-mono">Capture Metadata Resolved</p>
                                        </div>
                                        <div className="absolute top-3 right-3">
                                            <div className="px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10 text-white text-[8px] font-bold">
                                                LIVE_CAPTURE
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 relative overflow-hidden group">
                                        <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-110 transition-transform">
                                            <Icons.Search className="w-12 h-12" />
                                        </div>
                                        <p className="text-[11px] font-bold text-indigo-500 mb-1">{title || 'Data Segment'}</p>
                                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed italic z-10 relative">
                                            {output.meta?.markdown?.substring(0, 400)}...
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Step 3: Synthesis */}
                        <div className="relative pt-2">
                            <div className={`absolute -left-[31px] top-3 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-950 ${isLoading ? 'bg-zinc-200 dark:bg-zinc-800' : 'bg-indigo-500 animate-pulse'}`} />
                            <p className={`text-[10px] font-bold italic ${isLoading ? 'text-zinc-400' : 'text-indigo-500'}`}>
                                {isLoading ? 'Awaiting data synthesis...' : 'Synthesizing final findings...'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (output.type === 'success') {
         if (output.meta?.type === 'places_search') {
             return (
                 <div className="mt-4 space-y-3">
                     <div className="flex items-center gap-2 px-1">
                         <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center">
                             <Icons.MapPin className="w-3 h-3 text-indigo-500" />
                         </div>
                         <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">
                             {output.meta.query}
                         </span>
                     </div>
                     <MapSearchWrapper query={output.meta.query} location={output.meta.location} />
                 </div>
             );
         }
         if (output.meta?.loading) {
             return (
                 <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/5 border border-indigo-500/20 text-[11px] font-bold text-indigo-500 shadow-sm">
                     <svg className="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                     </svg>
                     {output.content}
                 </div>
             );
         }
         return (
             <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-[11px] font-bold text-emerald-400 shadow-sm">
                 <Icons.Check className="w-3.5 h-3.5" />
                 {output.content}
             </div>
         );
    }

    if (output.type === 'error') {
        return (
            <div className="mt-3 flex flex-col gap-2 p-4 rounded-2xl border bg-red-500/5 border-red-500/20 text-[12px] font-medium text-red-500 shadow-sm">
                <div className="flex items-center gap-2">
                    <Icons.AlertTriangle className="w-4 h-4" />
                    {output.content}
                </div>
                {output.meta?.link && (
                    <a 
                        href={output.meta.link} 
                        target="_blank" 
                        rel="noreferrer"
                        className="mt-1 text-red-600 dark:text-red-400 font-bold hover:underline underline-offset-4 flex items-center gap-1 w-fit"
                    >
                        {t("fixIssue")}
                        <Icons.ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>
        );
    }

    return null;
};

const GeneratedImage = ({ src, t, language }: { src: string, t: any, language: string }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  return (
    <div className="relative group/asset rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 max-w-[400px] w-full bg-zinc-100 dark:bg-black shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-700">
      <div className={`relative w-full pb-[100%] ${status === 'loading' ? 'bg-zinc-200 dark:bg-zinc-800 animate-pulse' : ''}`}>
        {status === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-2 bg-zinc-50 dark:bg-zinc-900">
            <Icons.AlertTriangle className="w-8 h-8 text-zinc-500" />
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t("imageUnavailable") || "Image Unavailable"}</p>
            <a 
              href={src} 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-2 text-[9px] text-indigo-500 hover:underline"
            >
              {t("viewSource") || "View Source"}
            </a>
          </div>
        ) : (
          <img 
            src={src} 
            alt="Generated Asset" 
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setStatus('success')}
            onError={() => setStatus('error')}
            referrerPolicy="no-referrer"
          />
        )}
        
        {status === 'success' && (
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover/asset:opacity-100 transition-opacity flex items-center justify-between pointer-events-none z-10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">{t("neuralAsset")}</span>
            </div>
            <button 
              onClick={() => {
                const link = document.createElement('a');
                link.href = src;
                link.download = `sofian-ai-asset-${Date.now()}.png`;
                link.click();
              }}
              className="p-2 rounded-xl bg-white/20 hover:bg-white/40 text-white backdrop-blur-md transition-all active:scale-90 pointer-events-auto"
              title={t("download")}
            >
              <Icons.Download className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  stopAllTrigger, 
  onSave, 
  onSuggestionClick, 
  onEdit,
  onCameraClick,
  onSettingsClick,
  focusMode,
  language = 'en'
}) => {
  const { t } = useTranslation(language);
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const messageRef = useRef<HTMLDivElement>(null);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveEdit = () => {
    if (editContent.trim() !== message.content) {
      onEdit?.(editContent);
    }
    setIsEditing(false);
  };

  const handleCopySelection = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString();
    if (selectedText) {
      navigator.clipboard.writeText(selectedText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -10 }}
      transition={{ 
        type: "spring",
        stiffness: 260,
        damping: 20
      }}
      className={`flex w-full mb-6 message-appear group ${isAssistant ? 'justify-start' : 'justify-end'}`}
    >
      <div className={`w-full grid gap-4 max-w-full ${
        isAssistant 
          ? 'grid-cols-[40px_1fr] lg:grid-cols-[40px_1fr_200px]' 
          : 'grid-cols-[1fr_40px] lg:grid-cols-[200px_1fr_40px]'
      }`}>
        {/* Avatar */}
        <div className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-500 hover:scale-110 active:scale-95 cursor-pointer ${
          isAssistant 
            ? 'bg-indigo-600 text-white col-start-1 row-start-1 neural-glow' 
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 col-start-2 lg:col-start-3 row-start-1 hover:bg-zinc-200 dark:hover:bg-zinc-700'
        }`}>
          {isAssistant ? <span className="font-poppins font-bold text-sm">SA</span> : <div className="text-[10px] font-bold">{t("me")}</div>}
        </div>
        
        {/* Content */}
        <div className={`flex flex-col gap-2 min-w-0 ${
          isAssistant 
            ? 'col-start-2 row-start-1 items-start' 
            : 'col-start-1 lg:col-start-2 row-start-1 items-end'
        }`}>

          {isAssistant && (message.generatedImage || message.toolOutputs?.some(t => t.type === 'code') || message.content.includes('json-chart')) && (
            <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
              <Icons.Sparkles className="w-3 h-3" />
              <span>{t("responseAsset")}</span>
            </div>
          )}
          
          <div className={`relative px-4 py-3 rounded-2xl border transition-all duration-500 chat-bubble-shadow ${
            isAssistant 
              ? 'bg-white/80 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/50 text-zinc-900 dark:text-zinc-100 rounded-ss-none backdrop-blur-3xl'
              : 'bg-indigo-600 border-indigo-500 text-white rounded-se-none shadow-indigo-600/20'
          } ${isAssistant ? 'hover:bg-white dark:hover:bg-zinc-900/60' : 'hover:brightness-110'} interaction-smooth`}>

            <AnimatePresence>
            {isAssistant && message.thought && (
              <motion.details 
                key="message-thought"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl px-4 py-3 mb-3 transition-all cursor-pointer relative overflow-hidden group/thought border bg-zinc-100/50 dark:bg-zinc-950/30 border-zinc-200/50 dark:border-zinc-800/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/50 w-full"
              >
                <summary className="text-[10px] font-bold uppercase tracking-widest flex items-center justify-between text-zinc-500 group-hover/thought:text-zinc-400 transition-colors list-none">
                  <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                      <span>{t("neuralReasoning")}</span>
                  </div>
                  <Icons.ChevronRight className="w-3 h-3 group-open/thought:rotate-90 transition-transform" />
                </summary>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-[11px] font-mono leading-relaxed select-text border-s-2 ps-4 py-1 whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
                >
                  {message.thought}
                </motion.div>
              </motion.details>
            )}
            </AnimatePresence>

            {isEditing ? (
              <div className="flex flex-col gap-3">
                <textarea 
                  value={editContent} 
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-black/20 rounded-xl p-4 text-[14px] outline-none border border-white/20 focus:border-white/40 resize-none font-mono text-white"
                  rows={4}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                   <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/20 transition-colors">{t("cancel")}</button>
                   <button onClick={handleSaveEdit} className="px-4 py-2 text-xs font-bold rounded-xl bg-white text-black hover:bg-zinc-200 transition-colors">{t("saveChanges")}</button>
                </div>
              </div>
            ) : (
              <div ref={messageRef} className={`markdown-body select-text leading-relaxed w-full overflow-hidden break-words whitespace-pre-wrap text-pretty ${focusMode ? 'text-[14px]' : 'text-[13px]'}`}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 underline underline-offset-4 decoration-2 transition-colors break-all" />,
                    table: ({node, ...props}) => (
                        <div className="table-container my-4 w-full max-w-full overflow-x-auto block border rounded-2xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-inner">
                            <table {...props} className="min-w-full divide-y text-[12px] divide-zinc-200 dark:divide-zinc-800" />
                        </div>
                    ),
                    thead: ({node, ...props}) => <thead {...props} className="bg-zinc-50 dark:bg-zinc-900" />,
                    tbody: ({node, ...props}) => <tbody {...props} className="divide-y divide-zinc-200 dark:divide-zinc-800" />,
                    tr: ({node, ...props}) => <tr {...props} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5" />,
                    th: ({node, ...props}) => <th {...props} className="px-4 py-3 text-start text-[10px] font-bold uppercase tracking-widest whitespace-nowrap sticky top-0 z-10 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900" />,
                    td: ({node, ...props}) => <td {...props} className="px-4 py-3 text-[13px] whitespace-nowrap text-zinc-700 dark:text-zinc-300" />,
                    code: ({node, className, children, ...props}) => {
                        const match = /language-(\w+)/.exec(className || '');
                        if (match && match[1] === 'json-chart') {
                            try {
                                const chartData = JSON.parse(String(children).replace(/\n$/, ''));
                                return <DataChart {...chartData} />;
                            } catch (e) {
                                return <code {...props} className="bg-red-500/10 text-red-400 px-2 py-1 rounded-lg text-[12px] font-mono">Invalid Chart Data</code>;
                            }
                        }
                        return <code {...props} className="bg-zinc-100 dark:bg-white/10 px-2 py-0.5 rounded-lg text-[13px] font-mono break-words whitespace-pre-wrap border border-zinc-200 dark:border-white/5 text-pink-600 dark:text-pink-400">{children}</code>;
                    },
                    pre: (props: any) => <CodeBlock {...props} language={language} />
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
            
            {message.toolOutputs && message.toolOutputs.map((output, idx) => (
                <ToolOutputView key={idx} output={output} language={language} />
            ))}

            {message.sources && message.sources.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex flex-wrap gap-2">
                  {message.sources.map((chunk: any, i: number) => {
                    const web = chunk.web || chunk.maps;
                    if (!web) return null;
                    return (
                      <a key={i} href={web.uri} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-zinc-400 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2">
                        🔗 {web.title || 'Source'}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
          
          {/* Suggestions removed as per user request */}
        </div>

        {/* Attachments & Actions */}
        <div className={`flex flex-col gap-3 ${
          isAssistant 
            ? 'col-start-2 row-start-2 lg:col-start-3 lg:row-start-1 items-end' 
            : 'col-start-1 row-start-2 lg:col-start-1 lg:row-start-1 items-end'
        }`}>
            {message.attachment && (
              <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 max-w-[240px] bg-zinc-100 dark:bg-black shadow-2xl">
                {!message.attachment.fullData ? (
                  <ImageSkeleton />
                ) : message.attachment.mimeType.startsWith('video/') ? (
                  <video src={message.attachment.fullData} controls className="w-full max-h-48 object-contain" />
                ) : message.attachment.mimeType === 'application/pdf' ? (
                  <div className="flex items-center gap-3 p-4 bg-zinc-100 dark:bg-zinc-900/80">
                    <div className="text-2xl">📄</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{message.attachment.name}</p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">PDF Document</p>
                    </div>
                  </div>
                ) : (
                  <img src={message.attachment.fullData} alt="Upload" className="w-full object-cover max-h-48" />
                )}
              </div>
            )}

            {message.generatedImage && (
              <GeneratedImage src={message.generatedImage} t={t} language={language} />
            )}

            <div className={`flex flex-wrap items-center gap-2 justify-end`}>
              {!isAssistant && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="p-2 rounded-lg transition-all text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" title="Edit Message">
                  <Icons.Edit className="w-4 h-4" />
                </button>
              )}
              <button onClick={handleCopySelection} className="p-2 rounded-lg transition-all text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" title="Copy Selection">
                <Icons.TextSelect className="w-4 h-4" />
              </button>
              <button onClick={handleCopy} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-medium border ${copied ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`} title="Copy Message">
                {copied ? <Icons.Check className="w-4 h-4" /> : <Icons.Copy className="w-4 h-4" />}
                {copied ? 'Copied' : ''}
              </button>
            </div>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(ChatMessage, (prevProps, nextProps) => {
  return (
    prevProps.message === nextProps.message &&
    prevProps.stopAllTrigger === nextProps.stopAllTrigger &&
    prevProps.focusMode === nextProps.focusMode
  );
});
