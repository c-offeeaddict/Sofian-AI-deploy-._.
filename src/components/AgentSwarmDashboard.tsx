import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ZAxis } from "recharts";

interface SubAgentState {
  id: string;
  name: string;
  status: "idle" | "active" | "checking" | "completed" | "error";
  currentStep: string;
  logs: string[];
}

interface SpreadsheetRow {
  id: string;
  ticker: string;
  strategy: string;
  sharpe: number;
  weight: number;
  status: string;
}

export const AgentSwarmDashboard: React.FC<{ query: string }> = ({ query }) => {
  const [phase, setPhase] = useState<"creating" | "executing" | "calculating" | "completed">("creating");
  const [activeTab, setActiveTab] = useState<"hub" | "spreadsheet" | "chart" | "presentation">("hub");
  
  const [agents, setAgents] = useState<Record<string, SubAgentState>>({});
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [finalData, setFinalData] = useState<SpreadsheetRow[] | null>(null);
  
  const [selectedSlide, setSelectedSlide] = useState(0);

  const startSwarmExecution = async () => {
    setPhase("executing");
    setSystemLogs(prev => [...prev, `Initializing Multi-Agent Swarm for query: "${query}"`]);
    try {
      const response = await fetch("/api/swarm/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let run = true;
      while (run) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        
        for (const line of events) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (!dataStr) continue;
            
            try {
              const event = JSON.parse(dataStr);
              
              if (event.type === "error") {
                setSystemLogs(prev => [...prev, `[CRITICAL ERROR] ${event.message}`]);
                setPhase("completed");
                run = false;
                break;
              }

              if (event.type === "orchestrator_plan") {
                 setSystemLogs(prev => [...prev, `[Orchestrator] ${event.message}`]);
              }

              if (event.agentId) {
                setAgents(prev => {
                  const agent = prev[event.agentId] || {
                    id: event.agentId,
                    name: event.agentName || event.agentId,
                    status: "idle",
                    currentStep: "",
                    logs: []
                  };

                  let status = agent.status;
                  let currentStep = agent.currentStep;

                  if (event.type === "agent_start") {
                    status = "active";
                    currentStep = event.message;
                  } else if (event.type === "agent_step") {
                    currentStep = event.message;
                  } else if (event.type === "agent_complete") {
                    status = "completed";
                    currentStep = "Task Output Delivered.";
                    setPhase("calculating");
                  }

                  return {
                    ...prev,
                    [event.agentId]: {
                      ...agent,
                      status,
                      currentStep,
                      logs: [...agent.logs, event.message]
                    }
                  };
                });
              }

              if (event.type === "result_ready") {
                setSystemLogs(prev => [...prev, `[Orchestrator] Swarm operation completely finalized.`]);
                setFinalData(event.data.quantData);
                setPhase("completed");
              }

            } catch(e) {
              console.error("Failed to parse SSE", e);
            }
          }
        }
      }
    } catch (e: any) {
      setSystemLogs(prev => [...prev, `Connection Error: ${e.message}`]);
    }
  };

  useEffect(() => {
    startSwarmExecution();
  }, []);

  const slideDeck = [
    {
      title: "Strategy Overview & Portfolio Yields",
      subtitle: "Execute 5 Quantitative semiconductor strategies over 100+ high-conviction assets.",
      bullets: [
        "Unprecedented multi-agent orchestrated quantitative formulation.",
        "Dynamic capital routing based on standard deviations with expected yields.",
        "Tail-risk hedge model optimized with historical drawdown profiles.",
      ]
    },
    {
      title: "Execution Logistics Engine",
      subtitle: "Step-by-step resolution from Planner, Researcher, and Quant sub-agents.",
      bullets: [
        "Planner generated a 4 phase strict instruction queue.",
        "Researcher pulled verified contextual parameters using GenAI core models.",
        "Quant Analyst materialized variance and correlations."
      ]
    }
  ];

  const agentList = Object.values(agents);

  return (
    <div className="w-full mt-4 text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-3xl overflow-hidden shadow-2xl dark:text-zinc-100 dark:bg-[#0c0d0e] dark:border-zinc-800">
      
      {/* Header Banner */}
      <div className="relative py-6 px-6 bg-zinc-900 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between">
        <div className="relative z-10 space-y-1">
          <p className="text-[11px] font-bold tracking-[0.2em] text-indigo-400 uppercase">SERVER-SIDE PIPELINE ACTIVE</p>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            Multi-Agent Orchestrator
            <span className="text-[10px] font-mono py-0.5 px-2 bg-emerald-500/20 text-emerald-400 rounded-full">
              {phase === "completed" ? "IDLE" : "RUNNING"}
            </span>
          </h2>
          <p className="text-zinc-400 text-xs mt-1 font-mono max-w-xl truncate">
             Task: {query}
          </p>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
        
        {/* Left Side: Real-time Multi-Agent Swarm Thread List */}
        <div className="lg:col-span-4 border-r border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-4 max-h-[600px] overflow-y-auto">
          <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
            <span>Swarm Hub</span>
            {phase !== "completed" && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span></span>}
          </h3>

          <div className="space-y-3">
             {agentList.length === 0 && (
                <div className="text-xs text-zinc-400 font-mono text-center py-4 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl">Spawning agents...</div>
             )}
             {agentList.map((agent) => (
              <div key={agent.id} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col gap-2 shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">{agent.name}</p>
                    <span className={`text-[9px] font-bold uppercase py-0.5 px-2 rounded-full ${
                      agent.status === "completed" ? "bg-emerald-500/10 text-emerald-500" :
                      agent.status === "active" ? "bg-indigo-500/10 text-indigo-500 animate-pulse" :
                      "bg-zinc-300/10 text-zinc-400"
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-black/30 p-2 rounded-lg truncate">
                    &gt; {agent.currentStep || "Awaiting task assignment..."}
                  </div>
              </div>
            ))}
          </div>

          <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800">
             <h3 className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-2">Orchestrator Log</h3>
             <div className="space-y-1.5 h-32 overflow-y-auto font-mono text-[9px] text-zinc-500 dark:text-zinc-400 custom-scrollbar">
                {systemLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
             </div>
          </div>
        </div>

        {/* Right Side: Tabbed Interactive Workspaces */}
        <div className="lg:col-span-8 flex flex-col bg-white dark:bg-[#0c0d0e]">
          
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto bg-zinc-100/50 dark:bg-zinc-950/40 p-1 gap-1">
            {[
              { id: "hub", label: "📄 Main Actions" },
              { id: "spreadsheet", label: "📊 Excel Workbook" },
              { id: "chart", label: "📈 Quant Analytics" },
              { id: "presentation", label: "🖥️ Slide Deck" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-zinc-900 text-indigo-500 dark:text-indigo-400 shadow-sm border border-zinc-200 dark:border-zinc-800"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 overflow-y-auto relative min-h-[400px]">
            <AnimatePresence mode="wait">
              {activeTab === "hub" && (
                <motion.div key="hub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="p-5 bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/10 rounded-2xl">
                    <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-2">Central Operation Center</h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-2xl">
                      The swarm orchestrator decomposes the primary instruction, recruits appropriate specialized models, and loops them until convergence. All output files reflect literal data produced by backend functions.
                    </p>
                  </div>
                  
                  <div className="p-5 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                     <div className="flex items-center gap-3">
                         <div className="text-green-500 text-2xl">📊</div>
                         <div>
                            <h5 className="font-bold text-sm">Download True Workbooks</h5>
                            <p className="text-xs text-zinc-500">Native server-generated physical .xlsx files with computed headers</p>
                         </div>
                     </div>
                     <a href="/api/swarm/download/excel" download className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-lg hover:opacity-90">
                       Download Excel
                     </a>
                  </div>
                </motion.div>
              )}

              {activeTab === "spreadsheet" && (
                <motion.div key="spreadsheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                  {phase !== "completed" || !finalData ? (
                     <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
                        <div className="animate-spin text-xl mb-4">⚒️</div>
                        <p className="text-xs font-mono">Aggregating quantitative datasets...</p>
                     </div>
                  ) : (
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 font-mono text-[10px] text-zinc-500 uppercase">
                          <tr>
                            <th className="p-3 border-r border-zinc-200 dark:border-zinc-800">Ticker</th>
                            <th className="p-3 border-r border-zinc-200 dark:border-zinc-800">Strategy Focus</th>
                            <th className="p-3 border-r border-zinc-200 dark:border-zinc-800 text-right">Sharpe Ratio</th>
                            <th className="p-3 text-right">Allocation (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {finalData.slice(0, 10).map((row, i) => (
                            <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                              <td className="p-3 font-bold border-r border-zinc-200 dark:border-zinc-800 text-indigo-500">{row.ticker}</td>
                              <td className="p-3 border-r border-zinc-200 dark:border-zinc-800">{row.strategy}</td>
                              <td className="p-3 text-right font-mono text-emerald-600 dark:text-emerald-400 border-r border-zinc-200 dark:border-zinc-800">{row.sharpe}</td>
                              <td className="p-3 text-right font-mono">{row.weight}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="p-2 text-center text-[10px] text-zinc-400 bg-zinc-50 dark:bg-zinc-900 font-mono">
                        Showing 10 of 50 computed rows. Download full Excel to view complete dataset.
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "chart" && (
                <motion.div key="chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-[350px]">
                   {phase !== "completed" || !finalData ? (
                     <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                        <p className="text-xs font-mono">Analytics awaiting core completion...</p>
                     </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                            <XAxis type="number" dataKey="weight" name="Capital Weight (%)" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                            <YAxis type="number" dataKey="sharpe" name="Sharpe Ratio" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                            <ZAxis type="category" dataKey="ticker" name="Asset" />
                            <RechartsTooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{backgroundColor: '#18181b', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px'}} />
                            <Scatter name="Strategies" data={finalData.map(d => ({...d, sharpe: Number(d.sharpe), weight: Number(d.weight)}))} fill="#6366f1" />
                        </ScatterChart>
                    </ResponsiveContainer>
                  )}
                </motion.div>
              )}

              {activeTab === "presentation" && (
                <motion.div key="ppt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-3 border-zinc-200 dark:border-zinc-800">
                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-300">
                      Browser Canvas Viewer
                    </h4>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedSlide(s => Math.max(0, s - 1))} disabled={selectedSlide === 0} className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 disabled:opacity-50 text-xs font-bold">Prev</button>
                      <span className="text-[10px] font-mono text-zinc-400">{selectedSlide + 1} / {slideDeck.length}</span>
                      <button onClick={() => setSelectedSlide(s => Math.min(slideDeck.length - 1, s + 1))} disabled={selectedSlide === slideDeck.length - 1} className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 disabled:opacity-50 text-xs font-bold">Next</button>
                    </div>
                  </div>

                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl aspect-video bg-gradient-to-br from-zinc-50 to-zinc-200 dark:from-zinc-900 dark:to-zinc-950 p-8 shadow-inner flex flex-col justify-center">
                      <h2 className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{slideDeck[selectedSlide].title}</h2>
                      <p className="text-indigo-500 font-medium text-sm mt-2">{slideDeck[selectedSlide].subtitle}</p>
                      
                      <div className="mt-8 space-y-4">
                         {slideDeck[selectedSlide].bullets.map((b, i) => (
                             <div key={i} className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                                 <span className="text-emerald-500">•</span>
                                 <span>{b}</span>
                             </div>
                         ))}
                      </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  );
};
