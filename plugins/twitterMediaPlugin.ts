import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { TwitterApi } from 'twitter-api-v2';
import { getLastImageUrl } from './imageUrlHandler';

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

  // Function to validate image URL
  function validateAndFixImageUrl(providedUrl?: string): string | null {
    // If URL is missing, invalid, or contains placeholders
    if (!providedUrl || 
        providedUrl.includes("[") || 
        providedUrl.includes("generated.image") ||
        !providedUrl.startsWith("https://") ||
        providedUrl.endsWith("...")) {
      
      console.log("⚠️ Invalid image URL detected:", providedUrl);
      
      // Try to use the stored URL
      const storedUrl = getLastImageUrl();
      if (storedUrl) {
        console.log("✅ Using stored image URL instead:", storedUrl);
        return storedUrl;
      } else {
        console.log("❌ No stored URL available");
        return null;
      }
    }
    
    // URL seems valid
    return providedUrl;
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
        
        // Added logging at beginning
        console.log("⚠️ TWEET ATTEMPT ⚠️");
        console.log("Text:", text);
        console.log("Image URL (first 100 chars):", image_url ? image_url.substring(0, 100) + "..." : "undefined");
        
        if (!text) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Tweet text is required"
          );
        }
        
        // Validate and fix the image URL
        const finalImageUrl = validateAndFixImageUrl(image_url);
        
        if (!finalImageUrl) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "No valid image URL provided and no stored URL available. Generate an image first."
          );
        }
    
        console.log("📸 Final image URL used:", finalImageUrl);
        
        // Download with retry logic
        if (logger) logger(`Downloading image from ${finalImageUrl}`);
        console.log("📥 Attempting image download...");
        
        let mediaBuffer;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            const imageResponse = await axios.get(finalImageUrl, { 
              responseType: 'arraybuffer',
              timeout: 15000,
              maxRedirects: 5,
              headers: {
                'Accept': 'image/jpeg,image/*',
                'User-Agent': 'TwitterBot/1.0'
              }
            });
            
            mediaBuffer = Buffer.from(imageResponse.data);
            console.log("✅ Image downloaded successfully, size:", mediaBuffer.length);
            
            if (logger) logger(`Created media buffer of size: ${mediaBuffer.length}`);
    
            if (!mediaBuffer || mediaBuffer.length < 1024) {
              if (retryCount >= maxRetries - 1) {
                throw new Error(`Downloaded image too small (${mediaBuffer?.length || 0} bytes) - possible download failure.`);
              } else {
                retryCount++;
                console.log(`🔄 Retry ${retryCount}/${maxRetries}: Image too small`);
                if (logger) logger(`Retry ${retryCount}/${maxRetries}: Image too small`);
                await new Promise(r => setTimeout(r, 1000)); // Wait 1s between retries
                continue;
              }
            }
            
            break; // Success - exit retry loop
            
          } catch (downloadError: any) {
            console.error("❌ Image download error:", downloadError.message);
            if (retryCount >= maxRetries - 1) {
              throw downloadError;
            }
            retryCount++;
            console.log(`🔄 Retry ${retryCount}/${maxRetries} after error`);
            if (logger) logger(`Retry ${retryCount}/${maxRetries} after error: ${downloadError.message}`);
            await new Promise(r => setTimeout(r, 1000)); // Wait 1s between retries
          }
        }
    
        // Upload to Twitter
        console.log("📤 Uploading image to Twitter...");
        if (logger) logger(`Uploading image to Twitter`);
        
        // Use mimeType instead of type (per deprecation warning)
        const mediaId = await twitterClient.v1.uploadMedia(mediaBuffer as Buffer, { 
          mimeType: 'image/jpeg' 
        });
        
        console.log("✅ Image uploaded to Twitter, media ID:", mediaId);
        
        // Post tweet with media
        console.log("📝 Posting tweet with media...");
        if (logger) logger('Posting tweet with attached media');
        const tweet = await twitterClient.v2.tweet(text, {
          media: { media_ids: [mediaId] }
        });
    
        console.log("🎉 SUCCESS: Tweet posted with ID:", tweet.data.id);
        if (logger) logger(`Successfully posted tweet: ${tweet.data.id}`);
        
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          `Tweet posted successfully with media: ${tweet.data.id}`
        );
      } catch (error: any) {
        console.error('❌ DETAILED ERROR:', JSON.stringify(error, null, 2));
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