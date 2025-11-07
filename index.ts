import { wisdom_agent } from './agent';
import * as http from 'http';
import { replyManager } from './plugins/replyGuyPlugin/replyManager';

enum ACTIONS {
  POST = 'post',
  POST_NO_IMAGE = 'post_no_image',
  REPLY = 'reply',
  REPLY_TARGETS = 'reply_targets',
  SEARCH = 'search',
  LIKE = 'like',
  QUOTE = 'quote',
  SKIP = 'skip'
}

const IMAGE_POST_PROBABILITY = 0.35;

let lastPostTime = 0;
let lastReplyTime = 0;
let dailyReplies = 0;
const REPLIES_PER_DAY_TARGET = 50;
let functionCalledThisCycle = false;
let imageRetryCount = 0;
const MAX_IMAGE_RETRIES = 2;

let totalPosts = 0;
let imagePosts = 0;
let textPosts = 0;

let monthlyCapExceeded = false;
let monthlyCapResetTime = 0;
let dailyReadAttempts = 0;
let lastResetDate = '';
const maxDailyReadAttempts = 20;

const POST_INTERVAL = 96 * 60 * 1000; // ~5 posts per day (every 4.8 hours)
const REPLY_INTERVAL = 29 * 60 * 1000; // ~50 replies per day (every 29 minutes)
const OTHER_ACTION_INTERVAL = 60 * 60 * 1000; // 1 hour for other actions

let currentActionIndex = 0;
const READ_ACTIONS = [ACTIONS.SEARCH, ACTIONS.LIKE, ACTIONS.QUOTE];
const WRITE_ACTIONS = [ACTIONS.POST, ACTIONS.POST_NO_IMAGE];

function resetDailyCounterIfNeeded(): void {
  const today = new Date().toISOString().split('T')[0];
  if (lastResetDate !== today) {
    dailyReadAttempts = 0;
    dailyReplies = 0;
    lastResetDate = today;
    console.log(`📊 Daily counters reset. Date: ${today}`);
  }
}

function handleTwitterError(error: any): void {
  if (error.code === 429 && error.data) {
    const { title, detail, type } = error.data;
    
    if (title === 'UsageCapExceeded' && 
        detail?.includes('Monthly product cap') && 
        type === 'https://api.twitter.com/2/problems/usage-capped') {
      
      monthlyCapExceeded = true;
      monthlyCapResetTime = error.rateLimit?.reset || 0;
      
      const resetDate = new Date(monthlyCapResetTime * 1000);
      console.log(`🚫 MONTHLY CAP EXCEEDED! No more read operations until: ${resetDate.toISOString()}`);
    }
    
    // Handle daily tweet limit
    if (error.headers?.['x-user-limit-24hour-remaining'] === '0') {
      const resetTime = parseInt(error.headers['x-user-limit-24hour-reset']);
      const resetDate = new Date(resetTime * 1000);
      console.log(`🚫 DAILY TWEET LIMIT (25/day) EXCEEDED! Can post again at: ${resetDate.toISOString()}`);
      monthlyCapExceeded = true;
      monthlyCapResetTime = resetTime;
    }
  }
}

function canMakeReadRequest(): boolean {
  resetDailyCounterIfNeeded();
  
  if (monthlyCapExceeded) {
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < monthlyCapResetTime) {
      console.log(`🚫 Monthly cap exceeded. Cannot make read requests.`);
      return false;
    } else {
      monthlyCapExceeded = false;
      monthlyCapResetTime = 0;
      console.log(`✅ Monthly cap reset! Read operations are now allowed.`);
    }
  }
  
  if (dailyReadAttempts >= maxDailyReadAttempts) {
    console.log(`⚠️ Daily read limit reached (${maxDailyReadAttempts}). Skipping to preserve monthly quota.`);
    return false;
  }
  
  return true;
}

function incrementReadAttempts(): void {
  dailyReadAttempts++;
  console.log(`📊 Daily read attempts: ${dailyReadAttempts}/${maxDailyReadAttempts}`);
}

function incrementReplyCount(): void {
  dailyReplies++;
  console.log(`📨 Replies today: ${dailyReplies}/${REPLIES_PER_DAY_TARGET}`);
}

function isReadAction(action: ACTIONS): boolean {
  return READ_ACTIONS.includes(action);
}

