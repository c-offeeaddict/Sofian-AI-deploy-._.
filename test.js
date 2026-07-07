// Ensure you are using the latest SDK: @google/generative-ai
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash", // Use 1.5 for better stability on Cloud Run
  systemInstruction: "You are Sofian's AI expert assistant.",
});

async function run() {
  const chat = model.startChat({
    history: [],
    generationConfig: { maxOutputTokens: 1000 },
  });
  // Test call
  const result = await chat.sendMessage("Hello, are you active?");
  console.log(result.response.text());
}

run();
