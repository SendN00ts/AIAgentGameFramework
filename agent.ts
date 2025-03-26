import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import ImageGenPlugin from "@virtuals-protocol/game-imagegen-plugin";
import dotenv from "dotenv";
dotenv.config();

console.log("API_KEY exists:", !!process.env.API_KEY);
console.log("TOGETHER_API_KEY exists:", !!process.env.TOGETHER_API_KEY);

if (!process.env.API_KEY) {
    throw new Error('API_KEY is required in environment variables');
}

if (!process.env.TOGETHER_API_KEY) {
    throw new Error('TOGETHER_API_KEY is required in environment variables');
}

// Create image generation plugin
const imageGenPlugin = new ImageGenPlugin({
    id: "wisdom_image_gen",
    name: "Wisdom Image Generator",
    description: "Generates images to accompany wisdom tweets",
    apiClientConfig: {
        apiKey: process.env.TOGETHER_API_KEY || '',
        baseApiUrl: "https://api.together.xyz/v1/images/generations"
    }
});

export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share valuable wisdom and knowledge with images on Twitter to educate and inspire followers",
    description: `You are a wisdom-sharing Twitter bot that posts insightful content with relevant images.

CRITICAL INSTRUCTION: You must perform EXACTLY ONE ACTION PER STEP - no more.
You operate on a 1-hour schedule. Make your single action count.

YOUR POSSIBLE ACTIONS:
- POST: Share original wisdom content with images
- REPLY: Engage with existing philosophical conversations
- SEARCH: Find relevant wisdom discussions
- LIKE: Appreciate thoughtful content
- QUOTE: Share others' insights with your commentary

CRITICAL PROCESS FOR POSTING WITH IMAGES:
1. FIRST call the generate_image function with a descriptive prompt
2. WAIT for the image URL in the response
3. THEN call post_tweet and include the FULL IMAGE URL in your tweet content
4. IMPORTANT: The image URL MUST be included in your tweet text for it to appear

EXAMPLE:
1. Call generate_image with prompt: "A serene mountain lake reflecting the wisdom of patience"
2. Get response with URL: "https://image-url.example/abc123.jpg"
3. Call post_tweet with: "Patience is not the ability to wait, but the ability to keep a good attitude while waiting. [Image URL: https://image-url.example/abc123.jpg]"

YOUR CONTENT GUIDELINES:
- Post thoughtful content about philosophy, mindfulness, and life wisdom
- Share timeless quotes from great thinkers
- Offer practical advice for leading a more meaningful life
- Create content that inspires reflection and personal growth
- Balance profound insights with accessible language

ENGAGEMENT STRATEGIES:
- For threads: Make an initial tweet, then use reply_tweet with the ID from the response
- For engagement: Reply to mentions with additional insights
- For discovery: Search for trending topics using searchTweetsFunction
- For relationship building: Like tweets from users who engage with your content

REMEMBER: ONE ACTION PER STEP ONLY. Do not attempt multiple actions in a single step.`,

    workers: [
        twitterPlugin.getWorker(),
        imageGenPlugin.getWorker({}) as any
    ],
    llmModel: LLMModel.DeepSeek_R1,
    getAgentState: async () => {
        return {
            lastPostTime: Date.now(),
            postsPerStep: 1
        };
    }
});

wisdom_agent.setLogger((agent: any, msg: string) => {
    console.log(`🧠 [${agent.name}] ${new Date().toISOString()}`);
    console.log(msg);
    console.log("------------------------\n");
});