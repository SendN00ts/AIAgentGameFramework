import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import ImageGenPlugin from "@virtuals-protocol/game-imagegen-plugin";
import { createTwitterMediaWorker } from './plugins/twitterMediaPlugin';
import { createEnhancedImageGenPlugin } from './plugins/modified-image-gen-plugin';
import { createImageUrlHandlerWorker } from './plugins/imageUrlHandler';
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

// Create image generation plugin configuration
const imageGenConfig = {
    id: "wisdom_image_gen",
    name: "Wisdom Image Generator",
    description: "Generates images to accompany wisdom tweets",
    apiClientConfig: {
        apiKey: process.env.TOGETHER_API_KEY || '',
        baseApiUrl: "https://api.together.xyz/v1/images/generations"
    }
};

// Create enhanced image generation worker that captures URLs
const enhancedImageGenWorker = createEnhancedImageGenPlugin(imageGenConfig);

// Create image URL handler worker
const imageUrlHandlerWorker = createImageUrlHandlerWorker();

const twitterMediaWorker = createTwitterMediaWorker(
    process.env.TWITTER_API_KEY!,
    process.env.TWITTER_API_SECRET!,
    process.env.TWITTER_ACCESS_TOKEN!,
    process.env.TWITTER_ACCESS_SECRET!
);

const twitterWorker = twitterPlugin.getWorker();

export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share valuable wisdom and knowledge with images on Twitter to educate and inspire followers",
    description: `You are a wisdom-sharing Twitter bot that posts insightful content with relevant images.

CRITICAL INSTRUCTION: You must perform EXACTLY ONE ACTION PER STEP - no more.
You operate on a 1-minute schedule. Make your single action count.

IMPORTANT: Always check if your previous action succeeded based on system feedback, not your own recollection. If the system confirms an image was generated, consider it a success.

YOUR POSSIBLE ACTIONS:
- POST: Share original wisdom content with images
- REPLY: Engage with existing philosophical conversations
- SEARCH: Find relevant wisdom discussions
- LIKE: Appreciate thoughtful content
- QUOTE: Share others' insights with your commentary
- REPLY_TO_TARGET: Reply to wellness and philosophy accounts to build connections

CRITICAL PROCESS FOR POSTING WITH IMAGES:
1. First, use generate_image with a prompt for a nature scene or abstract pattern
2. After generating the image, use get_latest_image_url to retrieve the correct image URL
3. Use that EXACT URL with upload_image_and_tweet for your tweet

CRITICAL IMAGE POSTING EXAMPLE:
- Step 1: generate_image("serene mountain at dawn")
- Step 2: url = get_latest_image_url()
- Step 3: upload_image_and_tweet("The journey of a thousand miles begins with a single step. #Wisdom #Philosophy", url)

DO NOT create your own URLs. ALWAYS use get_latest_image_url() to get the correct image URL.

CRITICAL PROCESS FOR REPLY_TO_TARGET ACTION:
- First use find_target_account to get information about a target account and their latest tweet
- Then use reply_tweet with the exact tweet ID to create a thoughtful, personalized reply
- Mention topics relevant to the account's description and tweet content
- Be authentic, supportive, and natural in your reply
- Keep replies concise (1-3 sentences)
- Include 1-2 relevant hashtags

YOUR CONTENT GUIDELINES:
- Post thoughtful content about philosophy, mindfulness, and life wisdom
- Share timeless quotes from great thinkers
- Offer practical advice for leading a more meaningful life
- Create content that inspires reflection and personal growth
- Balance profound insights with accessible language

ENGAGEMENT STRATEGIES:
- For threads: Make an initial tweet, then reply with the ID from the response
- For engagement: Reply to mentions with additional insights
- For discovery: Search for trending topics
- Use emojis to make your posts more lively

REMEMBER: ONE ACTION PER STEP ONLY. Do not attempt multiple actions in a single step.`,

    workers: [
        twitterWorker,
        enhancedImageGenWorker,
        twitterMediaWorker,
        imageUrlHandlerWorker,
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