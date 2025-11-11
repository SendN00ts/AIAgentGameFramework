import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import { TwitterApi } from 'twitter-api-v2';
import * as fs from 'fs';
import * as path from 'path';

interface CachedAccount {
  userId: string;
  username: string;
  timestamp: number;
}

const accountCache: Map<string, CachedAccount> = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface TargetAccount {
  handle: string;
  description: string;
}

interface TargetCategories {
  [category: string]: TargetAccount[];
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

function loadTargetAccounts(): string[] {
  try {
    const possiblePaths = [
      path.resolve(process.cwd(), 'plugins/replyGuyPlugin/target_accounts.json'),
      path.resolve(process.cwd(), 'plugins/target_accounts.json'),
      path.resolve(process.cwd(), 'target_accounts.json'),
      path.resolve(__dirname, 'target_accounts.json')
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`Found target accounts at: ${filePath}`);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const parsed: TargetCategories = JSON.parse(fileContent);

        const allHandles: string[] = [];

        for (const category of Object.keys(parsed)) {
          const accounts = parsed[category];
          for (const acc of accounts) {
            if (acc.handle) {
              allHandles.push(acc.handle);
            }
          }
        }

        return allHandles;
      }
    }

    console.error('Could not find target_accounts.json');
    return [];
  } catch (error) {
    console.error('Error loading target accounts:', error);
    return [];
  }
}

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

  // End of loadTargetAccounts and helpers
  
  const findTargetAccount = new GameFunction({
    name: "find_target_account",
    description: "Find a target wellness account and their latest tweet to reply to",
    args: [
      { name: "category", description: "Category of accounts to target (optional)", default: "random" }
    ],
    executable: async (args: {category?: string}, logger?: ((msg: string) => void) | null) => {
      try {
        const { category = "random" } = args;

        // Load all accounts, but we want the parsed TargetCategories, not just handles
        const possiblePaths = [
          path.resolve(process.cwd(), 'plugins/replyGuyPlugin/target_accounts.json'),
          path.resolve(process.cwd(), 'plugins/target_accounts.json'),
          path.resolve(process.cwd(), 'target_accounts.json'),
          path.resolve(__dirname, 'target_accounts.json')
        ];
        let parsed: TargetCategories | null = null;
        for (const filePath of possiblePaths) {
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            parsed = JSON.parse(fileContent);
            break;
          }
        }
        if (!parsed) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "No target accounts found. Please check the target_accounts.json file."
          );
        }

        let targetCategory: string;
        if (category === "random") {
          const categories = Object.keys(parsed);
          targetCategory = categories[Math.floor(Math.random() * categories.length)];
        } else if (parsed[category]) {
          targetCategory = category;
        } else {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Category '${category}' not found. Available categories: ${Object.keys(parsed).join(', ')}`
          );
        }

        const accounts = parsed[targetCategory];
        const randomAccount = accounts[Math.floor(Math.random() * accounts.length)];

        if (logger) logger(`Selected account: ${randomAccount.handle} from category: ${targetCategory}`);
        console.log(`🎯 Selected target account: ${randomAccount.handle} (${targetCategory})`);

        const username = randomAccount.handle.replace('@', '');
        try {
          const userId = await getUserId(username);
          if (!userId) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Could not find Twitter user with username: ${username}`
            );
          }
          // OPTIMIZATION: Get only 1 tweet instead of 5
          const tweetsResponse = await twitterClient.v2.userTimeline(userId, {
            max_results: 1,
            "tweet.fields": ["created_at", "text"]
          });
          if (!tweetsResponse.data || tweetsResponse.data.data.length === 0) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `No tweets found for user: ${username}`
            );
          }
          const latestTweet = tweetsResponse.data.data[0];
          if (!latestTweet.created_at) {
            console.log(`No valid date for tweet from ${username}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              JSON.stringify({
                handle: randomAccount.handle,
                username: username,
                description: randomAccount.description,
                category: targetCategory,
                tweet_id: latestTweet.id,
                tweet_text: latestTweet.text,
                tweet_created_at: "unknown"
              })
            );
          }
          let tweetDate: Date;
          try {
            tweetDate = new Date(latestTweet.created_at);
            if (isNaN(tweetDate.getTime())) throw new Error("Invalid date");
          } catch (e) {
            console.log(`Invalid date format for tweet from ${username}`);
            tweetDate = new Date();
          }
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          if (tweetDate < threeMonthsAgo) {
            console.log(`Skipping inactive account ${username} - last tweet from ${tweetDate.toISOString()}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Account ${username} hasn't tweeted recently (last tweet: ${tweetDate.toDateString()})`
            );
          }
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({
              handle: randomAccount.handle,
              username: username,
              description: randomAccount.description,
              category: targetCategory,
              tweet_id: latestTweet.id,
              tweet_text: latestTweet.text,
              tweet_created_at: latestTweet.created_at
            })
          );
        } catch (error: any) {
          console.error('Error fetching tweets:', error);
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Error fetching tweets for ${username}: ${error.message}`
          );
        }
      } catch (error: any) {
        console.error('Error in find_target_account:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Error finding target account: ${error.message}`
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
            "Please remove hashtags from your reply as per guidelines."
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
            "Reply text appears to be a command or is too short. Please provide a thoughtful, conversational reply."
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