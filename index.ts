import { wisdom_agent } from './agent';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { replyManager } from './plugins/replyGuyPlugin/replyManager';

const REPLIES_PER_DAY_TARGET = 90;
const REPLY_INTERVAL = 16 * 60 * 1000; // 16 minutes

let lastReplyTime = 0;
let dailyReplies = 0;
let lastResetDate = '';

let monthlyCapExceeded = false;
let monthlyCapResetTime = 0;
let dailyReadAttempts = 0;
const maxDailyReadAttempts = 300;

const STATE_FILE = '/app/data/reply_state.json';

function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      lastReplyTime,
      dailyReplies,
      lastResetDate,
      dailyReadAttempts
    }, null, 2));
    
    console.log('💾 State saved');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      lastReplyTime = state.lastReplyTime || 0;
      dailyReplies = state.dailyReplies || 0;
      lastResetDate = state.lastResetDate || '';
      dailyReadAttempts = state.dailyReadAttempts || 0;
      
      console.log('✅ State loaded:', {
        dailyReplies,
        dailyReadAttempts
      });
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
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
      console.log(`✅ Monthly cap reset! Read operations allowed.`);
    }
  }
  
  if (dailyReadAttempts >= maxDailyReadAttempts) {
    console.log(`⚠️ Daily read limit reached (${maxDailyReadAttempts}).`);
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

async function attemptReply(): Promise<void> {
  const now = Date.now();
  const timeSinceLastReply = now - lastReplyTime;
  
  if (timeSinceLastReply < REPLY_INTERVAL) {
    const minutesRemaining = Math.round((REPLY_INTERVAL - timeSinceLastReply) / 60000);
    console.log(`⏰ Next reply in ${minutesRemaining} minutes`);
    return;
  }
  
  if (dailyReplies >= REPLIES_PER_DAY_TARGET) {
    console.log(`✅ Daily reply target reached (${dailyReplies}/${REPLIES_PER_DAY_TARGET})`);
    return;
  }
  
  if (!canMakeReadRequest()) {
    console.log("⚠️ Cannot make read request due to rate limits");
    return;
  }
  
  console.log(`📨 Time for reply (${dailyReplies}/${REPLIES_PER_DAY_TARGET} today)`);
  
  incrementReadAttempts();
  
  try {
    await replyManager.startMonitoring('random', 0);
    incrementReplyCount();
    lastReplyTime = Date.now();
    console.log("✅ Reply successful!");
  } catch (error: any) {
    handleTwitterError(error);
    console.log(`⚠️ Reply failed:`, error.message);
  }
}

const server = http.createServer((request, response) => {
  if (request.url === '/') {
    const minutesSinceReply = Math.round((Date.now() - lastReplyTime) / 60000);
    const minutesUntilNext = Math.max(0, Math.round((REPLY_INTERVAL - (Date.now() - lastReplyTime)) / 60000));
    
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end(`AIleen Reply Agent

Status: Running
Replies per day target: ${REPLIES_PER_DAY_TARGET}
Reply interval: ${REPLY_INTERVAL / 60000} minutes

Stats:
- Replies Today: ${dailyReplies}/${REPLIES_PER_DAY_TARGET}
- Daily Read Attempts: ${dailyReadAttempts}/${maxDailyReadAttempts}

Rate Limits:
- Monthly Cap Exceeded: ${monthlyCapExceeded}
- Reset Time: ${monthlyCapResetTime ? new Date(monthlyCapResetTime * 1000).toISOString() : 'N/A'}

Timing:
- Last reply: ${minutesSinceReply} minutes ago
- Next reply: in ${minutesUntilNext} minutes
`);
    return;
  }
  
  if (request.url === '/reply') {
    attemptReply()
      .then(() => {
        response.writeHead(200, {'Content-Type': 'text/plain'});
        response.end('Reply attempt completed');
      })
      .catch(err => {
        response.writeHead(500, {'Content-Type': 'text/plain'});
        response.end('Error: ' + err.message);
      });
    return;
  }
  
  if (request.url === '/reset') {
    dailyReplies = 0;
    dailyReadAttempts = 0;
    saveState();
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end('Counters reset');
    return;
  }

  if (request.url === '/clear-cache') {
  // Clear tweet cache in replyGuyPlugin
  // Add export in plugin: export function clearCache() { tweetCache = []; }
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end('Cache cleared');
  return;
}

if (request.url === '/skipped') {
  try {
    if (fs.existsSync('/app/data/skipped_accounts.json')) {
      const skipLog = fs.readFileSync('/app/data/skipped_accounts.json', 'utf8');
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(skipLog);
    } else {
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end('[]');
    }
  } catch (error) {
    response.writeHead(500, {'Content-Type': 'text/plain'});
    response.end('Error reading skip log');
  }
  return;
}

if (request.url === 'reset-skipped') {
  const skipFilePath = '/app/data/skipped_accounts.json';
  if (fs.existsSync(skipFilePath)) {
    fs.unlinkSync(skipFilePath);
    console.log('✅ Skipped accounts log cleared');
  } else {
    console.log('⚠️ No skipped accounts log found');
  }
}
  
  response.writeHead(404, {'Content-Type': 'text/plain'});
  response.end('Not found');
});


async function runScheduler(): Promise<void> {
  try {
    await attemptReply();
  } catch (error) {
    console.error("❌ Scheduler error:", error);
  }
  
  setTimeout(runScheduler, 5 * 60 * 1000);
}

async function main(): Promise<void> {
  console.log("=========================================");
  console.log("🚀 AIleen Reply Agent Starting...");
  console.log("=========================================");
  
  loadState();
  
  console.log("Environment check:");
  console.log("- API_KEY:", !!process.env.API_KEY ? "✅" : "❌");
  console.log("- TWITTER_API_KEY:", !!process.env.TWITTER_API_KEY ? "✅" : "❌");
  console.log(`\n📊 Config: ${REPLIES_PER_DAY_TARGET} replies/day (every ${REPLY_INTERVAL / 60000} minutes)\n`);
  
  try {
   // console.log("Initializing agent...");
   // await wisdom_agent.init();
  //  console.log("✅ Agent initialized!");
    
    console.log("Initializing reply manager...");
    await replyManager.initialize();
    console.log("✅ Reply manager initialized!");
  } catch (error) {
    console.error("❌ Failed to initialize:", error);
    process.exit(1);
  }
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
  });
  
  console.log("⏰ Starting scheduler...");
  runScheduler();
  
  console.log("✅ Reply agent running!");
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  saveState();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  saveState();
});

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});