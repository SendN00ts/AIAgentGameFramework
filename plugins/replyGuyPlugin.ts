import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import * as fs from 'fs';
import * as path from 'path';
import { TwitterApi } from 'twitter-api-v2';

// Type definitions
interface TargetAccount {
  handle: string;
  description: string;
}

export function createReplyGuyWorker(apiKey: string, apiSecret: string, accessToken: string, accessSecret: string) {
  // Create Twitter client
  const twitterClient = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  // Load target accounts with better error handling
  function loadTargetAccounts(): TargetAccount[] {
    try {
      // Try different paths to find the file
      const possiblePaths = [
        path.join(process.cwd(), 'targeted_accounts2.json'),
        path.join(process.cwd(), '../targeted_accounts2.json'),
        path.join(__dirname, '../targeted_accounts2.json')
      ];
      
      let filePath = '';
      let foundPath = false;
      
      // Find the first path that exists
      for (const testPath of possiblePaths) {
        console.log(`Checking for accounts file at: ${testPath}`);
        if (fs.existsSync(testPath)) {
          filePath = testPath;
          foundPath = true;
          console.log(`✅ Found accounts file at: ${filePath}`);
          break;
        }
      }
      
      if (!foundPath) {
        console.error(`❌ Target accounts file not found in any checked locations`);
        return [];
      }
      
      const rawData = fs.readFileSync(filePath, 'utf8');
      const parsedData = JSON.parse(rawData);
      
      const accounts: TargetAccount[] = parsedData.top_wellness_accounts || [];
      
      console.log(`✅ Loaded ${accounts.length} target accounts`);
      return accounts;
    } catch (error) {
      console.error('❌ Error loading target accounts:', error);
      return [];
    }
  }

  const findTargetAccount = new GameFunction({
    name: "find_target_account",
    description: "Find a random target account to reply to and get their recent tweets",
    args: [],
    executable: async (args: {}, logger?: (msg: string) => void) => {
      try {
        if (logger) logger(`Loading target accounts...`);
        const accounts = loadTargetAccounts();
        
        if (accounts.length === 0) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "No target accounts found. Please check targeted_accounts2.json file."
          );
        }
        
        // Select random account
        const account = accounts[Math.floor(Math.random() * accounts.length)];
        if (logger) logger(`Selected account: @${account.handle}`);
        console.log(`🎯 Selected target account: @${account.handle}`);
        
        try {
          // Get user ID by username
          const user = await twitterClient.v2.userByUsername(account.handle);
          if (!user?.data?.id) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `User @${account.handle} not found on Twitter`
            );
          }
          
          // Get recent tweets using ID
          const userId = user.data.id;
          const timelineResponse = await twitterClient.v2.userTimeline(userId, {
            max_results: 5,
            exclude: ['retweets', 'replies']
          });
          
     
if (!Array.isArray(timelineResponse?.data) || timelineResponse.data.length === 0) {
    return new ExecutableGameFunctionResponse(
      ExecutableGameFunctionStatus.Failed,
      `No tweets found for @${account.handle}`
    );
  }
  
  // Safe to access the first tweet as an element of the array now
  const tweet = timelineResponse.data[0];
  
  if (!tweet?.id || !tweet?.text) {
    return new ExecutableGameFunctionResponse(
      ExecutableGameFunctionStatus.Failed,
      `Invalid tweet data from @${account.handle}`
    );
  }
          
          console.log(`📝 Found tweet: "${tweet.text.substring(0, 50)}..."`);
          
          // Create a plain object to avoid type issues
          const response = {
            account_handle: account.handle,
            account_description: account.description,
            tweet_id: tweet.id,
            tweet_content: tweet.text
          };
          
          // Convert to any to bypass TypeScript's type checking
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.parse(JSON.stringify(response)) as any
          );
        } catch (twitterError: any) {
          console.error('Twitter API error:', twitterError);
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Twitter API error: ${twitterError.message}`
          );
        }
      } catch (error: any) {
        console.error('❌ Error in find_target_account:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed, 
          `Failed to get target account: ${error.message}`
        );
      }
    }
  });

  return new GameWorker({
    id: "reply_guy_worker",
    name: "Reply Guy Worker",
    description: "Worker that handles finding and replying to targeted accounts",
    functions: [findTargetAccount]
  });
}