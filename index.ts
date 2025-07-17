import { wisdom_agent } from './agent';
import * as http from 'http';
import { replyManager } from './plugins/replyGuyPlugin/replyManager';
import { RateLimitHandler } from './plugins/rateLimitHandler';

// Define actions as an enum to ensure type safety
enum ACTIONS {
  POST = 'post',
  POST_NO_IMAGE = 'post_no_image',
  REPLY = 'reply',
  REPLY_TARGETS = 'reply_targets',
  SEARCH = 'search',
  LIKE = 'like',
  QUOTE = 'quote',
  SKIP = 'skip' // Add skip action for when rate limited
}

// Constant for image post probability (35%)
const IMAGE_POST_PROBABILITY = 0.35;

// Tracking variables
let lastPostTime = 0;
let functionCalledThisCycle = false;
let imageRetryCount = 0;
const MAX_IMAGE_RETRIES = 2;

// Stats tracking for image vs text posts
let totalPosts = 0;
let imagePosts = 0;
let textPosts = 0;

// Config for timing
const POST_INTERVAL = 15 * 60 * 1000; 
const OTHER_ACTION_INTERVAL = 10 * 60 * 1000; 

// Track current action in rotation
let currentActionIndex = 0;
const READ_ACTIONS = [ACTIONS.REPLY, ACTIONS.REPLY_TARGETS, ACTIONS.SEARCH, ACTIONS.LIKE, ACTIONS.QUOTE];
const WRITE_ACTIONS = [ACTIONS.POST, ACTIONS.POST_NO_IMAGE];

// Get rate limit handler instance
const rateLimitHandler = RateLimitHandler.getInstance();

// Function to check if action requires reading from Twitter
function isReadAction(action: ACTIONS): boolean {
  return READ_ACTIONS.includes(action);
}

// Function to get next action based on timing and rate limits
function getNextAction(): ACTIONS {
  const now = Date.now();
  const timeSinceLastPost = now - lastPostTime;
  
  console.log("Time since last post:", Math.round(timeSinceLastPost/1000), "seconds");
  console.log("POST_INTERVAL:", Math.round(POST_INTERVAL/1000), "seconds");
  
  // If it's been more than POST_INTERVAL since last post, do a post
  if (timeSinceLastPost >= POST_INTERVAL) {
    console.log("Time for a new post!");
    
    // FIXED: Randomly decide image vs text EVERY TIME based on probability
    const randomValue = Math.random();
    console.log(`Random value: ${randomValue.toFixed(3)}, Image threshold: ${IMAGE_POST_PROBABILITY}`);
    
    if (randomValue <= IMAGE_POST_PROBABILITY) {
      // Try to post with image, but check retry count
      if (imageRetryCount < MAX_IMAGE_RETRIES) {
        console.log(`✅ Selected POST WITH image (${(randomValue * 100).toFixed(1)}% <= ${IMAGE_POST_PROBABILITY * 100}%)`);
        return ACTIONS.POST;
      } else {
        console.log(`⚠️ Would post with image but max retries reached (${imageRetryCount}/${MAX_IMAGE_RETRIES}). Forcing text-only.`);
        imageRetryCount = 0; // Reset for next cycle
        return ACTIONS.POST_NO_IMAGE;
      }
    } else {
      console.log(`✅ Selected POST WITHOUT image (${(randomValue * 100).toFixed(1)}% > ${IMAGE_POST_PROBABILITY * 100}%)`);
      return ACTIONS.POST_NO_IMAGE;
    }
  }
  
  // For non-post actions, check rate limits
  // If rate limited, return SKIP instead of a fake post action
  if (!rateLimitHandler.canMakeReadRequest()) {
    console.log("⚠️ No read actions available due to rate limits. Skipping this cycle.");
    const timeUntilNextPost = POST_INTERVAL - timeSinceLastPost;
    console.log(`Next post in ${Math.round(timeUntilNextPost/1000)} seconds`);
    return ACTIONS.SKIP;
  }
  
  // Pick the next action in rotation from available read actions
  const action = READ_ACTIONS[currentActionIndex];
  currentActionIndex = (currentActionIndex + 1) % READ_ACTIONS.length;
  return action;
}