function getNextAction(): ACTIONS {
  const now = Date.now();
  const timeSinceLastPost = now - lastPostTime;
  const timeSinceLastReply = now - lastReplyTime;
  
  console.log("Time since last post:", Math.round(timeSinceLastPost/1000), "seconds");
  console.log("Time since last reply:", Math.round(timeSinceLastReply/1000), "seconds");
  
  // Priority 1: Post if it's time (POSTS DON'T NEED READS - always allowed)
  if (timeSinceLastPost >= POST_INTERVAL) {
    console.log("Time for a new post!");
    
    const randomValue = Math.random();
    console.log(`Random value: ${randomValue.toFixed(3)}, Image threshold: ${IMAGE_POST_PROBABILITY}`);
    
    if (randomValue <= IMAGE_POST_PROBABILITY) {
      if (imageRetryCount < MAX_IMAGE_RETRIES) {
        console.log(`✅ Selected POST WITH image (${(randomValue * 100).toFixed(1)}% <= ${IMAGE_POST_PROBABILITY * 100}%)`);
        return ACTIONS.POST;
      } else {
        console.log(`⚠️ Max retries reached. Forcing text-only.`);
        imageRetryCount = 0;
        return ACTIONS.POST_NO_IMAGE;
      }
    } else {
      console.log(`✅ Selected POST WITHOUT image (${(randomValue * 100).toFixed(1)}% > ${IMAGE_POST_PROBABILITY * 100}%)`);
      return ACTIONS.POST_NO_IMAGE;
    }
  }
  
  // Priority 2: Reply if time + under daily goal + rate limit allows
  if (timeSinceLastReply >= REPLY_INTERVAL && dailyReplies < REPLIES_PER_DAY_TARGET && canMakeReadRequest()) {
    console.log(`📨 Time for reply (${dailyReplies}/${REPLIES_PER_DAY_TARGET} today)`);
    return ACTIONS.REPLY_TARGETS;
  }
  
  // Priority 3: Other read actions (if rate limit allows)
  if (!canMakeReadRequest()) {
    console.log("⚠️ No read actions available due to rate limits. Waiting for next post or reply time.");
    return ACTIONS.SKIP;
  }
  
  // Occasionally do other read actions (search/like/quote)
  const action = READ_ACTIONS[currentActionIndex];
  currentActionIndex = (currentActionIndex + 1) % READ_ACTIONS.length;
  return action;
}

function updateAgentForAction(action: ACTIONS, needsImageRegeneration = false): void {
  if (action === ACTIONS.SKIP) return;
  
  if (action === ACTIONS.POST_NO_IMAGE) {
    wisdom_agent.description = `Execute this function now:

post_tweet("Focus on progress, not perfection.")

NO planning. NO thinking. Just call post_tweet() with wisdom content.`;
    return;
  }
  
if (action === ACTIONS.POST) {
    wisdom_agent.description = `Execute 3 functions in order:

1. generate_image("elegant classical architecture watercolor painting, soft brushstrokes, muted earth tones, beige and brown palette, atmospheric perspective, dreamy quality, professional architectural illustration", 768, 768)
2. get_latest_image_url()
3. upload_image_and_tweet("your wisdom", "url_from_step_2")

Execute NOW.`;
    return;
  }

  if (action === ACTIONS.REPLY_TARGETS) {
    wisdom_agent.description = `Execute 2 functions:

1. find_target_account()
2. reply_tweet(tweet_id, "supportive reply")

Execute NOW.`;
    return;
  }
  
  // For other actions
  const simpleActions: Record<string, string> = {
    [ACTIONS.SEARCH]: 'Call search_tweets("wisdom") NOW.',
    [ACTIONS.LIKE]: 'Call like_tweet(tweet_id) NOW.',
    [ACTIONS.QUOTE]: 'Call quote_tweet(tweet_id, "insight") NOW.'
  };
  
  wisdom_agent.description = simpleActions[action] || 'Execute your action.';
}

