import { wisdom_agent } from './agent';

async function main() {
  try {

    console.log("Initializing Wisdom Twitter Bot...");

    const sanitizedDescription = wisdom_agent.description.replace(/[\uD800-\uDFFF](?![\uD800-\uDFFF])|(?:[^\uD800-\uDFFF]|^)[\uDC00-\uDFFF]/g, '');
    wisdom_agent.description = sanitizedDescription;

    await wisdom_agent.init();
    console.log("Wisdom Twitter Bot initialized successfully!");

    console.log("Available functions:", wisdom_agent.workers.flatMap((w: any) => 
      w.functions.map((f: any) => f.name)
    ));
    
    // Run with a 1-hour interval (3600 seconds)
    console.log("Starting agent with 1-hour interval...");
    await wisdom_agent.run(600, { 
      verbose: true 
    });
    
  } catch (error) {
    console.error("Failed to run agent:", error);
    process.exit(1);
  }
}

main();