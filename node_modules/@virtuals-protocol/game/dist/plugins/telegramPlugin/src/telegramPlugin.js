"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const game_1 = require("@virtuals-protocol/game");
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
class TelegramPlugin {
    constructor(options) {
        this.id = options.id || "telegram_worker";
        this.name = options.name || "Telegram Worker";
        this.description =
            options.description ||
                "A worker that executes tasks within Telegram. It can send messages, send media, create poll, pin messages, and delete messages.";
        this.telegramClient = new node_telegram_bot_api_1.default(options.credentials.botToken, { polling: true });
    }
    // Method to register a custom message handler
    onMessage(handler) {
        this.telegramClient.on('message', handler);
    }
    // Method to register a custom poll answer handler
    onPollAnswer(handler) {
        this.telegramClient.on('poll_answer', handler);
    }
    getWorker(data) {
        return new game_1.GameWorker({
            id: this.id,
            name: this.name,
            description: this.description,
            functions: (data === null || data === void 0 ? void 0 : data.functions) || [
                this.sendMessageFunction,
                this.sendMediaFunction,
                this.createPollFunction,
                this.pinnedMessageFunction,
                this.unPinnedMessageFunction,
                this.deleteMessageFunction
            ],
            getEnvironment: data === null || data === void 0 ? void 0 : data.getEnvironment,
        });
    }
    /**
     * Function to send a text message to a chat.
     * Requires the chat_id and text to send the message.
     */
    get sendMessageFunction() {
        return new game_1.GameFunction({
            name: "send_message",
            description: "Send a text message to a Discord channel.",
            args: [
                { name: "chat_id", description: "Unique identifier for the target chat or username of the target channel", type: "string" },
                { name: "text", description: "Message text to send. Should be contextually relevant and maintain conversation flow.", type: "string" },
            ],
            executable: (args, logger) => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (!args.chat_id || !args.text) {
                        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Both channel_id and content are required.");
                    }
                    logger(`Sending message to channel: ${args.text}`);
                    // Get the channel using the Discord.js client
                    this.telegramClient.sendMessage(args.chat_id, args.text);
                    logger("Message sent successfully.");
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, "Message sent successfully.");
                }
                catch (e) {
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "An error occurred while sending the message.");
                }
            }),
        });
    }
    /**
     * Function to send media (photo, document, video, audio) to a chat.
     * Requires the chat_id, media_type, and media to send the media content.
     * Optionally, a caption can be added to provide context or explanation.
     */
    get sendMediaFunction() {
        return new game_1.GameFunction({
            name: "send_media",
            description: "Send a media message (photo, document, video, etc.) with an optional caption. Use when visual or document content adds value to the conversation.",
            args: [
                { name: "chat_id", description: "Target chat identifier where media will be sent.", type: "string" },
                { name: "media_type", description: "Type of media to send: 'photo', 'document', 'video', 'audio'. Choose appropriate type for content.", type: "string" },
                { name: "media", description: "File ID or URL of the media to send. Ensure content is appropriate and relevant.", type: "string" },
                { name: "caption", description: "Optional text caption accompanying the media. Should provide context or explanation when needed, or follows up the conversation.", type: "string" },
            ],
            executable: (args, logger) => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (!args.chat_id || !args.media_type || !args.media) {
                        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "chat_id, media_type, and media are required.");
                    }
                    logger(`Sending ${args.media_type} media to chat: ${args.chat_id}`);
                    // Send the media message using the Telegram client
                    if (args.media_type === 'photo') {
                        yield this.telegramClient.sendPhoto(args.chat_id, args.media, { caption: args.caption });
                    }
                    else if (args.media_type === 'document') {
                        yield this.telegramClient.sendDocument(args.chat_id, args.media, { caption: args.caption });
                    }
                    else if (args.media_type === 'video') {
                        yield this.telegramClient.sendVideo(args.chat_id, args.media, { caption: args.caption });
                    }
                    else if (args.media_type === 'audio') {
                        yield this.telegramClient.sendAudio(args.chat_id, args.media, { caption: args.caption });
                    }
                    logger(`${args.media_type} sent successfully.`);
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, `${args.media_type} sent successfully.`);
                }
                catch (e) {
                    logger(`Error: ${e.message}`);
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, `Failed to send media: ${e.message}`);
                }
            }),
        });
    }
    /**
     * Function to create a poll in a chat.
     * Requires the chat_id, question, and options to create the poll.
     * Optionally, is_anonymous can be set to true to make poll responses anonymous.
     */
    get createPollFunction() {
        return new game_1.GameFunction({
            name: "create_poll",
            description: "Create an interactive poll to gather user opinions or make group decisions. Useful for engagement and collecting feedback.",
            args: [
                { name: "chat_id", description: "Chat where the poll will be created", type: "string" },
                { name: "question", description: "Main poll question. Should be clear and specific.", type: "string" },
                { name: "options", description: "List of answer options. Make options clear and mutually exclusive.", type: "string" },
                { name: "is_anonymous", description: "Whether poll responses are anonymous. Consider privacy and group dynamics.", type: "boolean" }
            ],
            executable: (args, logger) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                try {
                    if (!args.chat_id || !args.question || !args.options) {
                        logger(`Error: chat_id, question, and options are required.`);
                        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "chat_id, question, and options are required.");
                    }
                    logger(`Creating poll in chat: ${args.chat_id}`);
                    // Parse the options string into an array
                    const options = args.options.split(",").map((option) => option.trim());
                    // Ensure options are in a correct format (an array of strings)
                    if (!Array.isArray(options) || options.length < 2) {
                        logger(`Error: Options must be an array with at least two items.`);
                        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Options must be an array with at least two items.");
                    }
                    // Create the poll using the Telegram Bot API
                    const poll = yield this.telegramClient.sendPoll(args.chat_id, args.question, options, {
                        is_anonymous: Boolean(args.is_anonymous),
                    });
                    logger(`Poll created successfully. Poll ID: ${(_a = poll.poll) === null || _a === void 0 ? void 0 : _a.id}`);
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, `Poll created successfully. Poll ID: ${(_b = poll.poll) === null || _b === void 0 ? void 0 : _b.id}`);
                }
                catch (e) {
                    logger(`Error: ${e.message}`);
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, `Failed to create poll: ${e.message}`);
                }
            }),
        });
    }
    /**
     * Function to pin a message in a chat.
     * Requires the chat_id and message_id to identify the message to pin.
     * Optionally, disable_notification can be set to true to avoid sending a notification about the pinned message.
     */
    get pinnedMessageFunction() {
        return new game_1.GameFunction({
            name: "pinned_message",
            description: "Pin an important message in a chat. Use for announcements, important information, or group rules.",
            args: [
                { name: "chat_id", description: "Chat where the message will be pinned", type: "string" },
                { name: "message_id", description: "ID of the message to pin. Ensure message contains valuable information worth pinning.", type: "number" },
                { name: "disable_notification", description: "Whether to send notification about pinned message. Consider group size and message importance.", type: "boolean" }
            ],
            executable: (args, logger) => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (!args.chat_id || !args.message_id) {
                        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "chat_id and message_id are required.");
                    }
                    logger(`Pinning message with ID: ${args.message_id} in chat: ${args.chat_id}`);
                    // Pin the message using the Telegram Bot API
                    yield this.telegramClient.pinChatMessage(args.chat_id, Number(args.message_id), {
                        disable_notification: Boolean(args.disable_notification) || false
                    });
                    logger("Message pinned successfully.");
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, "Message pinned successfully.");
                }
                catch (e) {
                    logger(`Error: ${e.message}`);
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, `Failed to pin message: ${e.message}`);
                }
            }),
        });
    }
    /**
     * Function to unpin a message from a chat.
     * Requires the chat_id and message_id to identify the message to unpin.
     */
    get unPinnedMessageFunction() {
        return new game_1.GameFunction({
            name: "unpinned_message",
            description: "Unpin an important message in a chat. Use for announcements, important information, or group rules.",
            args: [
                { name: "chat_id", description: "Chat where the message will be unpinned", type: "string" },
                { name: "message_id", description: "ID of the message to unpin. Ensure message contains valuable information worth pinning.", type: "number" },
                { name: "disable_notification", description: "Whether to send notification about pinned message. Consider group size and message importance.", type: "boolean" }
            ],
            executable: (args, logger) => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (!args.chat_id || !args.message_id) {
                        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "chat_id and message_id are required.");
                    }
                    logger(`Unpinning message with ID: ${args.message_id} in chat: ${args.chat_id}`);
                    // Pin the message using the Telegram Bot API
                    yield this.telegramClient.unpinChatMessage(args.chat_id, {
                        message_id: Number(args.message_id),
                    });
                    logger("Message unpinned successfully.");
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, "Message unpinned successfully.");
                }
                catch (e) {
                    logger(`Error: ${e.message}`);
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, `Failed to pin message: ${e.message}`);
                }
            }),
        });
    }
    /**
     * Function to delete a message from a chat.
     * Requires the chat_id and message_id to identify the message to delete.
     */
    get deleteMessageFunction() {
        return new game_1.GameFunction({
            name: "delete_message",
            description: "Delete message from a chat. Use for moderation or cleaning up outdated information.",
            args: [
                { name: "chat_id", description: "Chat containing the messages to delete", type: "string" },
                { name: "message_id", description: "ID of the messages to delete. Consider impact before deletion.", type: "string" }
            ],
            executable: (args, logger) => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (!args.chat_id || !args.message_id) {
                        return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, "Both chat_id and message_id are required.");
                    }
                    logger(`Deleting messages from chat: ${args.chat_id}. Message IDs: ${args.message_id}`);
                    // Loop through the message IDs and delete each one
                    yield this.telegramClient.deleteMessage(args.chat_id, Number(args.message_id));
                    logger("Messages deleted successfully.");
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Done, "Messages deleted successfully.");
                }
                catch (e) {
                    logger(`Error: ${e.message}`);
                    return new game_1.ExecutableGameFunctionResponse(game_1.ExecutableGameFunctionStatus.Failed, `Failed to delete message(s): ${e.message}`);
                }
            }),
        });
    }
}
exports.default = TelegramPlugin;
