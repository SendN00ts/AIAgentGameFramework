import { createReplyGuyWorker } from './replyGuyPlugin';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TwitterApi } from '@virtuals-protocol/game-twitter-node';

dotenv.config();

const REPLY_FILE_PATH = '/app/data/replied_tweets.json';

let repliedTweets: Record<string, number> = {};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

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

function shouldSkipTweet(tweet: any): boolean {
  const text = tweet.text?.toLowerCase() || '';
  
  const politicalKeywords = ['trump', 'biden', 'election', 'vote', 'congress', 'senate', 'democrat', 'republican', 'politics', 'political'];
  const sexualKeywords = ['sex', 'porn', 'nsfw', 'onlyfans', 'xxx', 'adult content'];
  
  const hasPolitical = politicalKeywords.some(keyword => text.includes(keyword));
  const hasSexual = sexualKeywords.some(keyword => text.includes(keyword));
  
  if (hasPolitical || hasSexual) {
    console.log(`⏭️ Skipping tweet (filtered content): ${tweet.id}`);
    return true;
  }
  
  return false;
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

    // Fetch tweet to check content
    const tweetData = await twitterClient.v2.singleTweet(accountInfo.tweet_id, {
      'tweet.fields': ['text']
    });
    
    if (shouldSkipTweet(tweetData.data)) {
      return;
    }
    
    console.log('Generating reply content with OpenAI...');
    
    try {
const response = await openai.chat.completions.create({
  model: "gpt-5.2",
  max_tokens: 150,
  messages: [{
    role: "user",
    content: `Reply to @${accountInfo.handle}'s tweet: "${accountInfo.tweet_text}"

Write a specific, conversational and human like reply (1-2 sentences, no hashtags). Reference what they actually said, not generic themes.

IMPORTANT: 
- Do NOT use "I", "me", "my" or first-person language
- Write from a neutral, objective perspective
- Share wisdom or insights directly without personal framing`
  }]
});

      let replyContent = response.choices[0].message.content?.trim() || '';
      
      console.log('OpenAI response:', replyContent);

      // Check for invalid responses
      if (replyContent === "go_to" || 
          replyContent === "wait" || 
          replyContent === "call_function" ||
          replyContent.length < 10 ||
          replyContent.includes('reply_tweet(') ||
          replyContent.includes('find_target_account(')) {
        console.log("⚠️ Invalid reply content, skipping:", replyContent);
        return;
      }

      // Check for generic phrases
      const forbiddenPhrases = [
        "align with mindfulness principles",
        "connection between thought and action",
        "creates meaningful growth",
        "your insights on",
        "stellar piece",
        "powerful reminder",
        "beautifully articulated",
        "resonates deeply"
      ];

      if (forbiddenPhrases.some(phrase => replyContent.toLowerCase().includes(phrase))) {
        console.log("⚠️ Generic reply detected, skipping:", replyContent);
        return;
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
      
    } catch (error) {
      console.error('Error generating or posting reply:', error);
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
  console.log('Reply Guy worker ready (using OpenAI for replies)');
}

export const replyManager = {
  startMonitoring,
  initialize: initializeReplyManager,
  worker: replyGuyWorker
};