export const CHANNEL_MESSAGE_CAPABILITIES = ["presentation", "delivery-pin"] as const;

/** Supported channel message capability id. */
export type ChannelMessageCapability = (typeof CHANNEL_MESSAGE_CAPABILITIES)[number];
