import { wisdom_agent } from '../agent';
import * as fs from 'fs';
import * as path from 'path';
import { 
  ExecutableGameFunctionResponse, 
  ExecutableGameFunctionStatus 
} from '@virtuals-protocol/game';

// Type definitions
interface TargetAccount {
  handle: string;
  description: string;
}

interface TweetSearchResult {
  tweetId: string;
  content: string;
  createdAt?: string;
}

function loadTargetAccounts(): TargetAccount[] {
  try {
    const filePath = path.join(process.cwd(), '../targeted_accounts2.json');
    const rawData = fs.readFileSync(filePath, 'utf8');
    const parsedData = JSON.parse(rawData);
    
    const accounts: TargetAccount[] = parsedData.top_wellness_accounts || [];
    
    console.log(`Loaded ${accounts.length} target accounts:`);
    accounts.forEach((account: TargetAccount) => 
      console.log(`- ${account.handle}: ${account.description}`)
    );
    
    return accounts;
  } catch (error) {
    console.error('Error loading target accounts:', error);
    return [];
  }
}

// Function to update agent instructions for personalized replies
function updateAgentForTargetedReply(account: TargetAccount, tweet: any): void {
  // Extract original description sections
  const baseDescription = wisdom_agent.description.split("CURRENT REQUIRED ACTION")[0];
  
  // Update agent's description with specific instructions for this reply
  wisdom_agent.description = `${baseDescription}
CURRENT REQUIRED ACTION: REPLY TO TARGET

You MUST reply to this specific tweet:
Account: @${account.handle}
Tweet ID: ${tweet.tweetId}
Tweet Content: "${tweet.content}"
Account Description: "${account.description}"

Your reply should:
1. Be thoughtful and relevant to their specific content
2. Include wisdom that enhances or builds upon their message
3. Be supportive and positive in tone
4. Include 1-2 relevant hashtags like #Wisdom #Philosophy or topic-specific tags
5. Sound natural and conversational, not like a template
6. Be concise (1-3 sentences maximum)
7. Include an appropriate emoji if it fits naturally

You MUST use the reply_tweet function with the exact tweet ID: ${tweet.tweetId}

All other actions are forbidden in this cycle.`;
}

async function performTargetedReplies() {
  const targetAccounts = loadTargetAccounts();
  
  if (targetAccounts.length === 0) {
    console.log('No target accounts found. Skipping replies.');
    return;
  }

  // Select a random account to reply to
  const selectedAccount = targetAccounts[Math.floor(Math.random() * targetAccounts.length)];
  
  try {
    // Retrieve the Twitter worker
    const twitterWorker = wisdom_agent.workers.find(
      worker => worker.name === "Wisdom Twitter Worker"
    );

    if (!twitterWorker) {
      console.error('Twitter worker not found');
      return;
    }

    // Find the search_tweets function
    const searchFunction = twitterWorker.functions.find(
      func => func.name === "search_tweets"
    );

    if (!searchFunction) {
      console.error('Search tweets function not found');
      return;
    }

    // Prepare search query
    const searchQuery = `from:${selectedAccount.handle}`;
    console.log(`Searching for tweets from: ${searchQuery}`);

    // Execute search
    const searchResult = await searchFunction.executable(
      { query: searchQuery, max_results: "5" },
      (msg: string) => console.log(`Search execution: ${msg}`)
    );

    // Log the entire search result for debugging
    console.log('Full search result:', JSON.stringify(searchResult, null, 2));

    // Validate search results with type casting
    if (!searchResult || 
        (searchResult as ExecutableGameFunctionResponse).status !== ExecutableGameFunctionStatus.Done) {
      console.error('Search failed or no results');
      console.error('Search result status:', 
        (searchResult as ExecutableGameFunctionResponse)?.status);
      return;
    }

    // Use type assertion to access the response
    const tweets = (searchResult as any).response || (searchResult as any).data || [];
    
    console.log('Tweets found:', tweets);
    console.log('Number of tweets:', tweets.length);

    if (!tweets || tweets.length === 0) {
      console.log('No tweets found for the selected account');
      return;
    }

    // Select the most recent tweet
    const mostRecentTweet = tweets[0];
    
    console.log(`Selected tweet to reply to: "${mostRecentTweet.content}"`);
    
    // Update agent's instructions to create a personalized reply
    updateAgentForTargetedReply(selectedAccount, mostRecentTweet);
    
    // Let the agent create and post the reply
    await wisdom_agent.step({ verbose: true });
    
    console.log(`Agent created personalized reply to @${selectedAccount.handle}'s tweet`);

  } catch (error) {
    console.error('Error in performTargetedReplies:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}

// Export the function for use in main scheduling
export { performTargetedReplies };