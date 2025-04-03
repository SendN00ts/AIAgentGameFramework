import { wisdom_agent } from './agent';

// Define actions as an enum to ensure type safety
enum ACTIONS {
  POST = 'post',
  POST_NO_IMAGE = 'post_no_image',
  REPLY = 'reply',
  REPLY_TARGETS = 'reply_targets',
  SEARCH = 'search',
  LIKE = 'like',
  QUOTE = 'quote'
}

let lastPostTime = 0;
let functionCalledThisCycle = false;
let imageRetryCount = 0;
const MAX_IMAGE_RETRIES = 3;

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
    // If we've exceeded max retries for image posts, fall back to text-only
    if (imageRetryCount >= MAX_IMAGE_RETRIES) {
      console.log(`⚠️ Max image retries (${MAX_IMAGE_RETRIES}) reached. Posting without image.`);
      imageRetryCount = 0; // Reset for next time
      return ACTIONS.POST_NO_IMAGE;
    }
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
    [ACTIONS.POST]: "POST original content with an image (use generate_image and upload_image_and_tweet)",
    [ACTIONS.POST_NO_IMAGE]: "POST original content WITHOUT an image (use post_tweet directly, NO image generation)",
    [ACTIONS.REPLY]: "REPLY to existing tweets (use reply_tweet)",
    [ACTIONS.REPLY_TARGETS]: "REPLY to wellness and philosophy accounts (use find_target_account and reply_tweet)",
    [ACTIONS.SEARCH]: "SEARCH for relevant content (use search_tweets)",
    [ACTIONS.LIKE]: "LIKE meaningful content (use like_tweet)",
    [ACTIONS.QUOTE]: "QUOTE other tweets with your commentary (use quote_tweet)"
  };
  
  // Add regeneration hint if needed
  let additionalInstructions = "";
  if (needsImageRegeneration && action === ACTIONS.POST) {
    additionalInstructions = `
IMPORTANT: Previous attempt failed due to image URL issues (attempt ${imageRetryCount+1}/${MAX_IMAGE_RETRIES}).
Please generate a FRESH NEW IMAGE using generate_image before posting.
DO NOT reuse previous image URLs. Generate a completely new image with a simpler prompt.
Use simpler image descriptions with fewer details for more reliable processing.
`;
  }

  if (action === ACTIONS.POST_NO_IMAGE) {
    additionalInstructions = `
IMPORTANT: After several failed attempts with images, you should post text-only content.
DO NOT use generate_image or upload_image_and_tweet functions.
Use the post_tweet function directly with your wisdom content.
Create high-quality, thoughtful content that stands on its own without an image.
`;
  }

  // Add targeted reply instructions if needed
  if (action === ACTIONS.REPLY_TARGETS) {
    additionalInstructions = `
IMPORTANT STEPS FOR REPLYING TO TARGET ACCOUNTS:
1. First use find_target_account to get information about a target wellness account and their latest tweet
2. Review the account description and tweet content carefully
3. Then use reply_tweet with the exact tweet ID to create a thoughtful, personalized reply
4. Be authentic, supportive and natural in your reply
5. Keep replies concise (1-3 sentences) and include 1-2 relevant hashtags
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
        case ACTIONS.POST:
          // For posts, add special error handling to detect image URL issues
          const result = await wisdom_agent.step({ verbose: true });
          
          // Check if response contains any indication of image URL issues
          if (result && typeof result === 'string' && 
             (result.includes("invalid image URL") || 
              result.includes("Image URL") || 
              result.includes("URL format") ||
              result.includes("403 Forbidden"))) {
            
            // Increment retry counter
            imageRetryCount++;
            
            if (imageRetryCount < MAX_IMAGE_RETRIES) {
              console.log(`⚠️ Image URL validation failed. Retry ${imageRetryCount}/${MAX_IMAGE_RETRIES}`);
              throw new Error("Image URL validation failed - regenerating image required");
            } else {
              // Max retries reached, will post without image next time
              console.log(`⚠️ Max image retries reached (${MAX_IMAGE_RETRIES}). Will post without image next cycle.`);
              success = false; // Force retry with text-only
            }
          } else {
            // Success! Reset image retry counter
            imageRetryCount = 0;
            success = true;
          }
          break;
        
        case ACTIONS.POST_NO_IMAGE:
          // Posting without an image
          await wisdom_agent.step({ verbose: true });
          imageRetryCount = 0; // Reset counter after successful post
          success = true;
          break;
          
        default:
          // Handle all other actions including REPLY_TARGETS
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
        
        if (imageRetryCount < MAX_IMAGE_RETRIES) {
          // Add special instruction to regenerate image
          updateAgentForAction(nextAction, true); // true flag adds image regeneration hint
          console.log(`🔄 Retrying post with image regeneration hint (${imageRetryCount}/${MAX_IMAGE_RETRIES})...`);
          await wisdom_agent.step({ verbose: true });
          success = true; // Assume this retry worked
        } else {
          // Will switch to text-only post in next cycle
          success = false;
        }
      } else {
        // For non-image errors or if retry failed, rethrow
        throw actionError;
      }
    }
    
    // If this was a successful post, update last post time
    if ((nextAction === ACTIONS.POST || nextAction === ACTIONS.POST_NO_IMAGE) && success) {
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