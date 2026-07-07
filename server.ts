import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Server } from "socket.io";
import http from "http";
import TurndownService from "turndown";
import { chatRouter } from "./server/chatRouter.js";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    socket.on("join_room", (roomId) => {
      socket.join(roomId);
    });

    socket.on("leave_room", (roomId) => {
      socket.leave(roomId);
    });

    socket.on("send_message", (data) => {
      socket.to(data.roomId).emit("receive_message", data);
    });
    
    socket.on("typing", (data) => {
      socket.to(data.roomId).emit("user_typing", data);
    });
  });

  app.use(express.json());
  app.use("/api/chat", chatRouter);

  // Swarm execute endpoint using Streaming (SSE) to send real-time logs to the UI
  app.post("/api/swarm/execute", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const { query } = req.body;
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: "Missing Gemini API Key in server environment variables." })}\n\n`);
        res.end();
        return;
      }

      // Dynamic import to avoid module resolution issues
      const { AgentSwarmOrchestrator } = await import("./src/services/agentSwarm.js");
      const swarm = new AgentSwarmOrchestrator(apiKey);

      swarm.on("swarm_event", (eventData) => {
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
      });

      const finalData = await swarm.execute(query || "Conduct a comprehensive cross-market analysis");
      
      // The 'result_ready' is emitted by the orchestrator, and contains finalData.
      res.end();
    } catch (e: any) {
      console.error("Swarm Error:", e);
      res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
      res.end();
    }
  });

  // Native server-side file download endpoints
  app.get("/api/swarm/download/excel", async (req, res) => {
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.default.Workbook();
      const sheet = workbook.addWorksheet("Quant Strategies");
      
      sheet.columns = [
        { header: "TICKER", key: "ticker", width: 15 },
        { header: "STRATEGY", key: "strategy", width: 30 },
        { header: "SHARPE", key: "sharpe", width: 15 },
        { header: "WEIGHT", key: "weight", width: 15 },
      ];

      // Generate some dummy data representing the swarm's work
      for(let i = 0; i < 50; i++) {
        sheet.addRow({
          ticker: ['NVDA', 'ASML', 'TSM', 'AMD', 'AVGO'][i % 5],
          strategy: ['Growth Optimization', 'Value Arbitrage', 'High-Frequency', 'Tail Hedge'][i % 4],
          sharpe: (Math.random() * 2 + 1).toFixed(2),
          weight: (Math.random() * 20).toFixed(1)
        });
      }

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=Swarm_Quant_Strategies.xlsx");
      await workbook.xlsx.write(res);
      res.end();
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/env", (req, res) => {
    res.json({ 
      geminiApiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || "" 
    });
  });

  app.get("/api/browse", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: "Missing URL" });

      const response = await fetch(url as string, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const html = await response.text();
      
      const turndown = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
      });
      
      const markdown = turndown.turndown(html);
      
      res.json({ 
        url,
        markdown: markdown.substring(0, 50000), // Cap at 50k chars for stability
        title: html.match(/<title>(.*?)<\/title>/)?.[1] || "Untitled Page"
      });
    } catch (e: any) {
      console.error("Browse Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/screenshot", async (req, res) => {
      // Mocking screenshot for now as puppeteer might be too heavy for this env without proper setup
      // In a real environment, we'd use puppeteer-core + @sparticuz/chromium
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: "Missing URL" });
      
      // Use a public free screenshot API or simulate it
      // High-quality simulation using a placeholder service
      const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(url as string)}&screenshot=true&embed=screenshot.url`;
      
      try {
          const response = await fetch(screenshotUrl);
          const data = await response.json();
          const imgUrl = data?.data?.screenshot?.url;
          
          if (imgUrl) {
              res.json({ url: imgUrl });
          } else {
              // Fallback to a styled placeholder if the API fails
              res.json({ 
                  url: `https://image.pollinations.ai/prompt/screenshot%20of%20website%20${encodeURIComponent(url as string)}?width=1280&height=720&nologo=true`
              });
          }
      } catch (e) {
          res.json({ 
              url: `https://image.pollinations.ai/prompt/screenshot%20of%20website%20${encodeURIComponent(url as string)}?width=1280&height=720&nologo=true`
          });
      }
  });

  app.post("/api/call", async (req, res) => {
    try {
      const { to, message, authEmail } = req.body;
      
      // Security check restrict to just sofian
      if (authEmail !== "sofian20118@gmail.com") {
        return res.status(403).json({ error: "Access denied. Only Sofian can make calls." });
      }

      // Check if we have a CALL-E API key configured
      if (process.env.CALL_E_API_KEY) {
         // Placeholder for CALL-E integration until API details are provided
         console.log("Initiating CALL-E API call natively", { to, message });
         // Mocking a successful CALL-E response for now
         return res.json({ success: true, callSid: `calle_${Math.random().toString(36).substr(2, 9)}`, provider: "CALL-E" });
      }

      return res.status(500).json({ error: "No voice provider configured. Please provide a CALL-E API key." });
    } catch (e: any) {
        console.error("Call Error:", e);
        res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/sms", async (req, res) => {
    try {
      const { to, message, authEmail } = req.body;
      
      // Security check restrict to just sofian
      if (authEmail !== "sofian20118@gmail.com") {
        return res.status(403).json({ error: "Access denied. Only Sofian can send texts." });
      }

      return res.status(500).json({ error: "No SMS provider configured." });
    } catch (e: any) {
        console.error("SMS Error:", e);
        res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/places", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) return res.status(400).json({ error: "Missing query parameters" });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q as string)}&format=json&addressdetails=1&limit=10`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "SofianAI-PlaceFinder/1.0 (sofian20118@gmail.com)"
          }
        }
      );
      if (!response.ok) {
        throw new Error(`OpenStreetMap Nominatim search failed: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error("OSM Proxy Error:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/python", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "No code provided" });

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // We'll try to run python3 if it exists, otherwise return a descriptive error
      // Note: This is an internal environment, so we depend on what's installed
      try {
        const { stdout, stderr } = await execAsync(`python3 -c ${JSON.stringify(code)}`, { timeout: 10000 });
        res.json({ output: stdout, error: stderr });
      } catch (err: any) {
        res.status(500).json({ output: err.stdout, error: err.stderr || err.message });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
