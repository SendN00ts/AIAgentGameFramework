import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import TwitterPlugin from '@virtuals-protocol/game-twitter-plugin';
import dotenv from 'dotenv';

dotenv.config();

// Create the correct Twitter client with extended methods
const twitterClient = new TwitterApi(process.env.GAME_TWITTER_ACCESS_TOKEN || '');

// Create the plugin using the correct client
export const twitterPlugin = new TwitterPlugin({
  id: 'wisdom_twitter_worker',
  name: 'Wisdom Twitter Worker',
  description: 'Worker that posts wisdom and knowledge tweets',
  twitterClient, // ✅ now matches expected type with postFormDataGame
});