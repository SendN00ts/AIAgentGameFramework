import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";

export class ImageGenPlugin {
  private id: string;
  private name: string;
  private description: string;
  private apiKey: string;
  private baseApiUrl: string = "https://api.openai.com/v1/images/generations";

  constructor(options: {
    id?: string;
    name?: string;
    description?: string;
    apiKey: string;
  }) {
    this.id = options.id || "imagegen_worker";
    this.name = options.name || "Image Generation Worker";
    this.description = options.description || "Worker that generates AI images using Dall-E";
    this.apiKey = options.apiKey;
  }

  public getWorker(): any {
    return {
      name: this.name,
      description: this.description,
      functions: [this.generateImage]
    };
  }

  get generateImage() {
    return {
      name: "generate_image",
      description: "Generates AI images based on prompt using Dall-E",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The prompt for image generation"
          },
          width: {
            type: "number",
            description: "Width of generated image (default: 1024)",
            default: 1024
          },
          height: {
            type: "number",
            description: "Height of generated image (default: 1024)",
            default: 1024
          }
        },
        required: ["prompt"]
      },
      handler: async ({ prompt, width = 1024, height = 1024 }: any) => {
        try {
          const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          };
      
          const payload = {
            model: "black-forest-labs/FLUX.1-schnell-Free",
            prompt,
            width,
            height,
            steps: 1,
            n: 1,
            response_format: "url",
          };
      
          const response = await fetch(this.baseApiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
      
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
      
          // Fix the typing issue
          const responseData = await response.json() as { data: Array<{ url: string }> };
          return { url: responseData.data[0].url };
        } catch (error: any) {
          console.error("Image generation error:", error);
          throw error;
        }
      }
    };
  }
}