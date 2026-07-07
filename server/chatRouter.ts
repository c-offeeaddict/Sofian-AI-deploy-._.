import { Router } from "express";
import { invokeLLM } from "./invokeLLM.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  try {
    const { message, mode, history } = req.body;
    
    // Choose the model based on the mode
    let model = "gemini-2.5-flash";
    if (mode === "Beta") {
      model = "gemini-3.1-flash-lite";
    }

    const messages = [];
    if (history && history.length > 0) {
       for (const msg of history) {
           if (msg.role === 'user' || msg.role === 'assistant') {
               messages.push({
                   role: msg.role === 'user' ? 'user' : 'model',
                   parts: [{ text: msg.content || " " }]
               });
           }
       }
    }

    // Add current message
    messages.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const response = await invokeLLM({
      model,
      messages,
      systemInstruction: "You are a helpful AI."
    });

    res.json({
        success: true,
        text: response.text,
    });

  } catch (error: any) {
    console.error("ChatRouter Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
