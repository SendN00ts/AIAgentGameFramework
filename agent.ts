import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import { createTwitterMediaWorker } from './plugins/twitterMediaPlugin';
import { createEnhancedImageGenPlugin } from './plugins/modifiedImageGenPlugin';
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

const imageGenConfig = {
    id: "wisdom_image_gen",
    name: "Wisdom Image Generator",
    description: "Generates images to accompany wisdom tweets",
    defaultWidth: 768,
    defaultHeight: 768,
    apiClientConfig: {
        apiKey: process.env.TOGETHER_API_KEY || '',
        baseApiUrl: "https://api.together.xyz/v1/images/generations"
    }
};

const enhancedImageGenWorker = createEnhancedImageGenPlugin(imageGenConfig);
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
    goal: "Share practical wisdom and actionable insights on Twitter to help people improve their lives",
    description: `You are a practical wisdom-sharing Twitter bot.

CRITICAL: You ONLY execute the SPECIFIC action given to you. DO NOT create your own plans or tasks.

CONTENT STYLE:
- Direct, practical advice
- Simple language
- Unique content every time
- NO hashtags ever
- 1-2 sentences max

IMAGE GENERATION:
Create diverse watercolor scenes. AVOID repeating recent subjects.

VARY YOUR SUBJECTS:
- Architecture: courtyards, staircases, arches, alcoves, towers, atriums
- Objects: teacup, journal, candle, lotus, stones, feather
- Spaces: meditation rooms, studios, window seats, alcoves

STYLE: Soft watercolor, muted earth tones, natural light, peaceful mood
CRITICAL: NO PEOPLE in images. Each image MUST be completely different.

PROCESS FOR IMAGE POSTS:
1. generate_image("unique watercolor scene", 768, 768)
2. get_latest_image_url()
3. upload_image_and_tweet("wisdom text", "url")

THEMES: productivity, habits, discipline, focus, goal-setting, time management, mindset

ONE ACTION PER STEP. EVERY OUTPUT MUST BE UNIQUE.`,

    workers: [
        twitterWorker,
        enhancedImageGenWorker,
        twitterMediaWorker,
        imageUrlHandlerWorker,
    ],
    llmModel: LLMModel.Llama_3_3_70B_Instruct,
    getAgentState: async () => {
        return {
            lastPostTime: Date.now(),
            postsPerStep: 1,
            repliesToday: 0
        };
    }
});

wisdom_agent.setLogger((agent: any, msg: string) => {
    console.log(`🧠 [${agent.name}] ${new Date().toISOString()}`);
    console.log(msg);
    console.log("------------------------\n");
});

if (typeof global !== 'undefined') {
    (global as any).activeAgent = wisdom_agent;
}