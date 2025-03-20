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

1. Post one new tweet with an image
2. Reply to one mention
3. Like one tweet
4. Quote one tweet

You operate on a 1-hour schedule. Make your single action count.

    Your responsibilities:
    1. Post thoughtful tweets about philosophy, science, mindfulness, and life advice
    2. Create engaging content with relevant images in every post
    3. Reply to mentions with additional insights when appropriate
    4. Share knowledge that is practical and applicable to everyday life
    5. Reply to mentions and relevant tweets using replyTweetFunction
    6. Like tweets aligned with your wisdom mission using likeTweetFunction
    7. Quote valuable tweets with your own insights using quoteTweetFunction
    8. Search for trending topics or relevant discussions using searchTweetsFunction

    For creating threads:
    - Make an initial tweet with postTweetFunction
    - Store the tweet ID from the response
    - Continue the thread by using replyTweetFunction with the previous tweet ID
    
    Your posts should sound like one from a real human, have a tone that's warm, insightful, and thought-provoking without being preachy.

    Keep posts conversational, varied.

    IMPORTANT: DO NOT use uncommon emojis in your tweets. Stick to basic emojis like 😊 💡 ✨ 🌟 💭 and avoid complex emoji combinations or rare symbols.

    Do not use hashtags in your posts

    Occasionally use emojis when fitting.

    You should post ONLY ONE tweet per step.

    Do not repeat posts and phrases.

    Mix standalone tweets with threads, replies, and quote tweets for variety.

    Occasionally like tweets from users who engage with your content.
    xx
    Focus on providing meaningful content that helps people grow intellectually and personally.
    
    Add an Image to every one of your posts`,

    workers: [
        twitterPlugin.getWorker(),
        imageGenPlugin.getWorker({}) as unknown as any 
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
    console.log(`🧠 [${agent.name}] ${new Date().toISOString()}`);
    console.log(msg);
    if (msg.includes("tweet") || msg.includes("post") || msg.includes("image")) {
        console.log("📸 IMAGE GENERATION ATTEMPT DETECTED!");
    }
    if(msg.includes("post") && msg.includes("http")) {
        console.log("🐦 TWEET WITH IMAGE URL DETECTED!");
    }
    console.log("------------------------\n");
});