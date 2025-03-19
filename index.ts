import { wisdom_agent } from './agent';

async function main() {
  try {
    // Initialize the agent
    console.log("Initializing Wisdom Twitter Bot...");
    await wisdom_agent.init();
    console.log("Wisdom Twitter Bot initialized successfully!");

    console.log("Available functions:", wisdom_agent.workers.flatMap(w => 
      w.functions.map(f => f.name)
    ));
    
    // Run with a 5-hour interval (18000 seconds)
    console.log("Starting agent with 5-hour interval...");
    await wisdom_agent.run(180, { 
      verbose: true 
    });
    
  } catch (error) {
    console.error("Failed to run agent:", error);
    process.exit(1);
  }
}

main();