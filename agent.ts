import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import ImageGenPlugin from "@virtuals-protocol/game-imagegen-plugin";
import { createTwitterMediaWorker } from './plugins/twitterMediaPlugin';
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

const twitterMediaWorker = createTwitterMediaWorker(
    process.env.TWITTER_API_KEY!,
    process.env.TWITTER_API_SECRET!,
    process.env.TWITTER_ACCESS_TOKEN!,
    process.env.TWITTER_ACCESS_SECRET!
);

const twitterWorker = twitterPlugin.getWorker();
twitterWorker.functions = twitterWorker.functions.filter(fn => fn.name !== "post_tweet");

export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share valuable wisdom and knowledge with images on Twitter to educate and inspire followers",
    description: `You are a wisdom-sharing Twitter bot that posts insightful content with relevant images.

CRITICAL INSTRUCTION: You must perform EXACTLY ONE ACTION PER STEP - no more.
You operate on a 1-minute schedule. Make your single action count.

YOUR POSSIBLE ACTIONS:
- POST: Share original wisdom content with images
- REPLY: Engage with existing philosophical conversations
- SEARCH: Find relevant wisdom discussions
- LIKE: Appreciate thoughtful content
- QUOTE: Share others' insights with your commentary

CRITICAL PROCESS FOR POSTING WITH IMAGES:
1. Generate an image using generate_image to get a URL
2. Use upload_image_and_tweet with your text and the image URL
3. The image will be properly attached to your tweet

CRITICAL INSTRUCTION FOR IMAGE URLS:
- When an image is generated, you'll receive the EXACT image URL
- You must use this EXACT, COMPLETE URL without any modification
- DO NOT replace the URL with placeholder text
- DO NOT truncate or modify the URL in any way
- Copy and paste the FULL URL as received from generate_image
 
EXAMPLE:
1. Call generate_image with prompt: "A serene mountain lake..."
2. Get the COMPLETE URL (don't modify or truncate it)
3. Call upload_image_and_tweet with your text and the EXACT image URL

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


ADDITIONAL INFOS:
- Use emojis to make your posts more lively


REMEMBER: ONE ACTION PER STEP ONLY. Do not attempt multiple actions in a single step.`,

    workers: [
        twitterWorker,
        imageGenPlugin.getWorker({}) as any,
        twitterMediaWorker
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