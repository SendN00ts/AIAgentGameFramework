import { wisdom_agent } from './agent';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
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

const IMAGE_POST_PROBABILITY = 0.2;
const POSTS_PER_CYCLE = 5;
const IMAGES_PER_CYCLE = 1;

let postsInCurrentCycle = 0;
let imagesInCurrentCycle = 0;
let lastPostTime = 0;
let lastReplyTime = 0;
let dailyReplies = 0;
let totalPosts = 0;
let imagePosts = 0;
let textPosts = 0;

const REPLIES_PER_DAY_TARGET = 90;
let functionCalledThisCycle = false;
let imageRetryCount = 0;
const MAX_IMAGE_RETRIES = 2;

let monthlyCapExceeded = false;
let monthlyCapResetTime = 0;
let dailyReadAttempts = 0;
let lastResetDate = '';
const maxDailyReadAttempts = 300;

const POST_INTERVAL = 288 * 60 * 1000;
const REPLY_INTERVAL = 16 * 60 * 1000;
const OTHER_ACTION_INTERVAL = 60 * 60 * 1000;

let currentActionIndex = 0;
const READ_ACTIONS = [ACTIONS.SEARCH, ACTIONS.LIKE, ACTIONS.QUOTE];
const WRITE_ACTIONS = [ACTIONS.POST, ACTIONS.POST_NO_IMAGE];

// Persistent storage
const STATE_FILE = '/app/data/bot_state.json';

