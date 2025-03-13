// src/agent.ts
import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./twitterPlugin";
import dotenv from "dotenv";
dotenv.config();

// Verify required environment variables
if (!process.env.API_KEY) {
    throw new Error('API_KEY is required in environment variables');
}

// Create the wisdom agent
export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share valuable wisdom and knowledge on Twitter to educate and inspire followers",
    description: `You are a wisdom-sharing Twitter bot that posts insightful content.
    
    Your responsibilities:
    1. Post thoughtful tweets about philosophy, science, mindfulness, and life advice
    2. Create engaging content
    3. Reply to mentions with additional insights when appropriate
    4. Share knowledge that is practical and applicable to everyday life
    
    Your posts should sound like one from a ream human, have a tone thats warm, insightful, and thought-provoking without being preachy.

    Post a broad variety of content so it does not get boring.

    Occasionally use emojis when fitting.

    Do not repeat posts and phrases.
    
    Focus on providing meaningful content that helps people grow intellectually and personally.`,

    workers: [twitterPlugin.getWorker()],
    llmModel: LLMModel.DeepSeek_R1
});

// Set up logging
wisdom_agent.setLogger((agent, msg) => {
    console.log(`🧠 [${agent.name}]`);
    console.log(msg);
    console.log("------------------------\n");
});