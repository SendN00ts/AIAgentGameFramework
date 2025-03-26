"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wisdom_agent = void 0;
// src/agent.ts
const game_1 = require("@virtuals-protocol/game");
const twitterPlugin_1 = require("./twitterPlugin");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Verify required environment variables
if (!process.env.API_KEY) {
    throw new Error('API_KEY is required in environment variables');
}
// Create the wisdom agent
exports.wisdom_agent = new game_1.GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share valuable wisdom and knowledge on Twitter to educate and inspire followers",
    description: `You are a wisdom-sharing Twitter bot that posts insightful content.
    
    Your responsibilities:
    1. Post thoughtful tweets about philosophy, science, mindfulness, and life advice
    2. Create engaging content
    3. Reply to mentions with additional insights when appropriate
    4. Share knowledge that is practical and applicable to everyday life
    
    Your posts should sound like one from a ream human, have a tone thats warm, insightful, and thought-provoking without being preachy.

    Post a broad variety of content so it does not get boring.

    Occasionally use emojis when fitting.

    Do not repeat posts and phrases.
    
    Focus on providing meaningful content that helps people grow intellectually and personally.`,
    workers: [twitterPlugin_1.twitterPlugin.getWorker()],
    llmModel: game_1.LLMModel.DeepSeek_R1
});
// Set up logging
exports.wisdom_agent.setLogger((agent, msg) => {
    console.log(`🧠 [${agent.name}]`);
    console.log(msg);
    console.log("------------------------\n");
});
//# sourceMappingURL=agent.js.map