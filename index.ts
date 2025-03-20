import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import ImageGenPlugin from "@virtuals-protocol/game-imagegen-plugin";
import dotenv from "dotenv";
import fs from 'fs';
dotenv.config();

interface TwitterBotState {
  moveCounter: number;
  actionHistory: any[];
  lastAction: string | null;
  engagementStats: {
      posts: number;
      searches: number;
      replies: number;
      likes: number;
  };
  lastUpdated: number;
}

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

// Path for persistent state
const STATE_FILE = './twitter_bot_state.json';

// State management functions
function loadState(): TwitterBotState {
  try {
      if (fs.existsSync(STATE_FILE)) {
          return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      }
  } catch (error) {
      console.error("Error loading state:", error);
  }
  
  // Default initial state
  return {
      moveCounter: 0,
      actionHistory: [],
      lastAction: null,
      engagementStats: {
          posts: 0,
          searches: 0,
          replies: 0,
          likes: 0
      },
      lastUpdated: Date.now()
  };
}

function saveState(state: TwitterBotState): void {
  try {
      state.lastUpdated = Date.now();
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
      console.error("Error saving state:", error);
  }
}

// Create the wisdom agent
export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Share wisdom and engage with Twitter community through a balanced rotation of actions",
    description: `You are a wisdom-sharing Twitter bot that follows a strict action rotation system.

ENGAGEMENT ROTATION SYSTEM:
- Your actions are determined by the current moveCounter in your agent state
- You MUST perform the action assigned to your current move
- Each successful action increments the moveCounter for the next rotation

ACTION ASSIGNMENTS:
- Move 0: POST original wisdom content with an image
- Move 1: SEARCH for similar wisdom content and accounts
- Move 2: REPLY to content from previous searches to build connections
- Move 3: LIKE meaningful content from wisdom thought leaders

CHECK YOUR CURRENT MOVE AND FOLLOW IT EXACTLY.
Your current moveCounter is: {{moveCounter}}
Your next required action is: {{requiredAction}}

IMPORTANT: Keep track of content you find during searches, as you'll need these for replies and likes in later moves.

ENGAGEMENT GUIDELINES:
- Be authentic, supportive and add value
- Ask thoughtful questions in replies
- Connect others' ideas to philosophical concepts
- Avoid self-promotion when engaging
`,

    workers: [
        twitterPlugin.getWorker(),
        imageGenPlugin.getWorker({}) as any
    ],
    llmModel: LLMModel.DeepSeek_R1,
    
    // Dynamic agent state with rotation logic
    getAgentState: async () => {
        // Load persistent state
        const state = loadState();
        
        // Define action mapping
        const actions = [
            "POST original wisdom with an image (use post_tweet + generate_image)",
            "SEARCH for similar content (use search_tweets to find wisdom content)",
            "REPLY to previous findings (use reply_tweet to engage)",
            "LIKE meaningful content (use like_tweet to appreciate)"
        ];
        
        // Determine current required action
        const currentMove = state.moveCounter % 4;
        const requiredAction = actions[currentMove];
        
        // Return formatted state for the agent
        return {
            moveCounter: state.moveCounter,
            requiredAction: requiredAction,
            engagementStats: state.engagementStats,
            actionHistory: state.actionHistory.slice(-5), // Last 5 actions
            mustFollowRotation: true
        };
    }
});

// Set up enhanced logging and state management
wisdom_agent.setLogger((agent, msg) => {
    // Load current state
    const state = loadState();
    const moveNumber = state.moveCounter;
    const actionType = moveNumber % 4;
    
    // Log with context
    console.log(`🧠 [${agent.name}] Move #${moveNumber} (Action Type: ${actionType})`);
    console.log(msg);
    
    // Track function calls and update state
    if (msg.includes("Function 'post_tweet' executed")) {
        state.lastAction = "post";
        state.engagementStats.posts++;
        state.moveCounter++;
        state.actionHistory.push({
            type: "post",
            timestamp: Date.now(),
            content: msg
        });
        console.log("📝 POST COMPLETE - Moving to next rotation");
    } 
    else if (msg.includes("Function 'search_tweets' executed")) {
        state.lastAction = "search";
        state.engagementStats.searches++;
        state.moveCounter++;
        state.actionHistory.push({
            type: "search", 
            timestamp: Date.now(),
            content: msg
        });
        console.log("🔍 SEARCH COMPLETE - Moving to next rotation");
    }
    else if (msg.includes("Function 'reply_tweet' executed")) {
        state.lastAction = "reply";
        state.engagementStats.replies++;
        state.moveCounter++;
        state.actionHistory.push({
            type: "reply",
            timestamp: Date.now(),
            content: msg
        });
        console.log("↩️ REPLY COMPLETE - Moving to next rotation");
    }
    else if (msg.includes("Function 'like_tweet' executed")) {
        state.lastAction = "like";
        state.engagementStats.likes++;
        state.moveCounter++;
        state.actionHistory.push({
            type: "like",
            timestamp: Date.now(),
            content: msg
        });
        console.log("❤️ LIKE COMPLETE - Moving to next rotation");
    }
    
    // Save updated state
    saveState(state);
    console.log("------------------------\n");
});

// Log available functions after initialization for debugging
wisdom_agent.init().then(() => {
    console.log("AVAILABLE TWITTER FUNCTIONS:", 
        wisdom_agent.workers[0].functions.map(f => {
            return {name: f.name, description: f.description};
        })
    );
    
    const state = loadState();
    console.log("CURRENT STATE:", {
        moveCounter: state.moveCounter,
        lastAction: state.lastAction,
        engagementStats: state.engagementStats,
        actionHistory: state.actionHistory.length
    });
});