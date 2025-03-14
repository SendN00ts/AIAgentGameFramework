// src/plugins/imageGen/imageGenPlugin.ts
import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";

export class ImageGenPlugin {
  private id: string;
  private name: string;
  private description: string;
  private apiKey: string;
  private baseApiUrl: string;

  constructor(options: {
    id?: string;
    name?: string;
    description?: string;
    apiKey: string;
    baseApiUrl?: string;
  }) {
    console.log("ImageGenPlugin constructor called");
    this.id = options.id || "imagegen_worker";
    this.name = options.name || "Image Generation Worker";
    this.description = options.description || "Worker that generates AI images";
    this.apiKey = options.apiKey;
    this.baseApiUrl = options.baseApiUrl || "https://api.openai.com/v1/images/generations";
    console.log(`ImageGenPlugin initialized: ${this.name}, API key exists: ${!!this.apiKey}`);
  }

  getWorker(): GameWorker {
    console.log("getWorker called for ImageGenPlugin");
    // Capture class properties for use in the function
    const apiKey = this.apiKey;
    const baseApiUrl = this.baseApiUrl;
    
    return new GameWorker({
      id: this.id,
      name: this.name,
      description: this.description,
      functions: [
        new GameFunction({
          name: "generate_image",
          description: "Generates AI image based on prompt using DALL-E",
          args: [
            {
              name: "prompt",
              description: "The prompt for image generation",
              type: "string",
            }
          ],
          executable: async function(args: any, logger: any) {
            console.log("generate_image function called with args:", JSON.stringify(args));
            try {
              const prompt = args.prompt;
              if (!prompt) {
                console.log("Error: No prompt provided");
                return new ExecutableGameFunctionResponse(
                  ExecutableGameFunctionStatus.Failed,
                  "Prompt is required for image generation"
                );
              }

              console.log(`Generating image with prompt: "${prompt}"`);
              if (logger) logger(`Generating image with prompt: ${prompt}`);

              const headers = {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              };

              const payload = {
                model: "dall-e-3",
                prompt,
                n: 1,
                size: "1024x1024",
              };

              console.log("Making API request to:", baseApiUrl);
              const response = await fetch(baseApiUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
              });

              console.log("Response status:", response.status);
              if (!response.ok) {
                const errorText = await response.text();
                console.error(`API error (${response.status}):`, errorText);
                return new ExecutableGameFunctionResponse(
                  ExecutableGameFunctionStatus.Failed,
                  `HTTP error! status: ${response.status}, details: ${errorText}`
                );
              }

              const responseData = await response.json() as { data: Array<{ url: string }> };
              console.log("Response data:", JSON.stringify(responseData));
              const imageUrl = responseData.data[0].url;
              console.log("Generated image URL:", imageUrl);

              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                `${imageUrl}`
              );
            } catch (error) {
              console.error("Image generation error:", error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Failed,
                `Error generating image: ${errorMessage}`
              );
            }
          }
        })
      ],
    });
  }
}