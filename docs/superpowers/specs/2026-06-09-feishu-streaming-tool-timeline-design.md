# Feishu Streaming Tool Timeline Design

Date: 2026-06-09

Status: implemented and accepted locally on 2026-06-09.

## Goal

Fix the local Feishu/Lark CardKit streaming reply experience so a tool-using OpenClaw run renders as one streaming card, with tool calls, optional model reasoning, and final answer preserved in chronological order.

The desired card content is an ordered timeline:

```markdown
> 🛠 Tool call 1

Reasoning text from the model, if the provider emits visible reasoning.

> 🛠 Tool call 2

More visible reasoning, if emitted.

Final answer text.
```

If the provider does not emit visible reasoning, the card still shows tool calls and answer text:

```markdown
> 🛠 Tool call 1

> 🛠 Tool call 2

Final answer text.
```

The fix must preserve Feishu streaming behavior: partial answer text should continue updating the same CardKit card while the run is in progress. Tool display must not force the reply to wait until final completion.

## Current Behavior

The local OpenClaw Feishu plugin currently has two separate progress paths:

1. `extensions/feishu/src/reply-dispatcher.ts` keeps a transient `statusLine` and appends it in `buildCombinedStreamText(reasoningText, streamText)` while the streaming card is active.
2. `src/auto-reply/reply/dispatch-from-config.ts` sends default verbose tool summary payloads as visible `kind: "tool"` replies when verbose progress is enabled.

This produces the current bad UX:

- The final answer is closed as one CardKit card.
- Tool progress summary can be delivered as a second visible card.
- Tool status shown during streaming is intentionally omitted from final close. The existing Feishu test `shows shared transient tool status on streaming cards but omits it from the final close` codifies this behavior.

This is not a user configuration issue for the target UX. Feishu needs to own progress rendering and suppress the default verbose tool-message path, matching the channel-owned progress pattern used by other channels.

## Non-Goals

- Do not change the common `dispatch-from-config` default tool delivery behavior.
- Do not change Feishu CardKit transport or the existing streaming-card content preservation fix.
- Do not synthesize reasoning text. Reasoning is displayed only when the model/provider emits visible reasoning stream callbacks.
- Do not show message-like tools such as `message`, `reply`, `send`, `typing`, or reactions as work progress.
- Do not add a new user-facing config switch for this hotfix. It applies when Feishu CardKit streaming is active and verbose progress callbacks are enabled by existing configuration.

## Proposed Design

Replace Feishu's three-part rendering model:

- `reasoningText`
- `streamText`
- transient `statusLine`

with an ordered stream model inside `createFeishuReplyDispatcher`.

The dispatcher should maintain a small ordered list of render blocks. A block represents one of:

- `tool`: a markdown quote line produced from the existing channel progress formatter.
- `reasoning`: visible reasoning text emitted by `onReasoningStream`.
- `answer`: assistant answer text emitted by `onPartialReply`, block streaming fallback, or final payload.

Every Feishu streaming-card update renders the full block list into markdown and calls `streaming.update(renderedText)`. The final `close()` call renders the same block list, so the final card preserves tool calls, reasoning, and answer in the same order seen during streaming.

### Block Rendering

Tool blocks render as markdown quote blocks:

```markdown
> 🛠 run sleep 8
```

The text should come from `formatChannelProgressDraftLineForEntry(...)` so existing command formatting, `toolProgressDetail`, and Feishu channel config remain respected.

Reasoning blocks render as plain visible reasoning text. They should not show a synthetic heading when no reasoning exists. If the existing `formatReasoningMessage(...)` adds useful formatting, keep it, but preserve event order instead of moving reasoning to the top.

Answer blocks render as normal markdown answer text.

Blocks are separated by blank lines.

### Event Ordering

Ordering is based on callback arrival order in Feishu dispatcher:

1. `onToolStart` appends a `tool` block immediately when a work tool starts.
2. `onReasoningStream` appends or updates the current `reasoning` block when visible reasoning text arrives.
3. `onPartialReply` appends or updates the current `answer` block as answer text streams in.
4. Final `deliver(..., { kind: "final" })` updates the current answer block to the final answer text, without deleting prior tool or reasoning blocks.

If a new tool starts after answer text has begun, append a new `tool` block after the current answer block. Later answer or reasoning content appears after that tool block.

### Streaming Preservation

The existing streaming path must remain active:

- `onPartialReply` still starts streaming if needed.
- Each meaningful partial update still calls `streaming.update(...)`.
- Tool blocks can start the streaming card before answer text exists when `renderMode === "card"`.
- Final close must use the fully rendered block list, not only the last text fragment.

