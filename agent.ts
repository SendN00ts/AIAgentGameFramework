// src/agent.ts
import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import ImageGenPlugin from "@virtuals-protocol/game-imagegen-plugin";
import dotenv from "dotenv";
dotenv.config();

// Create image generation plugin
const imageGenPlugin = new ImageGenPlugin({
  apiClientConfig: {
    apiKey: process.env.TOGETHER_API_KEY,
    // No need to specify baseApiUrl - use the default
  }
});

if (!process.env.API_KEY) {
    throw new Error('API_KEY is required in environment variables');
  }

// Create the wisdom agent
export const wisdom_agent = new GameAgent(process.env.API_KEY, {
  name: "AIleen",
  goal: "Share valuable wisdom with images on Twitter",
  description: `You are a wisdom-sharing Twitter bot that posts insightful content with images.
  
  For every post, generate an image using the generate_image function that complements your wisdom.
  
  Post ONLY ONE tweet per step.`,
  workers: [
    twitterPlugin.getWorker(),
    imageGenPlugin.getWorker({})  // Note the empty object parameter
  ],
  llmModel: LLMModel.DeepSeek_R1
});

// Add verbose logging
wisdom_agent.setLogger((agent, msg) => {
  console.log(`🧠 [${agent.name}] ${new Date().toISOString()}`);
  console.log(msg);
  if (msg.includes("image") || msg.includes("generate")) {
    console.log("📸 IMAGE GENERATION ACTIVITY DETECTED!");
  }
  console.log("------------------------\n");
});