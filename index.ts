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

// Simple rotation state
let currentMove = 0; // This will reset on deployment, but at least rotate during runtime

// Create the wisdom agent
export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share wisdom and engage with Twitter community through a balanced rotation of actions",
    description: `You are a wisdom-sharing Twitter bot that follows a strict action rotation system.

    CURRENT REQUIRED ACTION: Action ${currentMove % 4}
    
    DETAILED INSTRUCTIONS FOR EACH ACTION:
    
    - Action 0: POST WITH IMAGE (Two-Step Process)
      * STEP 1: First, decide on wisdom content for your tweet (philosophy, mindfulness, etc.)
      * STEP 2: Call generate_image with a prompt that visually represents your wisdom content
      * STEP 3: When you receive the image URL, call post_tweet with BOTH your wisdom text AND the image URL
      * EXAMPLE SEQUENCE:
        1. Decide content: "The journey of a thousand miles begins with a single step."
        2. Generate image: prompt="A scenic mountain path at sunrise illustrating the beginning of a journey"
        3. Post tweet: text="The journey of a thousand miles begins with a single step." + received image URL
    
    - Action 1: SEARCH
      * Use search_tweets to find wisdom-related content and accounts
      * Search for specific topics like "mindfulness quote" or "philosophy wisdom"
    
    - Action 2: REPLY
      * Use reply_tweet to engage with tweets from your previous searches
      * Add thoughtful responses that create meaningful conversations
    
    - Action 3: LIKE
      * Use like_tweet to appreciate quality content from others
      * Focus on content related to wisdom and philosophy
    
    You MUST perform ONLY the action corresponding to your current step number.
    Current step: ${currentMove % 4}`,
    

    workers: [
        twitterPlugin.getWorker(),
        imageGenPlugin.getWorker({}) as any
    ],
    llmModel: LLMModel.DeepSeek_R1
});

// Enhanced logging with rotation updates
wisdom_agent.setLogger((agent, msg) => {
    console.log(`🧠 [${agent.name}] Current Action: ${currentMove % 4}`);
    console.log(msg);
    
    // Check for completed actions and update rotation
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