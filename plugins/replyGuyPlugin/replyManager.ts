import { wisdom_agent } from '../../agent';
import { createReplyGuyWorker } from './replyGuyPlugin';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const REPLY_FILE_PATH = path.resolve(process.cwd(), 'data/replied_tweets.json');

let repliedTweets: Record<string, number> = {};

const replyGuyWorker = createReplyGuyWorker(
  process.env.TWITTER_API_KEY as string,
  process.env.TWITTER_API_SECRET as string,
  process.env.TWITTER_ACCESS_TOKEN as string,
  process.env.TWITTER_ACCESS_SECRET as string
);

function loadRepliedTweets() {
  try {
    if (fs.existsSync(REPLY_FILE_PATH)) {
      const data = fs.readFileSync(REPLY_FILE_PATH, 'utf8');
      repliedTweets = JSON.parse(data);
      console.log(`Loaded ${Object.keys(repliedTweets).length} replied tweets from file`);
    } else {
      console.log('No replied tweets file found, starting fresh');
      ensureDirExists(path.dirname(REPLY_FILE_PATH));
      saveRepliedTweets();
    }
  } catch (error) {
    console.error('Error loading replied tweets:', error);
    repliedTweets = {};
  }
}

function saveRepliedTweets() {
  try {
    fs.writeFileSync(REPLY_FILE_PATH, JSON.stringify(repliedTweets, null, 2));
    console.log(`Saved ${Object.keys(repliedTweets).length} replied tweets to file`);
  } catch (error) {
    console.error('Error saving replied tweets:', error);
  }
}

function ensureDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function findAndReply(category: string = 'random') {
  console.log(`⏱️ Running scheduled reply check for category: ${category}`);
  
  try {
    const findResult = await replyGuyWorker.functions
      .find(f => f.name === 'find_target_account')
      ?.executable({ category }, (msg: string) => console.log(`[Find Account] ${msg}`));
    
    if (!findResult || findResult.status !== 'done') {
      console.error('Failed to find target account:', findResult?.feedback || 'Unknown error');
      return;
    }

    const accountInfo = JSON.parse(findResult.feedback);
    console.log(`Found account: ${accountInfo.handle} with tweet: ${accountInfo.tweet_id}`);
    
    if (repliedTweets[accountInfo.tweet_id]) {
      console.log(`Already replied to tweet ${accountInfo.tweet_id}, skipping`);
      return;
    }
    
    const originalDescription = wisdom_agent.description;
    
    wisdom_agent.description = `You are a wisdom-sharing Twitter bot that engages thoughtfully with wellness and philosophy content.

CURRENT TASK: Reply to a tweet by ${accountInfo.handle} (${accountInfo.category} category)

ABOUT THE ACCOUNT: ${accountInfo.description}

THEIR TWEET: "${accountInfo.tweet_text}"

IMPORTANT RULES FOR REPLIES:
- Keep replies concise (1-3 sentences)
- Be authentic, supportive, and natural
- Avoid hashtags completely
- Focus on topics relevant to the account's expertise
- Add value through your philosophical perspective
- Don't use any AI-sounding phrases or generic responses
- Show genuine interest in their content

Your reply should be thoughtful, specific to their content, and invite further engagement.`;
    
    console.log('Generating reply content...');
    
    try {
      const agentThinking = await wisdom_agent.step({ verbose: true });
      console.log('Agent response:', agentThinking);
      
      let replyContent = '';
      
      if (typeof agentThinking === 'string') {
        replyContent = agentThinking.trim();
        replyContent = replyContent.replace(/^Reply:\s*/i, '');
      } else {
        console.error('Unexpected agent response format');
        return;
      }

      if (replyContent === "go_to" || replyContent === "wait" || replyContent.length < 10) {
        console.log("Invalid reply content detected, generating fallback response");
        const accountType = accountInfo.category || "wellness";
        replyContent = `Your insights on ${accountInfo.tweet_text.substring(0, 30)}... align with mindfulness principles. The connection between thought and action creates meaningful growth.`;
      }
      
      const replyResult = await replyGuyWorker.functions
        .find(f => f.name === 'reply_tweet')
        ?.executable({ 
          tweet_id: accountInfo.tweet_id,
          reply_text: replyContent
        }, (msg: string) => console.log(`[Reply Tweet] ${msg}`));
      
      if (!replyResult || replyResult.status !== 'done') {
        console.error('Failed to post reply:', replyResult?.feedback || 'Unknown error');
        return;
      }
      
      console.log('Reply posted successfully:', replyResult.feedback);
      
      repliedTweets[accountInfo.tweet_id] = Date.now();
      saveRepliedTweets();
      
    } finally {
      wisdom_agent.description = originalDescription;
    }
    
  } catch (error) {
    console.error('Error in find and reply process:', error);
  }
}

export function startMonitoring(category: string = 'random', intervalMinutes: number = 0) {
  if (intervalMinutes === 0) {
    console.log(`🔄 Running one-time reply for category: ${category}`);
    loadRepliedTweets();
    return findAndReply(category);
  }
  
  console.log(`🔄 Starting monitoring for category: ${category} every ${intervalMinutes} minutes`);
  loadRepliedTweets();
  findAndReply(category);
  
  return setInterval(() => {
    findAndReply(category);
  }, intervalMinutes * 60 * 1000);
}

export async function initializeReplyManager() {
  wisdom_agent.workers.push(replyGuyWorker);
  console.log('Reply Guy worker registered with agent');
}

export const replyManager = {
  startMonitoring,
  initialize: initializeReplyManager,
  worker: replyGuyWorker
};