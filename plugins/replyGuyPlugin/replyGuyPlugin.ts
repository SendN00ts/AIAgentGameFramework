import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import { TwitterApi } from 'twitter-api-v2';
import * as fs from 'fs';
import * as path from 'path';

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
        // Check cache first
        if (tweetCache.length > 0) {
          const cachedTweet = tweetCache.shift()!;
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

        // Select 5 random different accounts
        const shuffled = [...accounts].sort(() => Math.random() - 0.5);
        const selectedAccounts = shuffled.slice(0, Math.min(5, accounts.length));
        
        console.log(`🎯 Selected ${selectedAccounts.length} different accounts to fetch tweets from`);

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        // Fetch 1 recent tweet from each of the 5 accounts
        for (const account of selectedAccounts) {
          const username = account.handle.replace('@', '');

          // Validate username length
          if (username.length > 15) {
            console.log(`⚠️ Username too long: ${username} (${username.length} chars), skipping`);
            continue;
          }
          
          try {
            const userId = await getUserId(username);
            if (!userId) {
              console.log(`⚠️ Could not find user: ${username}, skipping`);
              continue;
            }
            
            console.log(`📥 Fetching latest tweet for ${username}`);
            const tweetsResponse = await twitterClient.v2.userTimeline(userId, {
  max_results: 1
});
            
            if (!tweetsResponse.data || tweetsResponse.data.data.length === 0) {
              console.log(`⚠️ No tweets found for ${username}, skipping`);
              continue;
            }
            
            const latestTweet = tweetsResponse.data.data[0];
            
            // Validate tweet age
            if (latestTweet.created_at) {
              try {
                const tweetDate = new Date(latestTweet.created_at);
                if (isNaN(tweetDate.getTime())) throw new Error("Invalid date");
                
                if (tweetDate < threeMonthsAgo) {
                  console.log(`⏭️ Skipping inactive account ${username} - last tweet from ${tweetDate.toISOString()}`);
                  continue;
                }
              } catch (e) {
                console.log(`⚠️ Invalid date for tweet from ${username}, skipping`);
                continue;
              }
            }
            
            // Check for links
            const hasLink = latestTweet.text && (
              latestTweet.text.includes('http://') || 
              latestTweet.text.includes('https://') ||
              latestTweet.text.includes('t.co/')
            );

            if (hasLink) {
              const textWithoutLinks = latestTweet.text.replace(/https?:\/\/\S+/g, '').trim();
              if (textWithoutLinks.length < 50) {
                console.log(`⏭️ Skipping tweet with link and minimal text from ${username}`);
                continue;
              }
            }
            
            // Cache this tweet
            tweetCache.push({
              userId: userId,
              username: username,
              handle: account.handle,
              description: account.description || "Wellness and mindfulness account",
              category: "all",
              tweet: latestTweet
            });
            
            console.log(`💾 Cached tweet from ${username}`);
            
          } catch (error: any) {
            console.error(`Error fetching tweets for ${username}:`, error.message);
            continue;
          }
        }
        
        console.log(`✅ Cached ${tweetCache.length} tweets from different accounts`);
        
        // Return first cached tweet
        if (tweetCache.length > 0) {
          const firstTweet = tweetCache.shift()!;
          
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({
              handle: firstTweet.handle,
              username: firstTweet.username,
              description: firstTweet.description,
              category: firstTweet.category,
              tweet_id: firstTweet.tweet.id,
              tweet_text: firstTweet.tweet.text,
              tweet_created_at: firstTweet.tweet.created_at || "unknown"
            })
          );
        } else {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "No valid tweets found from any account"
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

        if (reply_text && (
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
        )) {
          console.log("⚠️ Invalid reply content detected:", reply_text);
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Reply text appears to be a command or is too short."
          );
        }
        
        console.log(`📝 Replying to tweet ${tweet_id} with: ${reply_text}`);
        if (logger) logger(`Replying to tweet ${tweet_id}`);
        
        const replyResponse = await twitterClient.v2.reply(reply_text, tweet_id);
        
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
        console.log(`⏰ Check interval: ${check_interval} minutes`);
        
        if (logger) logger(`Set up automatic reply monitoring for ${category} accounts`);
        
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify({
            category: category,
            check_interval_minutes: check_interval,
            monitor_active: true
          })
        );
        
      } catch (error: any) {
        console.error('Error setting up monitoring:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Error setting up monitoring: ${error.message}`
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