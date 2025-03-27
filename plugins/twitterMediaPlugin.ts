import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { TwitterApi } from 'twitter-api-v2';

export function createTwitterMediaWorker(apiKey: string, apiSecret: string, accessToken: string, accessSecret: string) {
  const twitterClient = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  // Create tmp directory for temporary files
  const tmpDir = path.resolve(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const uploadImageAndTweet = new GameFunction({
    name: "upload_image_and_tweet",
    description: "Upload an image URL and post a tweet with the image properly attached",
    args: [
      { name: "text", description: "The tweet text content" },
      { name: "image_url", description: "The URL of the image to upload" },
    ],
    executable: async (args: {text?: string, image_url?: string}, logger?: (msg: string) => void) => {
      try {
        const { text, image_url } = args;
        
        if (!text || !image_url) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Tweet text and image URL are required"
          );
        }
        
        // 1. Download the image
        if (logger) logger(`Downloading image from ${image_url}`);
        const imageResponse = await axios.get(image_url, { responseType: 'arraybuffer' });
        const mediaBuffer = Buffer.from(imageResponse.data);

        if (!mediaBuffer || mediaBuffer.length < 1024) {
          throw new Error("Image buffer is empty or too small — possible download failure.");
        }

        const mediaId = await twitterClient.v1.uploadMedia(mediaBuffer, { type: 'jpg' });
        
        // 3. Post tweet with media
        if (logger) logger('Posting tweet with attached media');
        const tweet = await twitterClient.v2.tweet(text, {
          media: { media_ids: [mediaId] }
        });
        
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          `Tweet posted successfully with media: ${tweet.data.id}`
        );
      } catch (error: any) {
        console.error('Error posting tweet with media:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Failed to post tweet with media: ${error?.message || 'Unknown error'}`
        );
      }
    }
  });

  return new GameWorker({
    id: "twitter_media_worker",
    name: "Twitter Media Worker",
    description: "Worker that handles Twitter media uploads and posting",
    functions: [uploadImageAndTweet]
  });
}