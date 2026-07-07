
import { GoogleGenAI, Type, FunctionDeclaration, ThinkingLevel, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { getSystemInstruction } from "../constants";
import { MindState, UserSettings, Message, User, Task } from "../types";

export const getGeminiApiKey = async (): Promise<string> => {
  let defaultKey = "";
  try {
    defaultKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY || "";
  } catch(e) {}
  if (defaultKey) return defaultKey;

  const processEnvKey = typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.API_KEY) : undefined;
  if (processEnvKey) return processEnvKey as string;

  try {
    const res = await fetch("/api/env");
    const data = await res.json();
    return data.geminiApiKey || "";
  } catch (e) {
    console.error("Failed to fetch API key from server", e);
    return "";
  }
};

export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
    try {
        const apiKey = await getGeminiApiKey();
        if (!apiKey) throw new Error("Missing Gemini API Key");

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: "Accurately transcribe this audio. Output ONLY the transcription text, nothing else." },
                        { inlineData: { mimeType, data: base64Audio } }
                    ]
                }
            ]
        });
        return response.text?.trim() || "";
    } catch (e) {
        console.error("Audio transcription error", e);
        return "";
    }
}

// --- Tool Definitions ---

export const taskTools: FunctionDeclaration[] = [
  {
    name: "manage_tasks",
    description: "Create, update, or remove tasks from the user's focus list.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["add", "remove", "complete"] },
        taskText: { type: Type.STRING, description: "The description of the task." },
        taskId: { type: Type.STRING, description: "Required for remove or complete actions." },
        priority: { type: Type.STRING, enum: ["low", "medium", "high"] }
      },
      required: ["action"]
    }
  },
  {
    name: "remember",
    description: "Save a specific fact, project detail, or preference to long-term vector memory.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            fact: { type: Type.STRING, description: "The information to store." }
        },
        required: ["fact"]
    }
  }
];

