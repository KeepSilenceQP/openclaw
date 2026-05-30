// Channel id type aliases for plugin-facing APIs.
import type { ChatChannelId } from "../ids.js";

export type ChannelId = ChatChannelId | (string & {});
