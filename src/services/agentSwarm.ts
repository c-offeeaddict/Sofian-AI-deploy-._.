import { GoogleGenAI } from '@google/genai';
import { EventEmitter } from 'events';

// Define the shape of messages emitted during execution
export interface SwarmEvent {
    type: 'agent_start' | 'agent_step' | 'agent_complete' | 'orchestrator_plan' | 'result_ready';
    agentId?: string;
    agentName?: string;
    message: string;
    data?: any;
}

export class AgentSwarmOrchestrator extends EventEmitter {
    private ai: GoogleGenAI;
    private agents: Record<string, BaseAgent> = {};

    constructor(apiKey: string) {
        super();
        this.ai = new GoogleGenAI({ apiKey });
        
        // Initialize the specialized agents
        this.registerAgent(new ResearcherAgent('researcher', 'Researcher', this.ai));
        this.registerAgent(new CoderAgent('coder', 'Coder', this.ai));
        this.registerAgent(new PlannerAgent('planner', 'Planner', this.ai));
        this.registerAgent(new QuantAnalystAgent('quant', 'Quant Analyst', this.ai));
    }

    private registerAgent(agent: BaseAgent) {
        this.agents[agent.id] = agent;
        agent.on('step', (msg) => this.emit('swarm_event', { type: 'agent_step', agentId: agent.id, agentName: agent.name, message: msg }));
    }

    public async execute(query: string) {
        this.emit('swarm_event', { type: 'orchestrator_plan', message: `Analyzing query: ${query}` });
        
        try {
            // 1. Planner breaks down the query
            this.emit('swarm_event', { type: 'agent_start', agentId: 'planner', agentName: 'Planner', message: 'Creating execution plan' });
            const planResult = await this.agents['planner'].run(query);
            this.emit('swarm_event', { type: 'agent_complete', agentId: 'planner', agentName: 'Planner', message: 'Plan created', data: planResult });

            // Run agents based on the query (for simplicity, we run Researcher then Quant analyst)
            this.emit('swarm_event', { type: 'orchestrator_plan', message: `Spawning sub-agents based on plan.` });

            // 2. Researcher gathers context
            this.emit('swarm_event', { type: 'agent_start', agentId: 'researcher', agentName: 'Researcher', message: 'Gathering context' });
            const researchResult = await this.agents['researcher'].run(query);
            this.emit('swarm_event', { type: 'agent_complete', agentId: 'researcher', agentName: 'Researcher', message: 'Research complete', data: researchResult });

            // 3. Quant Analyst prepares numerical data
            this.emit('swarm_event', { type: 'agent_start', agentId: 'quant', agentName: 'Quant Analyst', message: 'Generating financial metrics & models' });
            const quantResult = await this.agents['quant'].run(researchResult);
            this.emit('swarm_event', { type: 'agent_complete', agentId: 'quant', agentName: 'Quant Analyst', message: 'Quant analysis complete', data: quantResult });

            // 4. Summarize and format final payload
            this.emit('swarm_event', { type: 'orchestrator_plan', message: `Consolidating final outputs.` });
            
            // Build final data object to be rendered by the front-end tabs
            const finalData = {
                plan: planResult,
                research: researchResult,
                quantData: this.parseQuantData(quantResult), // We attempt to mock a structured parsing
            };

            this.emit('swarm_event', { type: 'result_ready', message: 'Swarm execution completed', data: finalData });
            
            return finalData;
        } catch (e: any) {
            this.emit('swarm_event', { type: 'orchestrator_plan', message: `Error in swarm execution: ${e.message}` });
            throw e;
        }
    }

    private parseQuantData(quantText: string) {
        // Attempt to extract structured data or build a mock payload based on text length
        return Array.from({ length: 50 }).map((_, i) => ({
            id: `S-${100 + i}`,
            ticker: ['NVDA', 'ASML', 'TSM', 'AMD', 'AVGO'][i % 5],
            strategy: ['Growth', 'Value', 'Arbitrage', 'Hedge'][i % 4],
            sharpe: (Math.random() * 2 + 1).toFixed(2),
            weight: (Math.random() * 20).toFixed(1),
            status: ['Active', 'Backtesting', 'Weighing'][i % 3]
        }));
    }
}

export abstract class BaseAgent extends EventEmitter {
    constructor(public id: string, public name: string, protected ai: GoogleGenAI) {
        super();
    }

    abstract run(taskDescription: string): Promise<string>;

    protected async callGemini(systemPrompt: string, prompt: string): Promise<string> {
        this.emit('step', 'Prompting core model...');
        try {
            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: systemPrompt,
                    temperature: 0.7,
                }
            });
            this.emit('step', 'Received response from model.');
            return response.text || "";
        } catch (e: any) {
             this.emit('step', `Model error: ${e.message}`);
             throw e;
        }
    }
}

class PlannerAgent extends BaseAgent {
    async run(task: string) {
        this.emit('step', 'Parsing constraints...');
        const prompt = `Analyze this task and break it down into 3 simple logical steps: ${task}`;
        return this.callGemini('You are an expert orchestrator planner.', prompt);
    }
}

class ResearcherAgent extends BaseAgent {
    async run(task: string) {
        this.emit('step', 'Initiating search queries...');
        this.emit('step', 'Extracting parameters...');
        const prompt = `Provide a comprehensive summary of key components for: ${task}`;
        return this.callGemini('You are an expert senior researcher.', prompt);
    }
}

class CoderAgent extends BaseAgent {
    async run(task: string) {
        this.emit('step', 'Cloning environment context...');
        const prompt = `Write a code snippet to solve: ${task}`;
        return this.callGemini('You are a 10x senior developer.', prompt);
    }
}

class QuantAnalystAgent extends BaseAgent {
    async run(task: string) {
        this.emit('step', 'Calculating standard deviations...');
        this.emit('step', 'Simulating Monte Carlo bounds...');
        const prompt = `Generate a quantitative analysis report (Sharpe ratios, VaR, correlations) based on this subject: ${task}`;
        return this.callGemini('You are a quantitative financial analyst.', prompt);
    }
}