export const integrationTools: FunctionDeclaration[] = [
  {
    name: "execute_code",
    description: "Execute JavaScript code in a secure sandbox. Use this to solve math, process data, or demonstrate logic.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: { type: Type.STRING, description: "The JavaScript code to execute. Use console.log to output results." },
        language: { type: Type.STRING, enum: ["javascript", "python"] }
      },
      required: ["code"]
    }
  },
  {
    name: "render_sandbox_app",
    description: "Render a standalone React or HTML/JS application in a sandbox preview. Use this when the user asks to build a web app, a component, or a functional UI. Provide full self-contained code.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The title of the application." },
        code: { type: Type.STRING, description: "The full self-contained HTML (with script/style tags) or React code to render." },
        type: { type: Type.STRING, enum: ["html", "react"], description: "The type of application to render." },
        dependencies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Optional external CDN dependencies (e.g., https://cdn.tailwindcss.com)." }
      },
      required: ["code", "type"]
    }
  },
  {
    name: "browse_website",
    description: "Navigate to a specific URL and extract its text content in markdown format. Use this for deep research into a single webpage.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "The full URL to browse (e.g., https://en.wikipedia.org/wiki/Artificial_intelligence)." }
      },
      required: ["url"]
    }
  },
  {
    name: "research_specialized",
    description: "Deep research into specialized databases like Yahoo Finance (stocks/financials) or ArXiv (scientific papers).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: "The topic or symbol (e.g., TSLA, Quantum Computing)." },
        source: { type: Type.STRING, enum: ["finance", "arxiv", "news"] }
      },
      required: ["topic", "source"]
    }
  },
  {
    name: "screenshot_website",
    description: "Capture a full-page visual screenshot of a specific website. Use this when the user needs to see the visual layout or specific visual information on a page.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "The URL of the website to screenshot." }
      },
      required: ["url"]
    }
  },
  {
    name: "generate_image",
    description: "Generate a high-quality image from a text prompt. Use this for creating new visuals, art, or photos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: "Detailed description of the image to generate." },
        aspectRatio: { type: Type.STRING, enum: ["1:1", "16:9", "4:3", "9:16"], description: "The aspect ratio of the generated image." }
      },
      required: ["prompt"]
    }
  },
  {
    name: "edit_image",
    description: "Modify an existing image based on instructions. Use this to add, remove, or change elements in an image while maintaining consistency.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: "Description of the changes to make (e.g., 'add a red hat')." },
        referenceImageId: { type: Type.STRING, description: "The ID of the message containing the image to edit. If not provided, the most recent image in history will be used." }
      },
      required: ["prompt"]
    }
  },
  {
    name: "generate_narrative_video",
    description: "Generate an immersive, narrated video presentation. This creates a multi-slide presentation with a generated script that will be read aloud by the system's neural engine. USE THIS for high-impact visual storytelling or summaries.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The title of the presentation." },
        theme: { type: Type.STRING, enum: ["minimal", "futuristic", "dark", "light"], description: "Visual theme." },
        scenes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING, description: "Scene heading." },
              bullets: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Bullet points for the slide." },
              narrationScript: { type: Type.STRING, description: "The exact text to be narrated by the voice engine for this scene." },
              visualKeyword: { type: Type.STRING, description: "Descriptive keyword for a background image (e.g., 'nebula', 'tokyo night')." }
            },
            required: ["narrationScript"]
          }
        }
      },
      required: ["title", "scenes"]
    }
  },
  {
    name: "generate_chart",
    description: "Generate an interactive data visualization chart. Provide the data and configuration in JSON format.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ["line", "bar", "pie", "area"], description: "The type of chart to render." },
        title: { type: Type.STRING, description: "The title of the chart." },
        xKey: { type: Type.STRING, description: "The key in the data objects to use for the X-axis." },
        yKeys: { type: Type.ARRAY, items: { type: Type.STRING }, description: "The keys in the data objects to use for the Y-axis (lines, bars, etc.)." },
        data: { 
          type: Type.ARRAY, 
          items: { type: Type.OBJECT }, 
          description: "The data array. Each object should have the xKey and yKeys properties." 
        }
      },
      required: ["type", "data", "xKey", "yKeys"]
    }
  },
  {
    name: "generate_pdf",
    description: "CRITICAL: You MUST use this tool to generate PDFs. NEVER write Python/JavaScript code to generate a PDF yourself. Use this tool for ALL document generation requests. If the user asks for many pages (e.g., 100+), fulfill it by generating extremely exhaustive, multi-chapter content within the 'content' parameter.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The professional title of the PDF document." },
        content: { type: Type.STRING, description: "The full, exhaustive text content. Use line breaks for paragraphs. For long requests, be extremely detailed and verbose to fill multiple pages." },
        filename: { type: Type.STRING, description: "The suggested file name (e.g., report.pdf)." }
      },
      required: ["title", "content"]
    }
  },
  {
    name: "generate_ppt",
    description: "CRITICAL: You MUST use this tool to generate PowerPoint presentations. NEVER write code to generate PPTs yourself. Use this tool for ALL presentation requests. Support for animations, speaker transcripts, and visual depth (little/medium/a lot of context) is built-in.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The title of the presentation." },
        contextDepth: { type: Type.STRING, enum: ["sparse", "balanced", "exhaustive"], description: "The level of detail: 'sparse' for minimal text, 'balanced' for standard slides, 'exhaustive' for extremely detailed slides with lots of context." },
        slides: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "The slide title." },
              bullets: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Bullet points for the slide. If 'exhaustive' context is requested, provide many detailed bullets." },
              speakerNotes: { type: Type.STRING, description: "The transcript or speaker notes for this slide. Be verbose if the user wants a full transcript." },
              imageKeyword: { type: Type.STRING, description: "Optional descriptive keyword for a high-quality image to include (e.g., 'futuristic office')." },
              animation: { type: Type.STRING, enum: ["fade", "flyIn", "zoom"], description: "Entrance animation for slide elements." }
            },
            required: ["title", "bullets"]
          },
          description: "An array of slide objects."
        },
        filename: { type: Type.STRING, description: "The suggested file name (e.g., business_plan.pptx)." }
      },
      required: ["title", "slides"]
    }
  },
  {
    name: "generate_docx",
    description: "Generate a Word document (.docx). Use this for professional reports, essays, or formatted text documents.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The title of the document." },
        sections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING, description: "Optional heading for this section." },
              text: { type: Type.STRING, description: "The content text for this section." }
            },
            required: ["text"]
          }
        },
        filename: { type: Type.STRING, description: "The suggested file name (e.g., report.docx)." }
      },
      required: ["title", "sections"]
    }
  },
  {
    name: "generate_spreadsheet",
    description: "Generate an Excel (.xlsx) or CSV spreadsheet. Use this for structured data, calculations, or financial reports.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The name of the sheet." },
        format: { type: Type.STRING, enum: ["xlsx", "csv"], description: "The file format." },
        columns: {
           type: Type.ARRAY,
           items: { type: Type.STRING },
           description: "The column headers."
        },
        rows: {
          type: Type.ARRAY,
          items: {
            type: Type.ARRAY,
            items: { type: Type.STRING, description: "The cell values for a row." }
          },
          description: "The data rows."
        },
        filename: { type: Type.STRING, description: "The suggested file name (e.g., data.xlsx)." }
      },
      required: ["title", "format", "columns", "rows"]
    }
  },
  {
    name: "manage_google_tasks",
    description: "Create, list, or update tasks in Google Tasks. USE THIS when the user mentions 'my tasks' or 'Google Tasks'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["list", "insert", "patch", "delete"] },
        tasklist: { type: Type.STRING, description: "The ID of the task list (defaults to '@default')." },
        task: { type: Type.STRING, description: "The ID of the task for patch/delete." },
        title: { type: Type.STRING, description: "The title of the new or updated task." },
        notes: { type: Type.STRING, description: "Additional details for the task." }
      },
      required: ["action"]
    }
  },
  {
    name: "manage_google_keep",
    description: "Create or list notes in Google Keep. Note: List might be limited. Insert is primary.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["list", "create"] },
        title: { type: Type.STRING, description: "The note title." },
        content: { type: Type.STRING, description: "The note body." }
      },
      required: ["action"]
    }
  },
  {
    name: "generate_timeline",
    description: "Generate a chronological timeline of events. Use this for history, planning, or sequence breakdowns.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING, description: "Date or time period." },
              title: { type: Type.STRING, description: "Event title." },
              description: { type: Type.STRING, description: "Detailed description." }
            },
            required: ["date", "title", "description"]
          }
        }
      },
      required: ["items"]
    }
  },
  {
    name: "generate_comparison_matrix",
    description: "Generate an explicit comparison matrix for side-by-side analysis of ideas, products, or theories.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        headers: { type: Type.ARRAY, items: { type: Type.STRING }, description: "The items being compared." },
        rows: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, description: "The criteria for comparison." },
              values: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Values for each header item." }
            },
            required: ["label", "values"]
          }
        }
      },
      required: ["headers", "rows"]
    }
  },
  {
    name: "worldbuilding_helper",
    description: "Build lore, quests, maps, and character bios. Use this for creative writing and game design sessions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ["lore", "quest", "character", "map_description"] },
        theme: { type: Type.STRING, description: "Theme like 'High Fantasy', 'Cyberpunk', 'Genshin Impact'." },
        prompt: { type: Type.STRING, description: "What specific detail to generate." }
      },
      required: ["type", "theme", "prompt"]
    }
  },
  {
    name: "execute_python_analysis",
    description: "Execute Python code for complex math, data analysis, or simulations. Use this when the user needs precision beyond standard language model generation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: { type: Type.STRING, description: "The Python code to execute." },
        description: { type: Type.STRING, description: "Description of what this code does." }
      },
      required: ["code"]
    }
  },
  {
    name: "manage_google_contacts",
    description: "Search or create contacts in Google Contacts (People API).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["search", "create"] },
        query: { type: Type.STRING, description: "Search query for 'search' action." },
        name: { type: Type.STRING, description: "Contact name for 'create' action." },
        email: { type: Type.STRING, description: "Contact email." },
        phone: { type: Type.STRING, description: "Contact phone." }
      },
      required: ["action"]
    }
  },
  {
    name: "search_places",
    description: "Search for local landmarks, mosques, churches, cafes, restaurants, etc. Returns a list of places with their locations and details. USE THIS for 'find near me' or 'local search' requests.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "The type of place or keyword to search for (e.g., 'mosques', 'cafes in Paris')." },
        location: { type: Type.STRING, description: "Optional location override. If not provided, the user's current location will be used." },
        type: { type: Type.STRING, description: "Optional place type filter (e.g., 'restaurant', 'cafe', 'place_of_worship')." }
      },
      required: ["query"]
    }
  },
  {
    name: "make_phone_call",
    description: "Make an outgoing phone call and read a synthesized text-to-speech message to the recipient using the system's telephony API. USE THIS when the user asks you to call someone.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: "The phone number to call (must include country code, e.g., +14085551234)." },
        message: { type: Type.STRING, description: "The message to speak to the person who answers the phone." }
      },
      required: ["to", "message"]
    }
  },
  {
    name: "send_sms",
    description: "Send an SMS text message to a phone number using the telephony API. USE THIS when the user asks you to text someone.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: "The phone number to text (must include country code, e.g., +14085551234)." },
        message: { type: Type.STRING, description: "The text message content to send." }
      },
      required: ["to", "message"]
    }
  }
];