This keeps the "one card updates in place" experience for both tool progress and model output.

### Suppressing Duplicate Tool Cards

When Feishu owns progress rendering, its `replyOptions` should include:

```ts
suppressDefaultToolProgressMessages: true;
```

This uses the existing dispatch behavior where channel-owned progress callbacks are still forwarded for `requiresToolSummaryVisibility`, while default verbose tool summary messages are not separately delivered.

The suppression should be enabled only when Feishu streaming progress can be represented in the card. For this hotfix, that means `streamingEnabled` is true and `renderMode === "card"` or streaming card rendering is otherwise active for the current reply.

Acceptance clarified that global `verboseDefault` may remain `on`. In that case, Feishu card streaming still owns tool progress for this turn: core default tool-summary cards must be suppressed while Feishu continues receiving `onToolStart` and related progress callbacks. The implemented dispatch rule therefore treats `suppressDefaultToolProgressMessages: true` plus channel-owned progress callbacks as a request to turn off the default summary path for that run, without changing the user's global verbose setting.

## Error Handling

- If streaming start fails and Feishu falls back to non-streaming replies, do not create extra tool cards as part of this hotfix. Preserve existing streaming-start backoff and fallback behavior.
- If only tool blocks exist and no answer or reasoning arrives, the rendered card may contain only quoted tool lines. Existing no-visible-reply fallback logic should still protect truly empty cards.
- If final text arrives after partial text, update the current answer block to the final text and retain all earlier tool and reasoning blocks.
- If an error final arrives after streamed answer text, preserve the existing answer text and append the error text after it. A tool-error final must not replace the answer block or leave the card containing only tool/error status.
- If a tool formatter returns no visible line, skip that tool block.
- If the tool name is not a work tool according to `isChannelProgressDraftWorkToolName`, skip it.
- If streaming close throws, preserve existing cleanup and retry behavior. The new block model must not leave stale blocks leaking into the next reply.

## Tests

Update `extensions/feishu/src/reply-dispatcher.test.ts`.

Required coverage:

- A work tool shown through `onToolStart` appears as a markdown quote block in streaming updates and remains in the final `close()` text.
- Multiple tools render in callback order as multiple quote blocks.
- `onPartialReply` after a tool call still triggers streaming updates and grows the answer block in the same card.
- Visible reasoning appears only when `onReasoningStream` is called and remains in callback order between tool and answer blocks.
- Without reasoning callbacks, the final card contains tool quote blocks and answer text with no empty Thinking heading.
- Message-like tools continue to be omitted.
- Feishu reply options set `suppressDefaultToolProgressMessages: true` when streaming card progress is owned by Feishu.
- Default verbose tool summaries are not delivered as a second card when Feishu streaming progress is active.
- Existing final text preservation behavior remains intact: final close uses the complete rendered content, not a suffix or delta fragment.
- Tool-error final payloads preserve previously streamed answer text and append the error instead of overwriting the card body.

Suggested verification commands:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts
pnpm exec vitest run extensions/feishu/src/streaming-card.test.ts
pnpm tsgo:extensions:test
```

## Rollout Plan

1. Implement the ordered block renderer in Feishu dispatcher source.
2. Update Feishu dispatcher tests to encode the timeline behavior.
3. Run targeted Feishu tests and extension type checks.
4. Patch or rebuild the locally installed Feishu plugin dist, with a backup of the installed package before writing.
5. Restart OpenClaw gateway.
6. Re-run the Feishu prompt that performs a visible long-running shell command and verify:
   - one streaming CardKit card is created,
   - tool quote lines appear inside that card,
   - answer text continues streaming,
   - final card preserves tool quote lines and final answer,
   - no second tool-summary card appears.
7. Re-run a prompt with an intentional failing tool call and verify:
   - the tool failure is visible in the same streaming card,
   - the prior answer/summary text remains visible,
   - no second tool-summary card appears.

## Open Questions

None. The selected behavior is:

- Use the ordered event-stream block approach.
- Show tool calls even when reasoning is absent.
- Keep final answer and partial answer streaming behavior.
- Preserve everything in one Feishu CardKit streaming card.

## Accepted Outcome

Local acceptance on 2026-06-09 confirmed:

- Feishu CardKit streaming displays multiple tool calls as markdown quote lines inside one card.
- The default verbose tool-summary card is suppressed when Feishu owns streaming progress, even when verbose is enabled.
- Tool-error final payloads no longer overwrite the streamed answer body; the answer remains visible and the error is appended.
- The local runtime was rebuilt, installed, restarted, and validated through Feishu manual testing.
