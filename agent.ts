// src/agent.ts
import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import ImageGenPlugin from "@virtuals-protocol/game-imagegen-plugin";
import dotenv from "dotenv";
dotenv.config();

// Check for required environment variables
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

let currentMove = 0; // This will reset on deployment, but at least rotate during runtime

// Create the wisdom agent
export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share valuable wisdom and knowledge with images on Twitter to educate and inspire followers",
    description: `You are a wisdom-sharing Twitter bot that posts insightful content with relevant images.

CRITICAL INSTRUCTION: You must perform EXACTLY ONE ACTION PER STEP - no more.

YOUR ACTIONS ROTATE BETWEEN:
1. POST: Use post_tweet with generate_image for new wisdom content
2. REPLY: Use reply_tweet to engage with others' content 
3. LIKE: Use like_tweet to appreciate meaningful content
4. QUOTE: Use quote_tweet to share others' content with your commentary

PROCESS FOR POSTING WITH IMAGES:
1. FIRST generate an image using generate_image with a prompt that matches your wisdom content
2. THEN use post_tweet including both your text content AND the image URL from the response
3. ALWAYS add an image to every original post

YOUR CONTENT GUIDELINES:
- Post thoughtful content about philosophy, science, mindfulness, and life advice
- Create engaging, practical wisdom that is applicable to everyday life
- Write in a warm, insightful tone that sounds like a real human, not preachy
- Keep posts conversational and varied
- Use only basic emojis like 😊 💡 ✨ 🌟 💭 when appropriate (avoid complex combinations)
- Do NOT use hashtags in your posts
- Do NOT repeat posts and phrases
- Focus on providing meaningful content that helps people grow intellectually and personally

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


wisdom_agent.setLogger((agent, msg) => {
    console.log(`🧠 [${agent.name}] Current Action: ${currentMove % 4}`);
    console.log(msg);
    
    const completedPostTweet = msg.includes("post_tweet") && !msg.includes("failed");
    const completedSearch = msg.includes("search_tweets") && !msg.includes("failed");
    const completedReply = msg.includes("reply_tweet") && !msg.includes("failed");
    const completedLike = msg.includes("like_tweet") && !msg.includes("failed");
    
    if (completedPostTweet || completedSearch || completedReply || completedLike) {
        console.log(`✅ Action ${currentMove % 4} completed successfully`);
        currentMove = (currentMove + 1) % 4;
        console.log(`⏭️ Rotating to next action: ${currentMove % 4}`);
        
        // Update the agent's description with new action
        const actionNames = ["POST with IMAGE", "SEARCH", "REPLY", "LIKE"];
        const updatedDesc = wisdom_agent.description.replace(
            /CURRENT REQUIRED ACTION: Action \d/,
            `CURRENT REQUIRED ACTION: Action ${currentMove % 4} (${actionNames[currentMove % 4]})`
        );
        wisdom_agent.description = updatedDesc;
    }
    
    console.log("------------------------\n");
});

// Initialize and log available functions
wisdom_agent.init().then(() => {
    // Log all available functions for debugging
    console.log("TWITTER FUNCTIONS:", 
        wisdom_agent.workers[0].functions.map(f => f.name)
    );
    
    console.log("IMAGE FUNCTIONS:", 
        wisdom_agent.workers[1].functions.map(f => f.name)
    );
    
    console.log(`STARTING WITH ACTION: ${currentMove % 4}`);
});