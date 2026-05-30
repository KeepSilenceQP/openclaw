export {
  buildOutboundSessionContext,
  createOutboundPayloadPlan,
  createReplyToFanout,
  createRuntimeOutboundDelegates,
  projectOutboundPayloadPlanForDelivery,
  resolveAgentOutboundIdentity,
  resolveOutboundSendDep,
  sanitizeForPlainText,
} from "./channel-outbound.js";
export type {
  OutboundDeliveryFormattingOptions,
  OutboundIdentity,
  OutboundSendDeps,
  OutboundSessionContext,
  ReplyToResolution,
} from "./channel-outbound.js";

export { deliverOutboundPayloads } from "../infra/outbound/deliver.js";
export type { DeliverOutboundPayloadsParams } from "../infra/outbound/deliver.js";
export { type OutboundDeliveryResult } from "../infra/outbound/deliver.js";
