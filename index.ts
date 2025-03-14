// src/agent.ts
import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import { ImageGenPlugin } from "./plugins/imageGen/";
import dotenv from "dotenv";
dotenv.config();

// Verify required environment variables
if (!process.env.API_KEY) {
    throw new Error('API_KEY is required in environment variables');
}

if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required in environment variables');
}

const imageGenPlugin = new ImageGenPlugin({
  id: "wisdom_image_gen",
  name: "Wisdom Image Generator",
  description: "Generates images to accompany wisdom tweets",
  apiKey: process.env.OPENAI_API_KEY || '',
  baseApiUrl: "https://api.openai.com/v1/images/generations"
});

// Create the wisdom agent
export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share valuable wisdom and knowledge with images on Twitter to educate and inspire followers",
    description: `You are a wisdom-sharing Twitter bot that posts insightful content with relevant images.
    
    Your responsibilities:
    1. Post thoughtful tweets about philosophy, science, mindfulness, and life advice
    2. Create engaging content with relevant images when appropriate
    3. Reply to mentions with additional insights when appropriate
    4. Share knowledge that is practical and applicable to everyday life
    
    Your posts should sound like one from a real human, have a tone that's warm, insightful, and thought-provoking without being preachy.

    When suitable, generate images that complement your wisdom posts using the generate_image function.

    Post a broad variety of content so it does not get boring.

    Avoid using hashtags.

    Occasionally use emojis when fitting.

    Do not repeat posts and phrases.
    
    Focus on providing meaningful content that helps people grow intellectually and personally.`,

    workers: [
        twitterPlugin.getWorker(),
        imageGenPlugin.getWorker()
    ],
    llmModel: LLMModel.DeepSeek_R1
});

// Set up logging
wisdom_agent.setLogger((agent, msg) => {
    console.log(`🧠 [${agent.name}]`);
    console.log(msg);
    console.log("------------------------\n");
});