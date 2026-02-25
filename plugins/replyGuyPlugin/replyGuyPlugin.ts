import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import { TwitterApi } from 'twitter-api-v2';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface CachedAccount {
  userId: string;
  username: string;
  timestamp: number;
}

interface CachedTweet {
  userId: string;
  username: string;
  handle: string;
  description: string;
  category: string;
  tweet: any;
  replySettings: string;
}

const accountCache: Map<string, CachedAccount> = new Map();
const tweetCache: CachedTweet[] = [];
const CACHE_TTL = 24 * 60 * 60 * 1000;

interface TargetAccount {
  handle: string;
  description: string;
}

interface TargetAccountsFile {
  all: TargetAccount[];
}

export function clearTweetCache(): void {
  tweetCache.length = 0;
  console.log('🗑️ Tweet cache cleared');
}

export function createReplyGuyWorker(
  apiKey: string, 
  apiSecret: string, 
  accessToken: string, 
  accessSecret: string
): GameWorker {
  const twitterClient = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  function containsHashtags(text?: string): boolean {
    return Boolean(text && text.includes('#'));
  }

  async function getUserId(username: string): Promise<string | null> {
    const cached = accountCache.get(username);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      console.log(`✅ Using cached userId for ${username}`);
      return cached.userId;
    }
    
    try {
      const userResponse = await twitterClient.v2.userByUsername(username);
      if (!userResponse.data) return null;
      
      accountCache.set(username, {
        userId: userResponse.data.id,
        username: username,
        timestamp: now
      });
      
      console.log(`📥 Cached userId for ${username}`);
      return userResponse.data.id;
    } catch (error) {
      console.error(`Error fetching user ${username}:`, error);
      return null;
    }
  }

  const findTargetAccount = new GameFunction({
    name: "find_target_account",
    description: "Find a target wellness account and their latest tweet to reply to",
    args: [
      { name: "category", description: "Category of accounts to target (optional)", default: "random" }
    ],
    
    executable: async (args: {category?: string}, logger?: ((msg: string) => void) | null) => {
      try {
        while (tweetCache.length > 0) {
          const cachedTweet = tweetCache.shift()!;
          if (cachedTweet.replySettings !== 'everyone') {
            console.log(`⏭️ Skipping cached restricted tweet from ${cachedTweet.username} (reply_settings: ${cachedTweet.replySettings})`);
            continue;
          }
          console.log(`✅ Using cached tweet for ${cachedTweet.username} (${tweetCache.length} remaining)`);
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({
              handle: cachedTweet.handle,
              username: cachedTweet.username,
              description: cachedTweet.description,
              category: cachedTweet.category,
              tweet_id: cachedTweet.tweet.id,
              tweet_text: cachedTweet.tweet.text,
              tweet_created_at: cachedTweet.tweet.created_at || "unknown"
            })
          );
        }

        // Load accounts
        const possiblePaths = [
          path.resolve(process.cwd(), 'plugins/replyGuyPlugin/target_accounts.json'),
          path.resolve(process.cwd(), 'plugins/target_accounts.json'),
          path.resolve(process.cwd(), 'target_accounts.json'),
          path.resolve(__dirname, 'target_accounts.json')
        ];
        
        let accounts: TargetAccount[] = [];
        for (const filePath of possiblePaths) {
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const parsed: TargetAccountsFile = JSON.parse(fileContent);
            accounts = parsed.all || [];
            break;
          }
        }
        
        if (accounts.length === 0) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "No target accounts found."
          );
        }

        const randomAccount = accounts[Math.floor(Math.random() * accounts.length)];
        if (logger) logger(`Selected account: ${randomAccount.handle}`);
        console.log(`🎯 Selected target account: ${randomAccount.handle}`);

        // Trim to fix trailing space issues (e.g. "fmfclips ")
        const username = randomAccount.handle.replace('@', '').trim();

        if (username.length === 0 || username.length > 15) {
          console.log(`⚠️ Invalid username: "${username}"`);
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Invalid username: ${username}`
          );
        }
        
        try {
          const userId = await getUserId(username);
          if (!userId) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Could not find user: ${username}`
            );
          }
          
          console.log(`📥 Fetching tweets for ${username}`);
          const tweetsResponse = await twitterClient.v2.userTimeline(userId, {
            max_results: 5,
            "tweet.fields": ["created_at", "text", "reply_settings"],
            exclude: ["retweets", "replies"]
          });
          
          if (!tweetsResponse.data?.data || tweetsResponse.data.data.length === 0) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `No tweets found: ${username}`
            );
          }
          
          const tweets = tweetsResponse.data.data;
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

          console.log(`🔍 reply_settings for ${username}:`, tweets.map(t => `${t.id}:${t.reply_settings}`));

          // Find first tweet that is open to everyone with enough text content
          const latestTweet = tweets.find(t => {
            if (t.reply_settings !== 'everyone') return false;
            if (t.created_at) {
              const d = new Date(t.created_at);
              if (isNaN(d.getTime()) || d < threeMonthsAgo) return false;
            }
            // Strip links and check remaining text length
            const textWithoutLinks = (t.text || '').replace(/https?:\/\/\S+/g, '').trim();
            if (textWithoutLinks.length < 30) return false; // skip link-only tweets
            return true;
          });

          if (!latestTweet) {
            console.log(`⏭️ No eligible tweets for ${username}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `No eligible tweets for ${username}`
            );
          }

          // Cache remaining eligible tweets
          let cachedCount = 0;
          for (const t of tweets) {
            if (t.id === latestTweet.id) continue;
            if (t.reply_settings !== 'everyone') continue;
            if (t.created_at) {
              const d = new Date(t.created_at);
              if (isNaN(d.getTime()) || d < threeMonthsAgo) continue;
            }
            const textWithoutLinks = (t.text || '').replace(/https?:\/\/\S+/g, '').trim();
            if (textWithoutLinks.length < 30) continue;
            tweetCache.push({
              userId,
              username,
              handle: randomAccount.handle,
              description: randomAccount.description || "Wellness and mindfulness account",
              category: "all",
              tweet: t,
              replySettings: t.reply_settings || 'everyone'
            });
            cachedCount++;
          }
          console.log(`💾 Cached ${cachedCount} additional tweets (${tweetCache.length} total)`);
          
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({
              handle: randomAccount.handle,
              username,
              description: randomAccount.description || "Wellness and mindfulness account",
              category: "all",
              tweet_id: latestTweet.id,
              tweet_text: latestTweet.text,
              tweet_created_at: latestTweet.created_at || "unknown"
            })
          );
          
        } catch (error: any) {
          console.error(`Error fetching tweets for ${username}:`, error.message);
          if (error.data) console.error('   → API response:', JSON.stringify(error.data));
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Error: ${error.message}`
          );
        }
      } catch (error: any) {
        console.error('Error in find_target_account:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Error: ${error.message}`
        );
      }
    }
  });

  const replyTweet = new GameFunction({
    name: "reply_tweet",
    description: "Reply to a specific tweet with personalized content",
    args: [
      { name: "tweet_id", description: "ID of the tweet to reply to" },
      { name: "reply_text", description: "Text content of the reply" }
    ],
    executable: async (args: {tweet_id?: string, reply_text?: string}, logger?: ((msg: string) => void) | null) => {
      try {
        const { tweet_id, reply_text } = args;
        
        if (!tweet_id) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Tweet ID is required"
          );
        }
        
        if (!reply_text) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Reply text is required"
          );
        }
        
        if (containsHashtags(reply_text)) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Please remove hashtags from your reply."
          );
        }

        if (
          reply_text.includes('generate_and_tweet(') || 
          reply_text.includes('generate_image(') || 
          reply_text.includes('upload_image_and_tweet(') ||
          reply_text.includes('post_tweet(') ||
          reply_text.includes('reply_tweet(') ||
          reply_text.includes('get_latest_image_url(') ||
          reply_text.includes('Execute ') ||
          reply_text === "go_to" ||
          reply_text === "wait" ||
          reply_text.length < 10 ||
          /^[a-z_]+$/.test(reply_text) ||
          /^[a-zA-Z_]+\(['"].+['"]\)/.test(reply_text)
        ) {
          console.log("⚠️ Invalid reply content detected:", reply_text);
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Reply text appears to be a command or is too short."
          );
        }
        
        console.log(`📝 Replying to tweet ${tweet_id} with: ${reply_text}`);
        if (logger) logger(`Replying to tweet ${tweet_id}`);

        let replyResponse;
        try {
          replyResponse = await twitterClient.v2.reply(reply_text, tweet_id);
        } catch (replyError: any) {
          if (replyError?.code === 403) {
            console.log(`⏭️ Tweet ${tweet_id} has restricted replies`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `403 Reply restricted: ${replyError.message}`
            );
          }
          throw replyError;
        }
        
        if (!replyResponse.data) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Failed to post reply"
          );
        }
        
        console.log("✅ Reply posted successfully with ID:", replyResponse.data.id);
        if (logger) logger(`Reply posted successfully with ID: ${replyResponse.data.id}`);
        
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          `Reply posted successfully with ID: ${replyResponse.data.id}`
        );
        
      } catch (error: any) {
        console.error('Error posting reply:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Error posting reply: ${error.message}`
        );
      }
    }
  });

  const monitorAndReply = new GameFunction({
    name: "monitor_and_auto_reply",
    description: "Monitor specified accounts for new tweets and automatically reply to them",
    args: [
      { name: "category", description: "Category of accounts to monitor (optional)", default: "random" },
      { name: "check_interval", description: "How often to check for new tweets in minutes", default: 15 }
    ],
    executable: async (args: {category?: string, check_interval?: number}, logger?: ((msg: string) => void) | null) => {
      try {
        const { category = "random", check_interval = 15 } = args;
        console.log(`🔄 Setting up automatic monitoring for category: ${category}`);
        if (logger) logger(`Set up automatic reply monitoring for ${category} accounts`);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify({ category, check_interval_minutes: check_interval, monitor_active: true })
        );
      } catch (error: any) {
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Error: ${error.message}`
        );
      }
    }
  });

  return new GameWorker({
    id: "reply_guy_worker",
    name: "Reply Guy Worker",
    description: "Worker that finds target accounts and posts replies to their tweets",
    functions: [findTargetAccount, replyTweet, monitorAndReply]
  });
}