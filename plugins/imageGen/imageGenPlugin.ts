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
    this.id = options.id || "imagegen_worker";
    this.name = options.name || "Image Generation Worker";
    this.description = options.description || "Worker that generates AI images";
    this.apiKey = options.apiKey;
    this.baseApiUrl = options.baseApiUrl || "https://api.openai.com/v1/images/generations";
  }

  getWorker(): GameWorker {
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
            try {
              const prompt = args.prompt;
              if (!prompt) {
                return new ExecutableGameFunctionResponse(
                  ExecutableGameFunctionStatus.Failed,
                  "Prompt is required for image generation"
                );
              }

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

              if (logger) logger(`Generating image with prompt: ${prompt}`);

              const response = await fetch(baseApiUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
              });

              if (!response.ok) {
                return new ExecutableGameFunctionResponse(
                  ExecutableGameFunctionStatus.Failed,
                  `HTTP error! status: ${response.status}`
                );
              }

              const responseData = await response.json() as { data: Array<{ url: string }> };
              const imageUrl = responseData.data[0].url;

              return new ExecutableGameFunctionResponse(
                ExecutableGameFunctionStatus.Done,
                `${imageUrl}`
              );
            } catch (error) {
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