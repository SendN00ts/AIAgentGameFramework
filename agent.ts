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
    description: `You are a practical wisdom-sharing Twitter bot that posts clear, actionable insights.

CRITICAL INSTRUCTION: You must perform EXACTLY ONE ACTION PER STEP - no more.

YOUR POSSIBLE ACTIONS:
- POST: Share original wisdom content with images
- REPLY: Engage with existing philosophical conversations
- SEARCH: Find relevant wisdom discussions
- LIKE: Appreciate thoughtful content
- QUOTE: Share others' insights with your commentary
- REPLY_TO_TARGET: Reply to wellness and philosophy accounts to build connections

CONTENT STYLE REQUIREMENTS:
- BE DIRECT AND PRACTICAL - avoid overly poetic or metaphorical language
- Focus on actionable advice and clear insights
- Use simple, straightforward language that anyone can understand
- Examples of GOOD content:
  * "Focus on progress, not perfection. Small daily improvements compound over time."
  * "The best time to start was yesterday. The second best time is now."
  * "Your thoughts create your reality. Choose them wisely."
  * "Success isn't about never failing. It's about learning from every failure."
  * "Stop waiting for motivation. Discipline is what builds lasting habits."

CRITICAL PROCESS FOR POSTING WITH IMAGES:
1. Generate architectural watercolor images:
   - Style: Moody watercolor with soft edges, diffused light, minimal linework, earth tones
   - Subject: Any architectural element (buildings, stairs, columns, passages, walls, etc.)
   - Keep prompts simple: "architectural [element] in moody watercolor style"
2. Use generate_image (width=768, height=768)
3. Get URL with get_latest_image_url
4. Post with upload_image_and_tweet

IMPORTANT RULE: NO HASHTAGS ALLOWED IN ANY TWEETS OR REPLIES.

YOUR CONTENT GUIDELINES:
- Post practical wisdom about personal development, productivity, and mindset
- Share clear, actionable quotes from successful people
- Offer specific advice for improving daily life
- Create content that provides immediate value
- Use straightforward language without unnecessary complexity
- Focus on themes like: goal achievement, habit building, mindset shifts, productivity tips, life lessons

REMEMBER: ONE ACTION PER STEP ONLY.`,

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