function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      postsInCurrentCycle,
      imagesInCurrentCycle,
      totalPosts,
      imagePosts,
      textPosts,
      lastPostTime,
      lastReplyTime,
      dailyReplies,
      lastResetDate
    }, null, 2));
    
    console.log('💾 State saved to persistent storage');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      postsInCurrentCycle = state.postsInCurrentCycle || 0;
      imagesInCurrentCycle = state.imagesInCurrentCycle || 0;
      totalPosts = state.totalPosts || 0;
      imagePosts = state.imagePosts || 0;
      textPosts = state.textPosts || 0;
      lastPostTime = state.lastPostTime || 0;
      lastReplyTime = state.lastReplyTime || 0;
      dailyReplies = state.dailyReplies || 0;
      lastResetDate = state.lastResetDate || '';
      
      console.log('✅ State loaded from persistent storage:', {
        totalPosts,
        imagePosts,
        textPosts,
        postsInCycle: postsInCurrentCycle,
        imagesInCycle: imagesInCurrentCycle,
        dailyReplies
      });
    } else {
      console.log('No previous state found, starting fresh');
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

const IMAGE_STYLE_GUIDELINES = `
STYLE: Soft watercolor, muted earth tones, atmospheric natural lighting

CREATE A UNIQUE SCENE - choose your own subject using these principles:

COMPOSITION OPTIONS (pick one):
- Interior architectural space with light and nature visible
- Single meaningful object in contemplative setting
- Small arrangement of items with symbolic meaning

REQUIREMENTS:
- Soft watercolor technique with gentle edges
- Natural light source (sunlight, window light, soft glow)
- Muted palette: earth tones, subtle blues/greens
- Contemplative, peaceful mood
- Touch of nature or life (sky, plants, or organic elements)

AVOID:
- Exterior building facades
- Modern/industrial settings
- Busy or cluttered compositions
- Bright artificial colors
- Literal repetition of past images

Be inventive. Every image must be distinctly different.
`;

const WISDOM_TOPICS = [
  "Philosopher quotes",
  "starting new habits and overcoming procrastination",
  "dealing with failure and building resilience",
  "time management and prioritization",
  "maintaining focus in distractions",
  "setting boundaries and saying no",
  "consistency vs perfection mindset",
  "learning from mistakes and iteration",
  "building discipline when motivation fades",
  "breaking big goals into small steps",
  "managing energy not just time"
];

let currentTopicIndex = 0;

function getNextWisdomTopic(): string {
  const topic = WISDOM_TOPICS[currentTopicIndex];
  currentTopicIndex = (currentTopicIndex + 1) % WISDOM_TOPICS.length;
  return topic;
}

function resetDailyCounterIfNeeded(): void {
  const today = new Date().toISOString().split('T')[0];
  if (lastResetDate !== today) {
    dailyReadAttempts = 0;
    dailyReplies = 0;
    lastResetDate = today;
    console.log(`📊 Daily counters reset. Date: ${today}`);
    saveState();
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
    
    if (error.headers?.['x-user-limit-24hour-remaining'] === '0') {
      const resetTime = parseInt(error.headers['x-user-limit-24hour-reset']);
      const resetDate = new Date(resetTime * 1000);
      console.log(`🚫 DAILY TWEET LIMIT (100/day) EXCEEDED! Can post again at: ${resetDate.toISOString()}`);
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
  saveState();
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
  
  if (timeSinceLastPost >= POST_INTERVAL) {
    console.log("Time for a new post!");
    console.log(`Cycle status: ${postsInCurrentCycle}/${POSTS_PER_CYCLE}, images: ${imagesInCurrentCycle}/${IMAGES_PER_CYCLE}`);
    
    if (postsInCurrentCycle >= POSTS_PER_CYCLE) {
      postsInCurrentCycle = 0;
      imagesInCurrentCycle = 0;
      console.log("📊 New cycle started");
      saveState();
    }
    
    let useImage = false;
    if (imagesInCurrentCycle < IMAGES_PER_CYCLE) {
      const postsRemaining = POSTS_PER_CYCLE - postsInCurrentCycle;
      const imagesRemaining = IMAGES_PER_CYCLE - imagesInCurrentCycle;
      const chanceOfImage = imagesRemaining / postsRemaining;
      
      useImage = Math.random() <= chanceOfImage;
    }
    
    postsInCurrentCycle++;
    
    if (useImage && imageRetryCount < MAX_IMAGE_RETRIES) {
      imagesInCurrentCycle++;
      console.log(`✅ POST WITH image (${imagesInCurrentCycle}/${IMAGES_PER_CYCLE} in cycle)`);
      return ACTIONS.POST;
    } else {
      console.log(`✅ POST WITHOUT image (${postsInCurrentCycle - imagesInCurrentCycle}/${POSTS_PER_CYCLE - IMAGES_PER_CYCLE} text posts in cycle)`);
      return ACTIONS.POST_NO_IMAGE;
    }
  }
  
  if (timeSinceLastReply >= REPLY_INTERVAL && dailyReplies < REPLIES_PER_DAY_TARGET && canMakeReadRequest()) {
    console.log(`📨 Time for reply (${dailyReplies}/${REPLIES_PER_DAY_TARGET} today)`);
    return ACTIONS.REPLY_TARGETS;
  }
  
  if (!canMakeReadRequest()) {
    console.log("⚠️ No read actions available due to rate limits. Waiting for next post or reply time.");
    return ACTIONS.SKIP;
  }
  
  const action = READ_ACTIONS[currentActionIndex];
  currentActionIndex = (currentActionIndex + 1) % READ_ACTIONS.length;
  return action;
}

function updateAgentForAction(action: ACTIONS, needsImageRegeneration = false): void {
  if (action === ACTIONS.SKIP) return;
  
  if (action === ACTIONS.POST_NO_IMAGE) {
    const topic = getNextWisdomTopic();
    const timestamp = Date.now();
    wisdom_agent.description = `EXECUTE NOW: Call post_tweet() with wisdom about: "${topic}"

CRITICAL: Generate completely ORIGINAL content - timestamp ${timestamp}

Requirements:
- Must be about: ${topic}
- Must be DIFFERENT from ALL previous tweets
- 1-2 sentences, direct and practical
- NO hashtags
- Timestamp: ${timestamp}

FORBIDDEN phrases (do NOT use):
- "Focus on progress, not perfection"
- "Small daily improvements"
- "The best time to start"
- "Your thoughts create your reality"
- "Stop waiting for motivation"
- "Discipline is the bridge"

Create NEW unique wisdom NOW: post_tweet("your original wisdom here")`;
    return;
  }
  
 if (action === ACTIONS.POST) {
    const topic = getNextWisdomTopic();
    const timestamp = Date.now();
    wisdom_agent.description = `EXECUTE 3 STEPS NOW:

STEP 1: generate_image("watercolor [subject]", 768, 768)
STEP 2: get_latest_image_url()
STEP 3: upload_image_and_tweet("wisdom about ${topic}", "url")

DO IT NOW. Topic: ${topic}. Timestamp: ${timestamp}`;
    return;
  }
  
  const simpleActions: Record<string, string> = {
    [ACTIONS.SEARCH]: 'EXECUTE NOW: search_tweets("wisdom")',
    [ACTIONS.LIKE]: 'EXECUTE NOW: like_tweet(tweet_id)',
    [ACTIONS.QUOTE]: 'EXECUTE NOW: quote_tweet(tweet_id, "insight")'
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
      
      saveState();
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
  // Reset endpoint
  if (req.url === '/reset') {
    postsInCurrentCycle = 0;
    imagesInCurrentCycle = 0;
    dailyReplies = 0;
    saveState();
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Reset complete');
    return;
  }
  
  // Force post with image
  if (req.url === '/post-image') {
    updateAgentForAction(ACTIONS.POST);
    wisdom_agent.step({ verbose: true }).then(() => {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Image post triggered');
    }).catch(err => {
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end('Error: ' + err.message);
    });
    return;
  }
  
  // Force text post
 if (req.url === '/post-text') {
  const topic = getNextWisdomTopic();
  const timestamp = Date.now();
  updateAgentForAction(ACTIONS.POST_NO_IMAGE);
  // Force immediate execution
  wisdom_agent.step({ verbose: true }).then(() => {
    lastPostTime = Date.now();
    totalPosts++;
    textPosts++;
    postsInCurrentCycle++;
    saveState();
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Text post triggered');
  }).catch(err => {
    console.error('Post error:', err);
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('Error: ' + err.message);
  });
  return;
}
  
  // Force reply
if (req.url === '/reply') {
  Promise.resolve(replyManager.startMonitoring('random', 0)).then(() => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Reply triggered');
  }).catch(err => {
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('Error: ' + err.message);
  });
  return;
}

  if (req.url === '/like') {
  updateAgentForAction(ACTIONS.LIKE);
  wisdom_agent.step({ verbose: true }).then(() => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Like triggered');
  }).catch(err => {
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('Error: ' + err.message);
  });
  return;
}
  
  // Default status page
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
- Posts in Cycle: ${postsInCurrentCycle}/${POSTS_PER_CYCLE}
- Images in Cycle: ${imagesInCurrentCycle}/${IMAGES_PER_CYCLE}
`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  saveState();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  saveState();
});

setInterval(() => {
  const imagePostPercentage = totalPosts > 0 ? (imagePosts / totalPosts) * 100 : 0;
  console.log('Heartbeat check:', new Date().toISOString());
  console.log(`📊 Stats: ${totalPosts} posts (target: 5/day), ${dailyReplies}/${REPLIES_PER_DAY_TARGET} replies`);
  console.log(`📊 Image percentage: ${imagePostPercentage.toFixed(1)}% (target: ${IMAGE_POST_PROBABILITY * 100}%)`);
  console.log(`📊 Cycle: ${postsInCurrentCycle}/${POSTS_PER_CYCLE} posts, ${imagesInCurrentCycle}/${IMAGES_PER_CYCLE} images`);
}, 60000);

async function main(): Promise<void> {
  try {
    console.log("=======================================");
    console.log("Initializing Wisdom Twitter Bot...");
    console.log("=======================================");
    
    loadState();
    
    console.log("Environment check:");
    console.log("API_KEY present:", !!process.env.API_KEY);
    console.log("TWITTER_API_KEY present:", !!process.env.TWITTER_API_KEY);
    console.log("TOGETHER_API_KEY present:", !!process.env.TOGETHER_API_KEY);
    console.log(`🎯 Posts: 5/day (every ${POST_INTERVAL/60000} minutes)`);
    console.log(`📨 Replies: ${REPLIES_PER_DAY_TARGET}/day (every ${REPLY_INTERVAL/60000} minutes)`);
    console.log(`🎯 IMAGE_POST_PROBABILITY: ${IMAGE_POST_PROBABILITY * 100}%`);
    
    const sanitizedDescription = wisdom_agent.description.replace(/[\uD800-\uDFFF](?![\uD800-\uDFFF])|(?:[^\uD800-\uDFFF]|^)[\uDC00-\uDFFF]/g, '');
    wisdom_agent.description = sanitizedDescription;
    
    try {
      console.log("Initializing agent...");
      await wisdom_agent.init();
      console.log("Agent initialization successful!");
      
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
        imagesInCurrentCycle++;
      } else {
        textPosts++;
      }
      postsInCurrentCycle++;
      saveState();
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