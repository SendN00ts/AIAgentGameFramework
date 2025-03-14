// test.ts
import dotenv from 'dotenv';
dotenv.config();

console.log("OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY);

// Test import
try {
  const { ImageGenPlugin } = require('./plugins/imageGen');
  console.log("Import successful");
  
  const plugin = new ImageGenPlugin({
    apiKey: process.env.OPENAI_API_KEY || ''
  });
  console.log("Plugin created");
} catch (error) {
  console.error("Import failed:", error);
}