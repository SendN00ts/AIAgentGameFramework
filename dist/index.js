"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const agent_1 = require("./agent");
// Flag to track if a function has been called this cycle
let functionCalledThisCycle = false;
async function runAgentWithInterval() {
    try {
        // Reset the flag for this cycle
        functionCalledThisCycle = false;
        // Run a single step
        console.log(`Running agent step at ${new Date().toISOString()}`);
        await agent_1.wisdom_agent.step({ verbose: true });
        // Schedule the next step after exactly 1 hour
        console.log("Step completed. Next execution scheduled in 1 hour.");
        setTimeout(runAgentWithInterval, 60 * 60 * 1000); // 1 hour
    }
    catch (error) {
        console.error("Error running agent step:", error);
        setTimeout(runAgentWithInterval, 5 * 60 * 1000); // retry in 5 minutes if error
    }
}
async function main() {
    try {
        console.log("Initializing Wisdom Twitter Bot...");
        // Set up the logger to monitor function calls
        agent_1.wisdom_agent.setLogger((agent, msg) => {
            // Check for function execution
            if (msg.includes("post_tweet") ||
                msg.includes("search_tweets") ||
                msg.includes("reply_tweet") ||
                msg.includes("like_tweet") ||
                msg.includes("generate_image")) {
                if (functionCalledThisCycle) {
                    console.warn("⚠️ MULTIPLE FUNCTION CALLS DETECTED IN SINGLE CYCLE!");
                }
                functionCalledThisCycle = true;
            }
            console.log(`🧠 [${agent.name}]`);
            console.log(msg);
            console.log("------------------------\n");
        });
        // Sanitize description
        const sanitizedDescription = agent_1.wisdom_agent.description.replace(/[\uD800-\uDFFF](?![\uD800-\uDFFF])|(?:[^\uD800-\uDFFF]|^)[\uDC00-\uDFFF]/g, '');
        agent_1.wisdom_agent.description = "CRITICAL INSTRUCTION: You are strictly limited to ONE SINGLE FUNCTION CALL TOTAL per execution. You will run once per hour.\n\n" + sanitizedDescription;
        await agent_1.wisdom_agent.init();
        console.log("Wisdom Twitter Bot initialized successfully!");
        console.log("Available functions:", agent_1.wisdom_agent.workers.flatMap((w) => w.functions.map((f) => f.name)));
        // Start with step + setTimeout instead of run
        runAgentWithInterval();
    }
    catch (error) {
        console.error("Failed to initialize agent:", error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map