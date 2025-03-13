// src/index.ts
import { wisdom_agent } from './agent';

// Maximum number of retries for API errors
const MAX_RETRIES = 3;
// Time to wait between steps (in milliseconds)
const STEP_DELAY = 5 * 60 * 1000; // 30 minutes
// Time to wait after an error (in milliseconds)
const ERROR_RETRY_DELAY = 3 * 60 * 1000; // 5 minutes

async function runAgentWithRetry(retryCount = 0) {
  try {
    // Run a single step
    await wisdom_agent.step({ verbose: true });
    console.log(`Step completed successfully. Waiting ${STEP_DELAY/60000} minutes until next step...`);
    
    // Schedule the next step after a delay
    setTimeout(() => runAgentWithRetry(), STEP_DELAY);
    
  } catch (error) {
    console.error(`Error running agent step:`, error);
    
    if (retryCount < MAX_RETRIES) {
      const nextRetry = retryCount + 1;
      console.log(`Retry attempt ${nextRetry}/${MAX_RETRIES} in ${ERROR_RETRY_DELAY/60000} minutes...`);
      
      // Wait longer after an error before retrying
      setTimeout(() => runAgentWithRetry(nextRetry), ERROR_RETRY_DELAY);
    } else {
      console.error(`Maximum retry attempts (${MAX_RETRIES}) reached. Please check your configuration and try again later.`);
      process.exit(1);
    }
  }
}

async function main() {
  try {
    // Initialize the agent
    console.log("Initializing Wisdom Twitter Bot...");
    await wisdom_agent.init();
    console.log("Wisdom Twitter Bot initialized successfully!");
    
    // Start the first step
    runAgentWithRetry();
    
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    process.exit(1);
  }
}

main();