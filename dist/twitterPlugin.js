"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.twitterPlugin = void 0;
const game_twitter_plugin_1 = __importStar(require("@virtuals-protocol/game-twitter-plugin"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Create Twitter client
const gameTwitterClient = new game_twitter_plugin_1.GameTwitterClient({
    accessToken: process.env.GAME_TWITTER_ACCESS_TOKEN || '',
});
// Create plugin
exports.twitterPlugin = new game_twitter_plugin_1.default({
    id: "wisdom_twitter_worker",
    name: "Wisdom Twitter Worker",
    description: "Worker that posts wisdom and knowledge tweets",
    twitterClient: gameTwitterClient,
});
//# sourceMappingURL=twitterPlugin.js.map