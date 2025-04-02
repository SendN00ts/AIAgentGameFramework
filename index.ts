import { wisdom_agent } from './agent';

let lastPostTime = 0;
let functionCalledThisCycle = false;

// Action rotation - post is special and less frequent
const ACTIONS = {
  POST: 'post',
  REPLY: 'reply',
  SEARCH: 'search',
  LIKE: 'like',
  QUOTE: 'quote'
};

// Config for timing
const POST_INTERVAL = 5 * 60 * 60 * 1000; // 1 hour for posts
const OTHER_ACTION_INTERVAL = 15 * 60 * 1000; // 15 minutes for other actions

// Track current action in rotation (excluding POST which has its own schedule)
let currentActionIndex = 0;
const nonPostActions = [ACTIONS.REPLY, ACTIONS.SEARCH, ACTIONS.LIKE, ACTIONS.QUOTE];

// Function to get next action based on timing
function getNextAction() {
  const now = Date.now();
  const timeSinceLastPost = now - lastPostTime;
  
  // If it's been more than POST_INTERVAL since last post, do a post
  if (timeSinceLastPost >= POST_INTERVAL) {
    return ACTIONS.POST;
  }
  
  // Otherwise, pick the next action in rotation
  const action = nonPostActions[currentActionIndex];
  currentActionIndex = (currentActionIndex + 1) % nonPostActions.length;
  return action;
}

// Run agent with improved retry and scheduling
async function runAgentWithSchedule(retryCount = 0) {
  try {
    // Reset tracking
    functionCalledThisCycle = false;
    
    // Determine next action
    const nextAction = getNextAction();
    
    // Update agent description to focus on the chosen action
    updateAgentForAction(nextAction);
    
    // Run a step
    console.log(`Running agent step at ${new Date().toISOString()} - Action: ${nextAction}`);
    await wisdom_agent.step({ verbose: true });
    
    // If this was a post, update last post time
    if (nextAction === ACTIONS.POST) {
      lastPostTime = Date.now();
      console.log("Post completed. Next post in one hour.");
      setTimeout(() => runAgentWithSchedule(0), OTHER_ACTION_INTERVAL);
    } else {
      console.log(`${nextAction.toUpperCase()} action completed. Next action in 15 minutes.`);
      setTimeout(() => runAgentWithSchedule(0), OTHER_ACTION_INTERVAL);
    }
  } catch (error) {
    // Error handling with exponential backoff
    console.error(`Error running agent step:`, error);
    
    const baseDelay = Math.min(
      (Math.pow(2, retryCount) * 60 * 1000),
      30 * 60 * 1000
    );
    const jitter = Math.random() * 30 * 1000;
    const retryDelay = baseDelay + jitter;
    
    console.log(`Retry attempt ${retryCount+1}, waiting ${Math.round(retryDelay/1000)} seconds...`);
    setTimeout(() => runAgentWithSchedule(retryCount + 1), retryDelay);
  }
}

function updateAgentForAction(action: string) {
  // Extract original description sections
  const baseDescription = wisdom_agent.description.split("CURRENT REQUIRED ACTION")[0];
  
  // Create new focused description with proper typing
  const actionDescriptions: Record<string, string> = {
    post: "POST original content with an image (use post_tweet with generate_image)",
    reply: "REPLY to existing tweets (use reply_tweet)",
    search: "SEARCH for relevant content (use search_tweets)",
    like: "LIKE meaningful content (use like_tweet)",
    quote: "QUOTE other tweets with your commentary (use quote_tweet)"
  };
  
  // Update agent's description
  wisdom_agent.description = `${baseDescription}
CURRENT REQUIRED ACTION: ${action.toUpperCase()}

You MUST perform ONLY this action: ${actionDescriptions[action as keyof typeof actionDescriptions]}

All other actions are forbidden in this cycle.`;
}

async function main() {
  try {
    console.log("Initializing Twitter Bot...");
    
    // Sanitize description
    const sanitizedDescription = wisdom_agent.description.replace(/[\uD800-\uDFFF](?![\uD800-\uDFFF])|(?:[^\uD800-\uDFFF]|^)[\uDC00-\uDFFF]/g, '');
    wisdom_agent.description = sanitizedDescription;
    
    await wisdom_agent.init();
    console.log("Twitter Bot initialized successfully!");

    
// Access functions through the initialized agent
console.log("AVAILABLE TWITTER FUNCTIONS:", 
  wisdom_agent.workers[0].functions.map(f => `${f.name}: ${f.description}`)
);

// Also check image generation functions
console.log("AVAILABLE IMAGE FUNCTIONS:",
  wisdom_agent.workers[1].functions.map(f => `${f.name}: ${f.description}`)
);
    
    // Start scheduling
    runAgentWithSchedule();
    
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    process.exit(1);
  }
}

main();