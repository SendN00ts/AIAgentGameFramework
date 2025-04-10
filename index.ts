// Simplest possible index.ts to debug
import { wisdom_agent } from './agent';
import * as http from 'http';

// HTTP server for keepalive
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Bot is running\n');
});

async function main() {
  try {
    console.log("Starting bot in debug mode...");
    await wisdom_agent.init();
    console.log("Agent initialized!");
    
    // Start HTTP server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
    
    // Log heartbeat
    setInterval(() => console.log("Heartbeat:", new Date().toISOString()), 60000);
    
    // Attempt one step after 10 seconds
    setTimeout(async () => {
      try {
        console.log("Running first step...");
        await wisdom_agent.step();
        console.log("First step completed!");
      } catch (e) {
        console.error("First step error:", e);
      }
    }, 10000);
  } catch (e) {
    console.error("Initialization error:", e);
  }
}

main();