// Function to update agent description with proper typing
function updateAgentForAction(action: ACTIONS, needsImageRegeneration = false): void {
  // Skip updating agent for SKIP action
  if (action === ACTIONS.SKIP) {
    return;
  }
  
  // Create new focused description with proper typing
  const actionDescriptions: Record<ACTIONS, string> = {
    [ACTIONS.POST]: "POST original wisdom content with images",
    [ACTIONS.POST_NO_IMAGE]: "POST original wisdom content WITHOUT an image (use post_tweet directly)",
    [ACTIONS.REPLY]: "REPLY to existing philosophical conversations",
    [ACTIONS.REPLY_TARGETS]: "REPLY to wellness and philosophy accounts (use find_target_account and reply_tweet)",
    [ACTIONS.SEARCH]: "SEARCH for relevant wisdom discussions",
    [ACTIONS.LIKE]: "LIKE meaningful philosophical content",
    [ACTIONS.QUOTE]: "QUOTE other wisdom tweets with your commentary",
    [ACTIONS.SKIP]: "SKIP this cycle"
  };
  
  // Add regeneration hint if needed
  let additionalInstructions = "";
  if (needsImageRegeneration && action === ACTIONS.POST) {
    additionalInstructions = `
IMPORTANT: Previous attempt failed due to image URL issues (attempt ${imageRetryCount+1}/${MAX_IMAGE_RETRIES}).
Please generate a FRESH NEW IMAGE using generate_image before posting.
DO NOT reuse previous image URLs. Generate a completely new image with a simpler prompt.
Use simpler image descriptions with fewer details for more reliable processing.
Use smaller image dimensions (width=768, height=768) for better reliability.
REMEMBER to get the image URL using get_latest_image_url() after generating the image.
`;
  }

  if (action === ACTIONS.POST_NO_IMAGE) {
    additionalInstructions = `
IMPORTANT: You should post text-only content.
DO NOT use generate_image or try to include an image.
Use the post_tweet function directly with your wisdom content.
Create high-quality, thoughtful content that stands on its own without an image.
`;
  }

  if (action === ACTIONS.REPLY_TARGETS) {
    additionalInstructions = `
IMPORTANT STEPS FOR REPLYING TO TARGET ACCOUNTS:
1. First use find_target_account to get information about a target wellness account and their latest tweet
2. Review the account description and tweet content carefully
3. Then use reply_tweet with the exact tweet ID to create a thoughtful, personalized reply
4. Be authentic, supportive and natural in your reply
5. Keep replies concise (1-3 sentences)
6. IMPORTANT: DO NOT USE HASHTAGS IN YOUR REPLIES
`;
  }
  
  // Update agent's description
  wisdom_agent.description = `You are a practical wisdom-sharing Twitter bot that posts clear, actionable insights.

CRITICAL INSTRUCTION: You must perform EXACTLY ONE ACTION PER STEP - no more.
You operate on a 1-minute schedule. Make your single action count.

IMPORTANT RULE: NO HASHTAGS ALLOWED IN ANY TWEETS OR REPLIES.

YOUR POSSIBLE ACTIONS:
- POST: Share original wisdom content with images
- REPLY: Engage with existing philosophical conversations
- SEARCH: Find relevant wisdom discussions
- LIKE: Appreciate thoughtful content
- QUOTE: Share others' insights with your commentary
- REPLY_TO_TARGET: Reply to wellness and philosophy accounts to build connections

CURRENT REQUIRED ACTION: ${action.toUpperCase()}

You MUST perform ONLY this action: ${actionDescriptions[action]}
${additionalInstructions}
All other actions are forbidden in this cycle.

CONTENT STYLE REQUIREMENTS:
- BE DIRECT AND PRACTICAL - avoid overly poetic or metaphorical language
- Focus on actionable advice and clear insights
- Use simple, straightforward language that anyone can understand
- Avoid vague mystical references or abstract concepts
- Examples of GOOD content:
  * "Focus on progress, not perfection. Small daily improvements compound over time."
  * "The best time to start was yesterday. The second best time is now."
  * "Your thoughts create your reality. Choose them wisely."
  * "Success isn't about never failing. It's about learning from every failure."
  * "Stop waiting for motivation. Start building discipline."
  * "Your mindset determines your reality. Choose thoughts that serve you."
- Examples of BAD content (too poetic/vague):
  * "Silent beneath the surface, truths intertwine through the endless giving..."
  * "Whispers of ancient wisdom dance through the ethereal realm..."
  * "The mystic tapestry of existence weaves through..."

CRITICAL PROCESS FOR POSTING WITH IMAGES:
1. First, use generate_image with a simple nature scene prompt (width=768, height=768)
2. After generating the image, use get_latest_image_url to retrieve the correct image URL
3. Use that EXACT URL with upload_image_and_tweet for your tweet

IMAGE GENERATION GUIDELINES:
- Use simple, clean prompts for nature scenes (mountain, forest, ocean, sunset)
- Avoid complex artistic styles or abstract descriptions
- Keep prompts under 15 words
- Example good prompts: "peaceful mountain lake at sunrise", "serene forest path", "calm ocean waves"

YOUR CONTENT GUIDELINES:
- Post practical wisdom about personal development, productivity, and mindset
- Share clear, actionable quotes from successful people
- Offer specific advice for improving daily life
- Create content that provides immediate value
- Use straightforward language without unnecessary complexity
- Focus on themes like: goal achievement, habit building, mindset shifts, productivity tips, life lessons

ENGAGEMENT STRATEGIES:
- For threads: Make an initial tweet, then reply with the ID from the response
- For engagement: Reply to mentions with additional insights
- For discovery: Search for trending topics
- Use emojis sparingly and only when they add value

REMEMBER: ONE ACTION PER STEP ONLY. Do not attempt multiple actions in a single step.`;
}