async function runAgentWithSchedule(retryCount = 0): Promise<void> {
  try {
    console.log("=== Starting scheduler cycle ===");
    
    console.log("📊 Rate limit status:", {
      monthlyCapExceeded,
      dailyAttempts: dailyReadAttempts,
      maxDailyAttempts: maxDailyReadAttempts,
      dailyReplies: dailyReplies
    });
    
    functionCalledThisCycle = false;
    
    const nextAction = getNextAction();
    
    if (nextAction === ACTIONS.SKIP) {
      console.log("⏭️ Skipping this cycle due to rate limits. Scheduling next cycle.");
      const checkInterval = Math.min(POST_INTERVAL, REPLY_INTERVAL, OTHER_ACTION_INTERVAL) / 2;
      setTimeout(() => runAgentWithSchedule(0), checkInterval);
      return;
    }
    
    if (isReadAction(nextAction) && !canMakeReadRequest()) {
      console.log(`⚠️ Double-check: Skipping ${nextAction} due to rate limits.`);
      const checkInterval = Math.min(POST_INTERVAL, REPLY_INTERVAL, OTHER_ACTION_INTERVAL) / 2;
      setTimeout(() => runAgentWithSchedule(0), checkInterval);
      return;
    }
    
    updateAgentForAction(nextAction);
    
    console.log(`Running agent step at ${new Date().toISOString()} - Action: ${nextAction}`);
    
    let success = false;
    
    try {
      switch (nextAction) {
        case ACTIONS.POST:
          console.log("Executing POST action (with image)...");
          let result;
          try {
            result = await wisdom_agent.step({ verbose: true });
          } catch (stepError: any) {
            // Handle Virtuals API rate limit
            if (stepError.status === 429 || stepError.response?.status === 429) {
              const retryAfter = stepError.response?.headers?.['retry-after'] || 60;
              console.log(`⚠️ Virtuals API rate limit hit. Retry after ${retryAfter}s`);
              setTimeout(() => runAgentWithSchedule(0), retryAfter * 1000);
              return;
            }
            throw stepError;
          }
          
          if (result && typeof result === 'string' && 
             (result.includes("invalid image URL") || 
              result.includes("Image URL") || 
              result.includes("URL format") ||
              result.includes("403 Forbidden") ||
              result.includes("ENOTFOUND"))) {
            
            imageRetryCount++;
            
            if (imageRetryCount < MAX_IMAGE_RETRIES) {
              console.log(`⚠️ Image URL validation failed. Retry ${imageRetryCount}/${MAX_IMAGE_RETRIES}`);
              throw new Error("Image URL validation failed - regenerating image required");
            } else {
              console.log(`⚠️ Max image retries reached (${MAX_IMAGE_RETRIES}). Will post without image next cycle.`);
              success = false;
            }
          } else {
            imageRetryCount = 0;
            success = true;
            console.log("✅ Image post successful!");
          }
          break;
        
        case ACTIONS.POST_NO_IMAGE:
          console.log("Executing POST_NO_IMAGE action (text only)...");
          await wisdom_agent.step({ verbose: true });
          imageRetryCount = 0;
          success = true;
          console.log("✅ Text-only post successful!");
          break;
          
        case ACTIONS.REPLY_TARGETS:
          console.log("Executing REPLY_TARGETS action through reply manager...");
          
          incrementReadAttempts();
          
          try {
            await replyManager.startMonitoring('random', 0);
            incrementReplyCount();
            lastReplyTime = Date.now();
            success = true;
          } catch (error: any) {
            handleTwitterError(error);
            console.log(`⚠️ Reply failed, not counting toward daily total`);
            success = false;
          }
          break;
          
        default:
          console.log(`Executing ${nextAction} action...`);
          
          if (isReadAction(nextAction)) {
            incrementReadAttempts();
          }
          
          try {
            await wisdom_agent.step({ verbose: true });
            success = true;
          } catch (error: any) {
            if (isReadAction(nextAction)) {
              handleTwitterError(error);
            }
            console.log(`⚠️ Action ${nextAction} failed:`, error.message);
            success = false;
          }
      }
    } catch (error: unknown) {
      const actionError = error as Error;
      console.error(`Action error (${nextAction}):`, actionError.message);
      
      if (nextAction === ACTIONS.POST && 
          typeof actionError.message === 'string' && 
          (actionError.message.includes("Image URL") || 
           actionError.message.includes("URL format") ||
           actionError.message.includes("ENOTFOUND") ||
           actionError.message.includes("403 Forbidden"))) {
        
        if (imageRetryCount < MAX_IMAGE_RETRIES) {
          updateAgentForAction(nextAction, true);
          console.log(`🔄 Retrying post with image regeneration hint (${imageRetryCount}/${MAX_IMAGE_RETRIES})...`);
          await wisdom_agent.step({ verbose: true });
          success = true;
        } else {
          success = false;
        }
      } else {
        throw actionError;
      }
    }
    
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
    
    const checkInterval = Math.min(POST_INTERVAL, REPLY_INTERVAL, OTHER_ACTION_INTERVAL) / 2;
    
    console.log(`Scheduling next cycle check in ${Math.round(checkInterval/1000)} seconds`);
    setTimeout(() => runAgentWithSchedule(0), checkInterval);
    
  } catch (error) {
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

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  
  const imagePostPercentage = totalPosts > 0 ? (imagePosts / totalPosts) * 100 : 0;
  
  res.end(`Wisdom Bot is running
  
Rate Limit Status:
- Monthly Cap Exceeded: ${monthlyCapExceeded}
- Daily Read Attempts: ${dailyReadAttempts}/${maxDailyReadAttempts}
- Reset Time: ${monthlyCapResetTime ? new Date(monthlyCapResetTime * 1000).toISOString() : 'N/A'}

Bot Stats:
- Total Posts: ${totalPosts} (target: 5/day)
- Image Posts: ${imagePosts} (${imagePostPercentage.toFixed(1)}%)
- Text Posts: ${textPosts} (${(100 - imagePostPercentage).toFixed(1)}%)
- Target Image %: ${IMAGE_POST_PROBABILITY * 100}%
- Replies Today: ${dailyReplies}/${REPLIES_PER_DAY_TARGET}
`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

setInterval(() => {
  const imagePostPercentage = totalPosts > 0 ? (imagePosts / totalPosts) * 100 : 0;
  console.log('Heartbeat check:', new Date().toISOString());
  console.log(`📊 Stats: ${totalPosts} posts (target: 5/day), ${dailyReplies}/${REPLIES_PER_DAY_TARGET} replies`);
  console.log(`📊 Image percentage: ${imagePostPercentage.toFixed(1)}% (target: ${IMAGE_POST_PROBABILITY * 100}%)`);
}, 60000);

async function main(): Promise<void> {
  try {
    console.log("=======================================");
    console.log("Initializing Wisdom Twitter Bot...");
    console.log("=======================================");
    
    console.log("Environment check:");
    console.log("API_KEY present:", !!process.env.API_KEY);
    console.log("TWITTER_API_KEY present:", !!process.env.TWITTER_API_KEY);
    console.log("TOGETHER_API_KEY present:", !!process.env.TOGETHER_API_KEY);
    console.log(`🎯 Posts: 5/day (every ${POST_INTERVAL/60000} minutes)`);
    console.log(`📨 Replies: ~50/day (every ${REPLY_INTERVAL/60000} minutes)`);
    console.log(`🎯 IMAGE_POST_PROBABILITY: ${IMAGE_POST_PROBABILITY * 100}%`);
    
    const sanitizedDescription = wisdom_agent.description.replace(/[\uD800-\uDFFF](?![\uD800-\uDFFF])|(?:[^\uD800-\uDFFF]|^)[\uDC00-\uDFFF]/g, '');
    wisdom_agent.description = sanitizedDescription;
    
    try {
      console.log("Initializing agent...");
      await wisdom_agent.init();
      console.log("Agent initialization successful!");
      
      // DEBUG: Show available functions
      console.log("\n=== TWITTER PLUGIN FUNCTIONS ===");
      const twitterWorker = wisdom_agent.workers.find(w => w.id === "wisdom_twitter_worker");
      if (twitterWorker) {
        console.log("Functions:", JSON.stringify(twitterWorker.functions.map(f => ({
          name: f.name,
          description: f.description,
          args: f.args
        })), null, 2));
      } else {
        console.log("❌ Twitter worker not found!");
      }
      console.log("================================\n");
      
      console.log("Initializing reply manager...");
      await replyManager.initialize();
      console.log("Reply manager initialization successful!");
      
      console.log("Available functions:", wisdom_agent.workers.flatMap((w: any) =>
        w.functions.map((f: any) => f.name)
      ).join(", "));
    } catch (initError) {
      console.error("Failed to initialize agent:", initError);
      throw initError;
    }
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`HTTP server listening on port ${PORT}`);
    });

    console.log("Starting agent scheduler...");
    
    console.log("Forcing immediate first post...");
    
    const forceWithImage = Math.random() <= IMAGE_POST_PROBABILITY;
    const initialAction = forceWithImage ? ACTIONS.POST : ACTIONS.POST_NO_IMAGE;
    
    console.log(`🚀 Forcing initial ${initialAction} action (${forceWithImage ? 'with' : 'without'} image)...`);
    updateAgentForAction(initialAction);
    try {
      await wisdom_agent.step({ verbose: true });
      console.log("✅ Force post successful");
      lastPostTime = Date.now();
      totalPosts++;
      if (initialAction === ACTIONS.POST) {
        imagePosts++;
      } else {
        textPosts++;
      }
    } catch (err) {
      console.error("❌ Force post failed:", err);
    }
      
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

console.log("Starting bot process", new Date().toISOString());
main().catch(err => {
  console.error("Fatal error in main promise chain:", err);
});