// src/agent.ts
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
    apiClientConfig: {
        apiKey: process.env.TOGETHER_API_KEY || '',
    }
});

// Counter to track sessions and rotation (persists only during runtime)
let sessionCounter = 0;

// Create the wisdom agent
export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share valuable wisdom and engage meaningfully on Twitter",
    description: `You are a wisdom-sharing Twitter bot.

IMPORTANT INSTRUCTIONS:
- In each session, choose ONLY ONE of these actions:
  1. POST a new insightful tweet with an image (use post_tweet and generate_image)
  2. REPLY to a mention or comment (use reply_tweet)
  3. SEARCH for relevant content (use search_tweets)
  4. LIKE a tweet that aligns with your values (use like_tweet)

Follow a rotation pattern to ensure variety in your actions.
Current rotation position: SESSION_NUMBER % 4
- If 0: Post new content with an image
- If 1: Reply to someone
- If 2: Search for content
- If 3: Like content

This ensures balanced activity rather than only posting.

When posting:
- Share thoughtful, insightful content about philosophy, science, mindfulness, and life advice
- Generate relevant images that complement your wisdom
- Use a warm, conversational tone that sounds human
- Avoid hashtags and complex emoji combinations
- Keep posts substantive and meaningful
- Do not repeat content

For every action, provide clear reasoning for your choice.`,

    workers: [
        twitterPlugin.getWorker(),
        imageGenPlugin.getWorker({}) as any
    ],
    llmModel: LLMModel.DeepSeek_R1,
    getAgentState: async () => {
        // Increment the session counter each time
        sessionCounter++;
        const rotationPosition = sessionCounter % 4;
        
        return {
            sessionCounter: sessionCounter,
            rotationPosition: rotationPosition,
            actionMap: [
                "post_tweet + generate_image",
                "reply_tweet",
                "search_tweets",
                "like_tweet"
            ],
            currentAction: ["post_tweet + generate_image", "reply_tweet", "search_tweets", "like_tweet"][rotationPosition],
            lastActionTime: Date.now()
        };
    }
});

// Set up logging with enhanced debugging for function calls
wisdom_agent.setLogger((agent, msg) => {
    const timestamp = new Date().toISOString();
    console.log(`🧠 [${agent.name}] ${timestamp}`);
    console.log(msg);
    
    // Track function usage
    if(msg.includes("post_tweet")) {
        console.log("📝 POSTING TWEET");
    } else if(msg.includes("reply_tweet")) {
        console.log("↩️ REPLYING TO TWEET");
    } else if(msg.includes("search_tweets")) {
        console.log("🔍 SEARCHING TWEETS");
    } else if(msg.includes("like_tweet")) {
        console.log("❤️ LIKING TWEET");
    } else if(msg.includes("generate_image")) {
        console.log("🖼️ GENERATING IMAGE");
    }
    
    console.log("------------------------\n");
});

// Log available functions after initialization
wisdom_agent.init().then(() => {
    console.log("AVAILABLE TWITTER FUNCTIONS:", 
        wisdom_agent.workers[0].functions.map(f => {
            return {name: f.name, description: f.description};
        })
    );
    
    console.log("AVAILABLE IMAGE GENERATION FUNCTIONS:", 
        wisdom_agent.workers[1].functions.map(f => {
            return {name: f.name, description: f.description};
        })
    );
});