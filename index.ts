import { wisdom_agent } from './agent';
import { performTargetedReplies } from './plugins/replyGuyPlugin';

// Define actions as an enum to ensure type safety
enum ACTIONS {
  POST = 'post',
  REPLY = 'reply',
  REPLY_TARGETS = 'reply_targets',
  SEARCH = 'search',
  LIKE = 'like',
  QUOTE = 'quote'
}

let lastPostTime = 0;
let functionCalledThisCycle = false;

const POST_INTERVAL = 5 * 60 * 1000; // 5 hours for posts
const OTHER_ACTION_INTERVAL = 5 * 60 * 1000; // 15 minutes for other actions

// Track current action in rotation (excluding POST which has its own schedule)
let currentActionIndex = 0;
const nonPostActions = [
  ACTIONS.REPLY, 
  ACTIONS.REPLY_TARGETS, 
  ACTIONS.SEARCH, 
  ACTIONS.LIKE, 
  ACTIONS.QUOTE
];

// Function to get next action based on timing
function getNextAction(): ACTIONS {
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

// Function to update agent description with proper typing
function updateAgentForAction(action: ACTIONS, needsImageRegeneration = false): void {
  // Extract original description sections
  const baseDescription = wisdom_agent.description.split("CURRENT REQUIRED ACTION")[0];
  
  // Create new focused description with proper typing
  const actionDescriptions: Record<ACTIONS, string> = {
    [ACTIONS.POST]: "POST original content with an image (use post_tweet with generate_image)",
    [ACTIONS.REPLY]: "REPLY to existing tweets (use reply_tweet)",
    [ACTIONS.REPLY_TARGETS]: "REPLY to tweets from targeted accounts (use search_tweets and reply_tweet)",
    [ACTIONS.SEARCH]: "SEARCH for relevant content (use search_tweets)",
    [ACTIONS.LIKE]: "LIKE meaningful content (use like_tweet)",
    [ACTIONS.QUOTE]: "QUOTE other tweets with your commentary (use quote_tweet)"
  };
  
  // Add regeneration hint if needed
  let additionalInstructions = "";
  if (needsImageRegeneration && action === ACTIONS.POST) {
    additionalInstructions = `
IMPORTANT: Previous attempt failed due to image URL issues. 
Please generate a FRESH NEW IMAGE using generate_image before posting.
DO NOT reuse previous image URLs. Generate a completely new image with a simpler prompt.
Use simpler image descriptions with fewer details for more reliable processing.
`;
  }
  
  // Update agent's description
  wisdom_agent.description = `${baseDescription}
CURRENT REQUIRED ACTION: ${action.toUpperCase()}

You MUST perform ONLY this action: ${actionDescriptions[action]}
${additionalInstructions}
All other actions are forbidden in this cycle.`;
}

// Run agent with improved retry and scheduling
async function runAgentWithSchedule(retryCount = 0): Promise<void> {
  try {
    // Reset tracking
    functionCalledThisCycle = false;
    
    // Determine next action
    const nextAction = getNextAction();
    
    // Update agent description to focus on the chosen action
    updateAgentForAction(nextAction);
    
    // Run the appropriate action
    console.log(`Running agent step at ${new Date().toISOString()} - Action: ${nextAction}`);
    
    let success = false;
    
    try {
      switch (nextAction) {
        case ACTIONS.REPLY_TARGETS:
          await performTargetedReplies();
          success = true;
          break;
        case ACTIONS.POST:
          // For posts, add special error handling to detect image URL issues
          const result = await wisdom_agent.step({ verbose: true });
          // Check if response contains any indication of image URL issues
          if (result && typeof result === 'string' && 
             (result.includes("invalid image URL") || 
              result.includes("Image URL") || 
              result.includes("URL format") ||
              result.includes("403 Forbidden"))) {
            throw new Error("Image URL validation failed - regenerating image required");
          }
          success = true;
          break;
        default:
          await wisdom_agent.step({ verbose: true });
          success = true;
      }
    } catch (error: unknown) {
      const actionError = error as Error;
      console.error(`Action error (${nextAction}):`, actionError.message);
      
      // Special handling for image URL errors
      if (nextAction === ACTIONS.POST && 
          typeof actionError.message === 'string' && 
          (actionError.message.includes("Image URL") || 
           actionError.message.includes("URL format") ||
           actionError.message.includes("403 Forbidden"))) {
        // Add special instruction to regenerate image
        updateAgentForAction(nextAction, true); // true flag adds image regeneration hint
        console.log("Retrying post with image regeneration hint...");
        await wisdom_agent.step({ verbose: true });
        success = true; // Assume this retry worked
      } else {
        // For non-image errors or if retry failed, rethrow
        throw actionError;
      }
    }
    
    // If this was a successful post, update last post time
    if (nextAction === ACTIONS.POST && success) {
      lastPostTime = Date.now();
      console.log("Post completed. Next post in 5 hours.");
    }
    
    // Schedule next action
    setTimeout(() => runAgentWithSchedule(0), OTHER_ACTION_INTERVAL);
    
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

async function main(): Promise<void> {
  try {
    console.log("Initializing Twitter Bot...");
    
    // Sanitize description
    const sanitizedDescription = wisdom_agent.description.replace(/[\uD800-\uDFFF](?![\uD800-\uDFFF])|(?:[^\uD800-\uDFFF]|^)[\uDC00-\uDFFF]/g, '');
    wisdom_agent.description = sanitizedDescription;
    
    await wisdom_agent.init();
    console.log("Twitter Bot initialized successfully!");

    // Start scheduling
    runAgentWithSchedule();
    
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    process.exit(1);
  }
}

main();