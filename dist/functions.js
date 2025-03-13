"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendActivitiesFunction = exports.getWeatherFunction = exports.getLocationFunction = exports.setStateFunction = exports.getStateFunction = void 0;
const dotenv_1 = require("dotenv");
const path_1 = require("path");
// Load environment variables
(0, dotenv_1.config)({ path: (0, path_1.resolve)(__dirname, '../.env') });
// Verify environment variables before imports
if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing in .env file');
}
const game_1 = require("@virtuals-protocol/game");
const openai_1 = __importDefault(require("openai"));
// Initialize OpenAI
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1' // Default to OpenAI's standard URL
});
// Example function that shows current state
exports.getStateFunction = new game_1.GameFunction({
    name: "get_state",
    description: "Get current agent state",
    args: [],
    executable: async (args, logger) => {
        try {
            return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, "Current state retrieved successfully");
        }
        catch (e) {
            return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Failed to get state");
        }
    }
});
exports.setStateFunction = new game_1.GameFunction({
    name: "set_state",
    description: "Set current agent state",
    args: [],
    executable: async (args, logger) => {
        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, "State set successfully");
    }
});
// Function to get location data
exports.getLocationFunction = new game_1.GameFunction({
    name: "get_location",
    description: "Get current location from IP",
    args: [],
    executable: async (args, logger) => {
        try {
            // Using ipinfo.io for geolocation (free tier, no API key needed)
            const response = await fetch('https://ipinfo.io/json');
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error.message || 'Failed to get location');
            }
            // Split timezone into region/city
            const [region, city] = (data.timezone || '').split('/');
            logger(`Location detected: ${data.city}, ${data.country}`);
            return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, JSON.stringify({
                city: data.city,
                country: data.country,
                country_name: data.country,
                region: data.region,
                lat: data.loc?.split(',')[0],
                lon: data.loc?.split(',')[1],
                timezone: data.timezone,
                current_time: new Date().toLocaleString('en-US', { timeZone: data.timezone })
            }));
        }
        catch (e) {
            return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, `Failed to fetch location data: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }
});
// Function to get weather data
exports.getWeatherFunction = new game_1.GameFunction({
    name: "get_weather",
    description: "Get current weather for a location",
    args: [
        { name: "city", description: "City name" },
        { name: "country", description: "Country code (e.g., US)" }
    ],
    executable: async (args, logger) => {
        try {
            const API_KEY = process.env.WEATHER_API_KEY;
            const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${args.city},${args.country}&units=metric&appid=${API_KEY}`);
            const data = await response.json();
            if (data.cod !== 200) {
                throw new Error(data.message || 'Failed to fetch weather data');
            }
            return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, JSON.stringify({
                temp: data.main.temp,
                feels_like: data.main.feels_like,
                humidity: data.main.humidity,
                conditions: data.weather[0].main,
                description: data.weather[0].description,
                wind_speed: data.wind.speed
            }));
        }
        catch (e) {
            return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, `Failed to fetch weather data: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }
});
// Function to recommend activities using OpenAI
exports.recommendActivitiesFunction = new game_1.GameFunction({
    name: "recommend_activities",
    description: "Recommend activities based on weather and location",
    args: [
        { name: "weather", description: "Weather in temrms of tempearture only" },
        { name: "location", description: "the city and country" }
    ],
    executable: async (args, logger) => {
        // console.log("ARGS", args);
        // Create prompt for OpenAI
        const prompt = `Given the following weather:${args.weather} in ${args.location}:

            Please recommend 5 suitable activities for this weather and location...`;
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-3.5-turbo",
            temperature: 0.7,
            max_tokens: 500
        });
        const recommendations = completion.choices[0].message.content;
        // console.log("RECOMMENDATIONS", recommendations);
        logger("Generated activity recommendations using AI");
        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, `Based on the current conditions in ${args.location}, here are some recommended activities:\n\n${recommendations}`);
    }
});
//# sourceMappingURL=functions.js.map