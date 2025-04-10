import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";

// Store the latest generated image URL
let lastGeneratedImageUrl: string | null = null;

// Function to store the latest image URL
export function storeImageUrl(url: string): void {
  console.log("✅ Storing generated image URL:", url);
  lastGeneratedImageUrl = url;
}

// Function to get the latest image URL
export function getLastImageUrl(): string | null {
  return lastGeneratedImageUrl;
}

// Create a wrapper worker that manages image URLs
export function createImageUrlHandlerWorker() {
  const getImageUrl = new GameFunction({
    name: "get_latest_image_url",
    description: "Get the URL of the most recently generated image",
    args: [],
    executable: async (args: {}, logger?: (msg: string) => void) => {
      if (logger) logger(`Retrieving the latest generated image URL`);
      
      if (!lastGeneratedImageUrl) {
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          "No image has been generated yet. Please generate an image first."
        );
      }
      
      return new ExecutableGameFunctionResponse(
        ExecutableGameFunctionStatus.Done,
        lastGeneratedImageUrl
      );
    }
  });

  return new GameWorker({
    id: "image_url_handler",
    name: "Image URL Handler",
    description: "Manages image URLs to ensure consistency",
    functions: [getImageUrl]
  });
}