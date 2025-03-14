// test.ts
import dotenv from 'dotenv';
dotenv.config();

console.log("TOGETHER_API_KEY exists:", !!process.env.TOGETHER_API_KEY);

// Test import
try {
  const { ImageGenPlugin } = require('./plugins/imageGen');
  console.log("Import successful");
  
  const plugin = new ImageGenPlugin({
    apiKey: process.env.TOGETHER_API_KEY || ''
  });
  console.log("Plugin created");
} catch (error) {
  console.error("Import failed:", error);
}