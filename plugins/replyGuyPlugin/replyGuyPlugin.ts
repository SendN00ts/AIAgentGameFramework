import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import { TwitterApi } from 'twitter-api-v2';
import * as fs from 'fs';
import * as path from 'path';

// Define types for target accounts
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

  // Function to load and parse the target accounts with multiple path checks
  function loadTargetAccounts(): TargetCategories {
    try {
      // Try multiple possible locations
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
          return JSON.parse(fileContent);
        }
      }
      
      console.error('Could not find target_accounts.json in any expected location');
      return {};
    } catch (error) {
      console.error('Error loading target accounts:', error);
      return {};
    }
  }

  // Function to check if text contains hashtags 
  function containsHashtags(text?: string): boolean {
    return Boolean(text && text.includes('#'));
  }

  // Find a target account to reply to
  const findTargetAccount = new GameFunction({
    name: "find_target_account",
    description: "Find a target wellness account and their latest tweet to reply to",
    args: [
      { name: "category", description: "Category of accounts to target (optional)", default: "random" }
    ],
    executable: async (args: {category?: string}, logger?: ((msg: string) => void) | null) => {
      try {
        const { category = "random" } = args;
        
        // Load target accounts
        const allTargetAccounts = loadTargetAccounts();
        
        if (Object.keys(allTargetAccounts).length === 0) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "No target accounts found. Please check the target_accounts.json file."
          );
        }
        
        // Select category
        let targetCategory: string;
        if (category === "random") {
          const categories = Object.keys(allTargetAccounts);
          targetCategory = categories[Math.floor(Math.random() * categories.length)];
        } else if (allTargetAccounts[category]) {
          targetCategory = category;
        } else {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Category '${category}' not found. Available categories: ${Object.keys(allTargetAccounts).join(', ')}`
          );
        }
        
        // Select random account from category
        const accounts = allTargetAccounts[targetCategory];
        const randomAccount = accounts[Math.floor(Math.random() * accounts.length)];
        
        if (logger) logger(`Selected account: ${randomAccount.handle} from category: ${targetCategory}`);
        console.log(`🎯 Selected target account: ${randomAccount.handle} (${targetCategory})`);
        
        // Extract username without @ symbol
        const username = randomAccount.handle.replace('@', '');
        
        try {
          // First find the user ID
          const userResponse = await twitterClient.v2.userByUsername(username);
          
          if (!userResponse.data) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Could not find Twitter user with username: ${username}`
            );
          }
          
          const userId = userResponse.data.id;
          
          // Get latest tweets
          const tweetsResponse = await twitterClient.v2.userTimeline(userId, {
            max_results: 5, 
            "tweet.fields": ["created_at", "text"]
          });
          
          if (!tweetsResponse.data || tweetsResponse.data.data.length === 0) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `No tweets found for user: ${username}`
            );
          }
          
          // Get the latest tweet
          const latestTweet = tweetsResponse.data.data[0];
          
          // Check if tweet has a valid creation date
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
          
          // Parse the date safely
          let tweetDate: Date;
          try {
            tweetDate = new Date(latestTweet.created_at);
            if (isNaN(tweetDate.getTime())) throw new Error("Invalid date");
          } catch (e) {
            console.log(`Invalid date format for tweet from ${username}`);
            // Use current date to avoid skipping
            tweetDate = new Date();
          }
          
          // Check if tweet is too old (older than 3 months)
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
  
  // Function to reply to a tweet
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
        
        // Check for hashtags
        if (containsHashtags(reply_text)) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Please remove hashtags from your reply as per guidelines."
          );
        }

        // Check if reply text resembles a command or is too short/generic
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
          /^[a-z_]+$/.test(reply_text) || // Single word commands
          /^[a-zA-Z_]+\(['"].+['"]\)/.test(reply_text) // Function call patterns
        )) {
          console.log("⚠️ Invalid reply content detected:", reply_text);
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Reply text appears to be a command or is too short. Please provide a thoughtful, conversational reply."
          );
        }
        
        console.log(`📝 Replying to tweet ${tweet_id} with: ${reply_text}`);
        if (logger) logger(`Replying to tweet ${tweet_id}`);
        
        // Post the reply
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

  // Monitor specific accounts for new tweets and reply automatically
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

        // This is just a trigger function - the actual monitoring happens outside
        // Set up a recurring job that will use find_target_account + reply_tweet periodically

        console.log(`🔄 Setting up automatic monitoring for category: ${category}`);
        console.log(`⏰ Check interval: ${check_interval} minutes`);
        
        if (logger) logger(`Set up automatic reply monitoring for ${category} accounts`);
        
        // Return the configuration so the outer system can set up the job
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