// --- Embedding Service ---

export const getEmbedding = async (text: string, settings?: UserSettings): Promise<number[] | null> => {
  try {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [text]
    });
    return response.embeddings?.[0]?.values || null;
  } catch (e) {
    console.error("Embedding Error:", e);
    return null;
  }
};

// --- Title Generation Service ---

export const generateSessionTitle = async (
  message: string,
  settings?: UserSettings
): Promise<string> => {
  try {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) return "";
    
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a very short, concise, and descriptive title for this conversation based on the user's first message. Maximum 3-5 words. Output ONLY the title, no quotes, no prefixes. Message: "${message.substring(0, 500)}"`,
      config: {
        systemInstruction: "You are a helpful assistant that generates extremely concise titles for conversation threads.",
        temperature: 0.2
      }
    });
    
    return response.text?.trim()?.replace(/^["']|["']$/g, '') || "";
  } catch (e) {
    console.error("Title generation error:", e);
    return "";
  }
};

// --- Generation Service ---

export const generateResponse = async (
  message: string, 
  history: Message[],
  attachment?: { data: string, mimeType: string },
  settings?: UserSettings,
  modes: MindState[] = ['Assistant'],
  location?: { lat: number, lng: number },
  userMemory?: string[],
  retrievedContext?: string,
  sensorData?: {alpha?: number | null, beta?: number | null, gamma?: number | null, ax?: number | null, ay?: number | null, az?: number | null},
  customModes: any[] = [],
  userEmail?: string,
  onProgress?: (progress: { thoughtChunk?: string, textChunk?: string }) => void
) => {
  let apiKey = await getGeminiApiKey();
  
  if (!apiKey) {
    return {
      text: "The Gemini API Key is not configured. Since Sofian AI 2 is running in a UI-only / offline demonstration mode without a valid API key, here is a simulated offline response to: **" + message + "**\n\nIf you want the real AI to answer, please configure your `GEMINI_API_KEY` environment variable.",
      thought: "No API key detected. Using fallback mock flow to gracefully simulate the UI."
    };
  }
  
  // Feature & Model Selection Logic
  const isArtist = modes.includes('Artist');
  const isResearch = modes.includes('Research');
  const isBeta = modes.includes('Beta');
  const isDeepThinking = modes.includes('DeepThinking');
  const isComplex = modes.some(m => ['Technologist', 'Genius', 'Academic', 'Fact-Checker'].includes(m));
  
  const hasAttachment = !!attachment;
  const isImage = attachment?.mimeType.startsWith('image/');
  
  const mapKeywords = ['where', 'find', 'near', 'locate', 'map', 'directions', 'place', 'restaurant', 'store', 'shop'];
  const wantsMap = !hasAttachment && !isArtist && !isResearch && mapKeywords.some(k => message.toLowerCase().includes(k));

  const imageKeywords = ['generate an image', 'create an image', 'draw ', 'paint ', 'show me an image', 'picture of', 'visualize ', 'edit the image', 'modify the image', 'add a', 'change the'];
  const wantsImage = !hasAttachment && !isResearch && imageKeywords.some(k => message.toLowerCase().includes(k));

  const codeExecutionKeywords = ['run', 'execute', 'python', 'script', 'pytorch', 'tensorflow', 'pandas', 'numpy'];
  const wantsCodeExecution = modes.includes('Technologist') || codeExecutionKeywords.some(k => message.toLowerCase().includes(k));

  let modelName = 'gemini-3-flash-preview'; // Default to stable fast model
  let tools: any[] | undefined = undefined;
  let toolConfig: any | undefined = undefined;

  // Combine default tools with new integration tools
  const allTools: any[] = [
      { functionDeclarations: [...taskTools, ...integrationTools] },
      { googleSearch: {} }
  ];
  if (wantsCodeExecution && !wantsImage && !wantsMap && !isResearch) {
      allTools.push({ codeExecution: {} });
  }

  if (isArtist || wantsImage) {
    // Follow skill guidelines: gemini-2.5-flash-image by default
    modelName = 'gemini-2.5-flash-image';
  } else if (wantsMap) {
    modelName = 'gemini-3-flash-preview';
    tools = [{ googleMaps: {} }, { functionDeclarations: [...taskTools, ...integrationTools] }];
    toolConfig = location 
      ? { includeServerSideToolInvocations: true, retrievalConfig: { latLng: { latitude: location.lat, longitude: location.lng } } } 
      : { includeServerSideToolInvocations: true };
  } else if (isBeta) {
    modelName = 'gemini-3.1-flash-lite';
    tools = allTools;
    toolConfig = { includeServerSideToolInvocations: true };
  } else if (isResearch) {
    modelName = 'gemini-3-flash-preview';
    tools = [{ googleSearch: {} }, { urlContext: {} }];
    toolConfig = { includeServerSideToolInvocations: true };
  } else if (isDeepThinking) {
    modelName = 'gemini-3.1-pro-preview';
    tools = allTools;
    toolConfig = { includeServerSideToolInvocations: true };
  } else if (isImage || isComplex) {
    modelName = 'gemini-3.1-pro-preview';
    tools = allTools; // Enable Integrations for Pro model
    toolConfig = { includeServerSideToolInvocations: true };
  } else {
    modelName = 'gemini-3-flash-preview';
    tools = allTools;
    toolConfig = { includeServerSideToolInvocations: true };
  }

  const ai = new GoogleGenAI({ apiKey });

  const rawContents = history.map(m => {
    const parts: any[] = [{ text: m.content || " " }];
    if (m.attachment) {
      const data = m.attachment.fullData || m.attachment.data;
      if (data) {
        parts.push({ 
          inlineData: { 
            data: data.includes(',') ? data.split(',')[1] : data, 
            mimeType: m.attachment.mimeType 
          } 
        });
      }
    }
    if (m.generatedImage && m.generatedImage.startsWith('data:')) {
      parts.push({ 
        inlineData: { 
          data: m.generatedImage.split(',')[1], 
          mimeType: "image/png" 
        } 
      });
    }
    return {
      role: m.role === 'user' ? 'user' : 'model',
      parts
    };
  });

  let finalMessage = message;
  if (isArtist && !hasAttachment && !message.toLowerCase().includes('image') && !message.toLowerCase().includes('generate')) {
    finalMessage = `Generate a high-quality image of: ${message}`;
  }

  const userParts: any[] = [];
  userParts.push({ 
    text: finalMessage + (isArtist ? "" : "\n\n(End response with SUGGESTIONS: [S1] | [S2] | [S3])") 
  });

  if (attachment) {
    userParts.push({ 
      inlineData: { 
        data: attachment.data.includes(',') ? attachment.data.split(',')[1] : attachment.data, 
        mimeType: attachment.mimeType 
      } 
    });
  }

  rawContents.push({ role: 'user', parts: userParts });

  // Merge adjacent messages of the same role
  const contents: any[] = [];
  for (const msg of rawContents) {
    if (contents.length === 0 && msg.role === 'model') {
      // API requires the first message to be 'user'
      contents.push({ role: 'user', parts: [{ text: "Hello." }] });
    }
    if (contents.length > 0 && contents[contents.length - 1].role === msg.role) {
      contents[contents.length - 1].parts.push(...msg.parts);
    } else {
      contents.push(msg);
    }
  }

  const isImageModel = modelName === 'gemini-2.5-flash-image' || modelName === 'gemini-3.1-flash-image-preview';
  const systemInstruction = getSystemInstruction(modes, settings || {} as any, userMemory, retrievedContext, sensorData, location, customModes, userEmail);
  const thinkingLevel = (isDeepThinking || modes.includes('Genius')) && !isImageModel ? ThinkingLevel.HIGH : undefined;

  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
  ];

  const config: any = isImageModel ? {
    systemInstruction,
    safetySettings,
    imageConfig: { 
      aspectRatio: '1:1'
    },
    ...(tools ? { tools } : {})
  } : {
    systemInstruction,
    safetySettings,
    tools: tools,
    toolConfig: toolConfig,
    thinkingConfig: thinkingLevel ? { thinkingLevel } : undefined,
    temperature: settings?.creativity ?? 0.7
  };

  try {
    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents,
      config
    });

    let extractedText = "";
    let thoughtText = "";
    let generatedImage: string | undefined;
    let toolCalls: any[] | undefined = undefined;
    let sources: any[] | undefined = undefined;

    for await (const chunk of responseStream) {
      let tChunk = "";
      let thChunk = "";

      if (chunk.candidates?.[0]?.content?.parts) {
        for (const p of chunk.candidates[0].content.parts) {
          if ('thought' in p) thChunk += (p as any).thought;
          if (p.text) tChunk += p.text;
          if (p.executableCode) tChunk += `\n\n**Executing Python Code:**\n\`\`\`python\n${p.executableCode.code}\n\`\`\`\n\n`;
          if (p.codeExecutionResult) tChunk += `\n\n**Terminal Output:**\n\`\`\`text\n${p.codeExecutionResult.output}\n\`\`\`\n\n`;
          if (p.inlineData) {
            generatedImage = `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
          }
        }
      }

      if (chunk.functionCalls) {
        toolCalls = toolCalls ? [...toolCalls, ...chunk.functionCalls] : chunk.functionCalls;
      }

      if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        sources = chunk.candidates[0].groundingMetadata.groundingChunks;
      }

      thoughtText += thChunk;
      extractedText += tChunk;

      if ((thChunk || tChunk) && onProgress) {
        onProgress({ thoughtChunk: thChunk, textChunk: tChunk });
      }
    }
    
    const [content, suggestionsPart] = extractedText.split("SUGGESTIONS:");
    const suggestions = suggestionsPart 
      ? suggestionsPart.split("|").map(s => s.trim().replace(/^\[|\]$/g, "")) 
      : [];

    const finalContent = content?.trim() || "";
    const artistFallback = isImageModel && !finalContent ? (generatedImage ? "Visual synthesis complete." : "Please describe the image you want me to generate.") : "";

    return {
      content: finalContent || artistFallback,
      suggestions: suggestions.filter(s => s.length > 0),
      toolCalls: toolCalls,
      thought: thoughtText || undefined,
      generatedImage,
      sources: sources
    };
  } catch (e: any) {
    console.error("AI Generation Error:", e);
    let errorMessage = "AI response declined. ";
    
    if (e.message?.includes("API key not valid")) {
      errorMessage += "The API key provided is invalid.";
    } else if (e.message?.includes("quota") || e.status === 429 || (e.message && e.message.includes("429"))) {
      errorMessage += "API quota exceeded. The free tier limit has been reached. Please wait a moment for the quota to reset.";
    } else if (e.message?.includes("safety")) {
      errorMessage += "Request blocked by safety filters.";
    } else {
      errorMessage += e.message || "Unknown error.";
    }
    
    throw new Error(errorMessage);
  }
};
