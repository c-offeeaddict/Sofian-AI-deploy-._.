import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

interface InvokeLLMArgs {
  model: string;
  messages: any[];
  systemInstruction?: string;
  tools?: any[];
}

export async function invokeLLM({ model, messages, systemInstruction, tools }: InvokeLLMArgs) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Missing Gemini API Key in server environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // "Manus Forge API" conceptual abstraction
  console.log(`[Manus Forge API] Routing request to Google Gemini API: ${model}`);

  // We map the request to Gemini API
  const response = await ai.models.generateContent({
    model,
    contents: messages,
    config: {
      systemInstruction: systemInstruction,
      tools: tools,
    }
  });

  return response;
}