// Run agent with improved retry and scheduling
async function runAgentWithSchedule(retryCount = 0): Promise<void> {
  try {
    console.log("=== Starting scheduler cycle ===");
    
    // Log rate limit status
    const rateLimitStatus = rateLimitHandler.getStatus();
    console.log("📊 Rate limit status:", rateLimitStatus);
    
    // Reset tracking
    functionCalledThisCycle = false;
    
    // Determine next action
    const nextAction = getNextAction();
    
    // Handle SKIP action
    if (nextAction === ACTIONS.SKIP) {
      console.log("⏭️ Skipping this cycle due to rate limits. Scheduling next cycle.");
      setTimeout(() => runAgentWithSchedule(0), OTHER_ACTION_INTERVAL);
      return;
    }
    
    // Check if we should skip this cycle due to rate limits (double check)
    if (isReadAction(nextAction) && !rateLimitHandler.canMakeReadRequest()) {
      console.log(`⚠️ Double-check: Skipping ${nextAction} due to rate limits. Scheduling next cycle.`);
      setTimeout(() => runAgentWithSchedule(0), OTHER_ACTION_INTERVAL);
      return;
    }
    
    // Update agent description to focus on the chosen action
    updateAgentForAction(nextAction);
    
    // Run the appropriate action
    console.log(`Running agent step at ${new Date().toISOString()} - Action: ${nextAction}`);
    
    let success = false;
    
    try {
      switch (nextAction) {
        case ACTIONS.POST:
          // For posts, add special error handling to detect image URL issues
          console.log("Executing POST action (with image)...");
          const result = await wisdom_agent.step({ verbose: true });
          
          // Check if response contains any indication of image URL issues
          if (result && typeof result === 'string' && 
             (result.includes("invalid image URL") || 
              result.includes("Image URL") || 
              result.includes("URL format") ||
              result.includes("403 Forbidden") ||
              result.includes("ENOTFOUND"))) {
            
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
            console.log("✅ Image post successful!");
          }
          break;
        
        case ACTIONS.POST_NO_IMAGE:
          // Posting without an image
          console.log("Executing POST_NO_IMAGE action (text only)...");
          await wisdom_agent.step({ verbose: true });
          imageRetryCount = 0; // Reset counter after successful post
          success = true;
          console.log("✅ Text-only post successful!");
          break;
          
        case ACTIONS.REPLY_TARGETS:
          // Handle reply to target accounts through our custom reply manager
          console.log("Executing REPLY_TARGETS action through reply manager...");
          
          // Increment read attempts before making the request
          rateLimitHandler.incrementReadAttempts();
          
          try {
            await replyManager.startMonitoring('random', 15);
            success = true;
          } catch (error: any) {
            // Handle Twitter API errors
            rateLimitHandler.handleTwitterError(error);
            throw error;
          }
          break;
          
        default:
          // Handle all other actions
          console.log(`Executing ${nextAction} action...`);
          
          // Increment read attempts for read actions
          if (isReadAction(nextAction)) {
            rateLimitHandler.incrementReadAttempts();
          }
          
          try {
            await wisdom_agent.step({ verbose: true });
            success = true;
          } catch (error: any) {
            // Handle Twitter API errors for read actions
            if (isReadAction(nextAction)) {
              rateLimitHandler.handleTwitterError(error);
            }
            throw error;
          }
      }
    } catch (error: unknown) {
      const actionError = error as Error;
      console.error(`Action error (${nextAction}):`, actionError.message);
      
      // Special handling for image URL errors
      if (nextAction === ACTIONS.POST && 
          typeof actionError.message === 'string' && 
          (actionError.message.includes("Image URL") || 
           actionError.message.includes("URL format") ||
           actionError.message.includes("ENOTFOUND") ||
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
    
    // If this was a successful post, update last post time and stats
    if ((nextAction === ACTIONS.POST || nextAction === ACTIONS.POST_NO_IMAGE) && success) {
      lastPostTime = Date.now();
      totalPosts++;
      
      if (nextAction === ACTIONS.POST) {
        imagePosts++;
        console.log(`📊 Image post recorded. Total: ${imagePosts} image posts`);
      } else if (nextAction === ACTIONS.POST_NO_IMAGE) {
        textPosts++;
        console.log(`📊 Text post recorded. Total: ${textPosts} text posts`);
      }
      
      const imagePostPercentage = (imagePosts / totalPosts) * 100;
      console.log(`📈 Post Stats - Target: ${IMAGE_POST_PROBABILITY * 100}% images, Actual: ${imagePostPercentage.toFixed(1)}%`);
      console.log(`📊 Total: ${totalPosts} posts (${imagePosts} with images, ${textPosts} text-only)`);
    }
    
    // Schedule next action
    console.log(`Scheduling next action in ${OTHER_ACTION_INTERVAL/1000} seconds`);
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

// Create a simple HTTP server to keep the process alive
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  
  const rateLimitStatus = rateLimitHandler.getStatus();
  const imagePostPercentage = totalPosts > 0 ? (imagePosts / totalPosts) * 100 : 0;
  
  res.end(`Wisdom Bot is running
  
Rate Limit Status:
- Monthly Cap Exceeded: ${rateLimitStatus.monthlyCapExceeded}
- Days Until Reset: ${rateLimitStatus.daysUntilReset}
- Daily Read Attempts: ${rateLimitStatus.dailyAttempts}/${rateLimitStatus.maxDailyAttempts}
- Reset Time: ${rateLimitStatus.resetTime ? new Date(rateLimitStatus.resetTime * 1000).toISOString() : 'N/A'}

Bot Stats:
- Total Posts: ${totalPosts}
- Image Posts: ${imagePosts} (${imagePostPercentage.toFixed(1)}%)
- Text Posts: ${textPosts} (${(100 - imagePostPercentage).toFixed(1)}%)
- Target Image %: ${IMAGE_POST_PROBABILITY * 100}%
- Actual Image %: ${imagePostPercentage.toFixed(1)}%
`);
});

// Set up process error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Don't exit, let the bot continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, let the bot continue
});

// Heartbeat to show the process is still alive
setInterval(() => {
  const rateLimitStatus = rateLimitHandler.getStatus();
  const imagePostPercentage = totalPosts > 0 ? (imagePosts / totalPosts) * 100 : 0;
  console.log('Heartbeat check:', new Date().toISOString());
  console.log(`📊 Image percentage: ${imagePostPercentage.toFixed(1)}% (target: ${IMAGE_POST_PROBABILITY * 100}%)`);
  console.log('Rate limit status:', rateLimitStatus);
}, 60000);

async function main(): Promise<void> {
  try {
    console.log("=======================================");
    console.log("Initializing Wisdom Twitter Bot...");
    console.log("=======================================");
    
    // Log environment details
    console.log("Environment check:");
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("API_KEY present:", !!process.env.API_KEY);
    console.log("TWITTER_API_KEY present:", !!process.env.TWITTER_API_KEY);
    console.log("TOGETHER_API_KEY present:", !!process.env.TOGETHER_API_KEY);
    console.log(`🎯 IMAGE_POST_PROBABILITY: ${IMAGE_POST_PROBABILITY * 100}% (target for posts with images)`);
    console.log(`📝 TEXT_POST_PROBABILITY: ${(1 - IMAGE_POST_PROBABILITY) * 100}% (target for text-only posts)`);
    
    // Set conservative daily read limits to prevent hitting monthly cap again
    rateLimitHandler.setMaxDailyReadAttempts(20); // Very conservative
    
    // Sanitize description
    const sanitizedDescription = wisdom_agent.description.replace(/[\uD800-\uDFFF](?![\uD800-\uDFFF])|(?:[^\uD800-\uDFFF]|^)[\uDC00-\uDFFF]/g, '');
    wisdom_agent.description = sanitizedDescription;
    
    try {
      // Initialize the agent
      console.log("Initializing agent...");
      await wisdom_agent.init();
      console.log("Agent initialization successful!");
      
      // Initialize reply manager
      console.log("Initializing reply manager...");
      await replyManager.initialize();
      console.log("Reply manager initialization successful!");
      
      // Log available functions
      console.log("Available functions:", wisdom_agent.workers.flatMap((w: any) =>
        w.functions.map((f: any) => f.name)
      ).join(", "));
    } catch (initError) {
      console.error("Failed to initialize agent:", initError);
      throw initError;
    }
    
    // Start the HTTP server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`HTTP server listening on port ${PORT}`);
    });

    console.log("Starting agent scheduler...");
    
    // Force an immediate first post to test that everything works
    console.log("Forcing immediate first post...");
    
    // Randomly decide whether to force a post with image or without based on our 35% probability
    const forceWithImage = Math.random() <= IMAGE_POST_PROBABILITY;
    const initialAction = forceWithImage ? ACTIONS.POST : ACTIONS.POST_NO_IMAGE;
    
    console.log(`🚀 Forcing initial ${initialAction} action (${forceWithImage ? 'with' : 'without'} image)...`);
    updateAgentForAction(initialAction);
    wisdom_agent.step({ verbose: true })
      .then(() => {
        console.log("✅ Force post successful");
        // Update stats for the forced post
        lastPostTime = Date.now();
        totalPosts++;
        if (initialAction === ACTIONS.POST) {
          imagePosts++;
        } else {
          textPosts++;
        }
      })
      .catch(err => console.error("❌ Force post failed:", err));
      
    // Start scheduling after a delay
    setTimeout(() => {
      console.log("Starting regular scheduler");
      runAgentWithSchedule();
    }, 60000);
    
    console.log("Bot initialization complete!");
    
  } catch (error) {
    console.error("ERROR in main function:", error);
    
    console.log("Will attempt restart in 60 seconds despite error");
    setTimeout(() => {
      console.log("Attempting to restart agent scheduler...");
      runAgentWithSchedule();
    }, 60000);
  }
}

// Run the main function
console.log("Starting bot process", new Date().toISOString());
main().catch(err => {
  console.error("Fatal error in main promise chain:", err);
});