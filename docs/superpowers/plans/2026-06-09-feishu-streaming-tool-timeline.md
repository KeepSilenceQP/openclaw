# Feishu Streaming Tool Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Feishu CardKit streaming replies as one chronological card containing tool quote blocks, optional visible reasoning, and streamed/final answer text.

**Status:** Implemented and accepted locally on 2026-06-09.

**Architecture:** Replace the Feishu dispatcher's current `reasoningText + streamText + transient statusLine` renderer with a small ordered block list local to `createFeishuReplyDispatcher`. Tool, reasoning, and answer callbacks update that block list and re-render the full card for both `streaming.update(...)` and final `streaming.close(...)`; Feishu also suppresses default verbose tool-summary cards while preserving channel-owned progress callbacks.

**Tech Stack:** TypeScript, Vitest, OpenClaw Feishu channel plugin, Feishu CardKit streaming session, existing OpenClaw channel progress formatter.

---

## File Structure

- Modify `extensions/feishu/src/reply-dispatcher.ts`
  - Own the ordered streaming-card render model inside `createFeishuReplyDispatcher`.
  - Keep the existing Feishu transport, typing, fallback, and media behavior intact.
  - Keep the existing `mergeStreamingText(...)` snapshot/delta behavior for answer text so the prior streaming-card content preservation fix is not regressed.
  - Do not depend on `onToolResult` for timeline rendering; common dispatch only invokes that callback while default summaries are enabled, so Feishu's timeline should be driven by `onToolStart` plus answer/reasoning callbacks.
- Modify `extensions/feishu/src/reply-dispatcher.test.ts`
  - Replace the existing transient status test with persistent timeline assertions.
  - Add ordering, no-reasoning, message-like tool filtering, and duplicate-summary suppression coverage.
- Modify `src/auto-reply/reply/dispatch-from-config.ts`
  - Acceptance showed that `suppressDefaultToolProgressMessages` alone was not enough while verbose was enabled.
  - When a channel provides its own progress callbacks and sets `suppressDefaultToolProgressMessages: true`, dispatch must suppress default verbose tool-summary cards for that run while still forwarding channel-owned callbacks.
- Do not modify `extensions/feishu/src/streaming-card.ts`
  - The previously applied official content preservation fix remains transport-level behavior.

## Task 1: Encode Persistent Tool Timeline Behavior

**Files:**

- Modify: `extensions/feishu/src/reply-dispatcher.test.ts:1529-1554`

- [ ] **Step 1: Replace the transient tool-status test with the desired final-card behavior**

In `extensions/feishu/src/reply-dispatcher.test.ts`, replace:

```ts
it("shows shared transient tool status on streaming cards but omits it from the final close", async () => {
```

with:

```ts
it("keeps tool call quote blocks in the streaming card final close", async () => {
```

Then replace the assertions at the end of that test with:

```ts
const updateTexts = streamingUpdateTexts();
expect(updateTexts.join("\n")).toContain("> 🔎 Web Search");
expect(updateTexts.at(-1)).toContain("final answer");
expect(streamingInstances[0].close).toHaveBeenCalledWith("> 🔎 Web Search\n\nfinal answer", {
  note: "Agent: agent",
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the current implementation**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "keeps tool call quote blocks in the streaming card final close"
```

Expected: FAIL because the current implementation closes with only `"final answer"` and omits the tool status.

- [ ] **Step 3: Commit only the failing test**

```bash
git add extensions/feishu/src/reply-dispatcher.test.ts
git commit -m "test(feishu): expect tool timeline in streaming card"
```

## Task 2: Implement Ordered Streaming Blocks

**Files:**

- Modify: `extensions/feishu/src/reply-dispatcher.ts:238-455`

- [ ] **Step 1: Add local stream block types and state**

Near the existing streaming state declarations, replace the old top-level reasoning/status state:

```ts
let reasoningText = "";
let statusLine = "";
```

with:

```ts
type StreamBlockKind = "tool" | "reasoning" | "answer";
type StreamBlock = {
  kind: StreamBlockKind;
  text: string;
};

let streamBlocks: StreamBlock[] = [];
let activeReasoningBlock: StreamBlock | undefined;
let activeAnswerBlock: StreamBlock | undefined;
let answerSegmentBaseText = "";
```

Keep the existing `streamText`, `lastPartial`, `snapshotBaseText`, and `lastSnapshotTextLength` variables. They remain the source of truth for answer merge behavior.

- [ ] **Step 2: Replace the combined renderer with block helpers**

Replace `formatReasoningPrefix(...)` and `buildCombinedStreamText(...)` with:

```ts
const normalizeQuoteBlock = (text: string): string =>
  text
    .split("\n")
    .map((line) => (line.startsWith(">") ? line : `> ${line}`))
    .join("\n");

const appendStreamBlock = (kind: StreamBlockKind, text: string): StreamBlock | undefined => {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  const block = { kind, text: trimmed };
  streamBlocks.push(block);
  return block;
};

const renderStreamBlocks = (): string =>
  streamBlocks
    .map((block) => {
      if (block.kind === "tool") {
        return normalizeQuoteBlock(block.text);
      }
      return block.text;
    })
    .filter(Boolean)
    .join("\n\n");

const resolveCurrentAnswerSegmentText = (): string => {
  if (!answerSegmentBaseText) {
    return streamText;
  }
  if (streamText.startsWith(answerSegmentBaseText)) {
    return streamText.slice(answerSegmentBaseText.length).trimStart();
  }
  return streamText;
};

const updateReasoningBlock = (text: string): StreamBlock | undefined => {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  if (activeReasoningBlock && streamBlocks.includes(activeReasoningBlock)) {
    activeReasoningBlock.text = trimmed;
    return activeReasoningBlock;
  }
  activeReasoningBlock = appendStreamBlock("reasoning", trimmed);
  return activeReasoningBlock;
};

const updateAnswerBlock = (): StreamBlock | undefined => {
  const trimmed = resolveCurrentAnswerSegmentText().trim();
  if (!trimmed) {
    return undefined;
  }
  if (activeAnswerBlock && streamBlocks.includes(activeAnswerBlock)) {
    activeAnswerBlock.text = trimmed;
    return activeAnswerBlock;
  }
  activeAnswerBlock = appendStreamBlock("answer", trimmed);
  return activeAnswerBlock;
};

const appendToolBlock = (text: string): StreamBlock | undefined => {
  activeReasoningBlock = undefined;
  activeAnswerBlock = undefined;
  answerSegmentBaseText = streamText;
  return appendStreamBlock("tool", text);
};
```

This keeps tool calls visually quoted while leaving visible reasoning and answer text as normal markdown.
`answerSegmentBaseText` prevents an answer block that appears after a tool call from duplicating answer text already rendered before that tool call.

- [ ] **Step 3: Update all streaming update calls to render from blocks**

In `queueStreamingUpdate(...)`, keep the existing merge logic through `streamText`, then replace:

```ts
flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
```

with:

```ts
updateAnswerBlock();
flushStreamingCardUpdate(renderStreamBlocks());
```

In `queueReasoningUpdate(...)`, replace the body:

```ts
reasoningText = nextThinking;
flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
```

with:

```ts
updateReasoningBlock(nextThinking);
flushStreamingCardUpdate(renderStreamBlocks());
```

- [ ] **Step 4: Update final close to preserve the rendered timeline**

In `closeStreaming(...)`, replace:

```ts
statusLine = "";
const text = buildCombinedStreamText(reasoningText, streamText);
```

with:

```ts
const text = renderStreamBlocks();
```

Do not change the `deliveredFinalTexts.add(streamText)` logic; it should continue to dedupe the raw final answer text, not the rendered timeline.

- [ ] **Step 5: Reset block state during cleanup**

In `resetStreamingState()`, replace:

```ts
reasoningText = "";
statusLine = "";
```

with:

```ts
streamBlocks = [];
activeReasoningBlock = undefined;
activeAnswerBlock = undefined;
answerSegmentBaseText = "";
```

- [ ] **Step 6: Replace status-line updates with tool block updates**

Replace `updateStreamingStatusLine(...)` with:

```ts
const appendStreamingToolLine = (nextStatusLine: string, options?: { startIfNeeded?: boolean }) => {
  if (!nextStatusLine.trim()) {
    return;
  }
  const hasStreamingSession = Boolean(streaming?.isActive() || streamingStartPromise);
  if (!hasStreamingSession && (options?.startIfNeeded === false || renderMode !== "card")) {
    return;
  }
  appendToolBlock(nextStatusLine);
  startStreaming();
  flushStreamingCardUpdate(renderStreamBlocks());
};
```

## Task 2.5: Suppress Default Tool Cards When Feishu Owns Progress

**Files:**

- Modify: `src/auto-reply/reply/dispatch-from-config.ts`
- Modify: `src/auto-reply/reply/dispatch-from-config.test.ts`

- [x] **Step 1: Encode channel-owned progress suppression**

Add/adjust coverage so that when `suppressDefaultToolProgressMessages: true` is paired with a channel progress callback such as `onToolStart`, default tool-summary delivery is suppressed even if verbose becomes enabled during the run.

- [x] **Step 2: Preserve channel callbacks**

Verify `onToolStart` still fires in the same scenario, so Feishu can render tool progress inside the streaming card.

- [x] **Step 3: Keep legacy verbose override behavior outside channel-owned progress**

Run the full `dispatch-from-config.test.ts` suite to confirm existing Slack/Telegram preview-suppression behavior still passes when no channel-owned callback is present.

Verification:

```bash
pnpm exec vitest run src/auto-reply/reply/dispatch-from-config.test.ts
```

Result: `190 passed`.

## Task 2.6: Preserve Answer Text When Tool Error Final Arrives

**Files:**

- Modify: `extensions/feishu/src/reply-dispatcher.ts`
- Modify: `extensions/feishu/src/reply-dispatcher.test.ts`

- [x] **Step 1: Reproduce the overwrite**

Add a test where a tool line and streamed answer text are already in the card, then an `isError` final payload arrives. The failing behavior was that the final close contained only the tool line and error text, dropping the answer.

- [x] **Step 2: Append error finals instead of replacing existing answer text**

For `payload.isError === true`, preserve existing `streamText` and append the error text when the incoming error text is distinct. Keep normal final payload behavior unchanged.

- [x] **Step 3: Verify Feishu dispatcher**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts
```

Result: `85 passed`.

Then update the `onToolStart` callback to call:

```ts
appendStreamingToolLine(statusLineLocal);
```

instead of `updateStreamingStatusLine(statusLineLocal)`.

- [ ] **Step 7: Stop clearing tool state on assistant message boundaries**

Change `onAssistantMessageStart` from:

```ts
onAssistantMessageStart: streamingEnabled
  ? () => {
      updateStreamingStatusLine("", { startIfNeeded: false });
    }
  : undefined,
```

to:

```ts
onAssistantMessageStart: undefined,
```

Leave compaction callbacks to be addressed in Task 6 so the first behavior change stays focused on tool/answer timeline.

- [ ] **Step 8: Update final payload handling to write the answer block**

In `deliver(...)`, inside:

```ts
if (info?.kind === "final") {
  streamText = text;
  snapshotBaseText = "";
  lastSnapshotTextLength = text.length;
  flushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
}
```

replace only the final flush with:

```ts
updateAnswerBlock();
flushStreamingCardUpdate(renderStreamBlocks());
```

- [ ] **Step 9: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "keeps tool call quote blocks in the streaming card final close"
```

Expected: PASS.

- [ ] **Step 10: Commit the implementation**

```bash
git add extensions/feishu/src/reply-dispatcher.ts
git commit -m "fix(feishu): keep tool timeline in streaming card"
```

## Task 3: Preserve Ordering for Multiple Tools, Reasoning, and Answer Text

**Files:**

- Modify: `extensions/feishu/src/reply-dispatcher.test.ts:1529-1584`
- Modify: `extensions/feishu/src/reply-dispatcher.ts:260-455`

- [ ] **Step 1: Add a multiple-tool ordering test**

Add this test after `keeps tool call quote blocks in the streaming card final close`:

```ts
it("renders multiple tool quote blocks in callback order", async () => {
  resolveFeishuAccountMock.mockReturnValue({
    accountId: "main",
    appId: "app_id",
    appSecret: "app_secret",
    domain: "feishu",
    config: {
      renderMode: "card",
      streaming: true,
    },
  });

  const { result, options } = createDispatcherHarness({
    runtime: createRuntimeLogger(),
  });
  await options.onReplyStart?.();
  result.replyOptions.onToolStart?.({ name: "web_search" });
  result.replyOptions.onPartialReply?.({ text: "first answer" });
  result.replyOptions.onToolStart?.({
    name: "exec",
    args: { command: "pnpm test -- --watch=false" },
    detailMode: "raw",
  });
  result.replyOptions.onPartialReply?.({ text: "second answer" });
  await options.onIdle?.();

  const closedText = streamingCloseText();
  expect(closedText).toContain("> 🔎 Web Search\n\nfirst answer\n\n");
  expect(closedText).toContain("> 🛠️ run tests, `pnpm test -- --watch=false`\n\nsecond answer");
  expect(closedText.indexOf("> 🔎 Web Search")).toBeLessThan(closedText.indexOf("first answer"));
  expect(closedText.indexOf("first answer")).toBeLessThan(closedText.indexOf("> 🛠️ run tests"));
  expect(closedText.indexOf("> 🛠️ run tests")).toBeLessThan(closedText.indexOf("second answer"));
});
```

- [ ] **Step 2: Add a reasoning-order test**

Add this test after the multiple-tool test:

```ts
it("renders visible reasoning only when reasoning callbacks arrive and preserves order", async () => {
  resolveFeishuAccountMock.mockReturnValue({
    accountId: "main",
    appId: "app_id",
    appSecret: "app_secret",
    domain: "feishu",
    config: {
      renderMode: "card",
      streaming: true,
    },
  });

  const { result, options } = createDispatcherHarness({
    runtime: createRuntimeLogger(),
    allowReasoningPreview: true,
  });
  await options.onReplyStart?.();
  result.replyOptions.onToolStart?.({ name: "web_search" });
  result.replyOptions.onReasoningStream?.({ text: "checking sources", isReasoning: true });
  result.replyOptions.onPartialReply?.({ text: "final answer" });
  await options.onIdle?.();

  const closedText = streamingCloseText();
  expect(closedText).toContain("> 🔎 Web Search");
  expect(closedText).toContain("checking sources");
  expect(closedText).toContain("final answer");
  expect(closedText.indexOf("> 🔎 Web Search")).toBeLessThan(
    closedText.indexOf("checking sources"),
  );
  expect(closedText.indexOf("checking sources")).toBeLessThan(closedText.indexOf("final answer"));
});
```

- [ ] **Step 3: Add a no-reasoning assertion to the existing final-card test**

In `keeps tool call quote blocks in the streaming card final close`, after reading `updateTexts`, add:

```ts
expect(streamingCloseText()).not.toContain("Thinking");
```

- [ ] **Step 4: Run the new tests and verify the ordered block behavior**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "tool quote blocks|visible reasoning"
```

Expected at this point: PASS. If it fails, continue to Step 5 and fix the ordered block helpers before committing.

- [ ] **Step 5: Fix ordering bugs if the tests fail**

If answer text is duplicated around a tool block, inspect `answerSegmentBaseText` first. The expected behavior is:

```ts
appendToolBlock(statusLineLocal);
// appendToolBlock records the current raw streamText as answerSegmentBaseText.
// Later updateAnswerBlock() renders only the streamText suffix that appears
// after answerSegmentBaseText when the stream still has that prefix.
```

Do not fix duplication by resetting the raw `streamText`; it is still needed for final-text dedupe and the existing streaming merge behavior.

- [ ] **Step 6: Run the ordering tests until they pass**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "tool quote blocks|visible reasoning"
```

Expected: PASS.

- [ ] **Step 7: Commit ordering coverage and fixes**

```bash
git add extensions/feishu/src/reply-dispatcher.ts extensions/feishu/src/reply-dispatcher.test.ts
git commit -m "test(feishu): cover streaming tool timeline ordering"
```

## Task 4: Suppress Duplicate Default Tool Cards

**Files:**

- Modify: `extensions/feishu/src/reply-dispatcher.ts:778-856`
- Modify: `extensions/feishu/src/reply-dispatcher.test.ts`

- [ ] **Step 1: Add a direct replyOptions assertion**

Add this test near the streaming tool tests:

```ts
it("suppresses default verbose tool messages when streaming card owns tool progress", () => {
  resolveFeishuAccountMock.mockReturnValue({
    accountId: "main",
    appId: "app_id",
    appSecret: "app_secret",
    domain: "feishu",
    config: {
      renderMode: "card",
      streaming: true,
    },
  });

  const { result } = createDispatcherHarness({
    runtime: createRuntimeLogger(),
  });

  expect(result.replyOptions.suppressDefaultToolProgressMessages).toBe(true);
});
```

Also add the negative-boundary test:

```ts
it("does not suppress default tool messages outside Feishu card streaming progress", () => {
  resolveFeishuAccountMock.mockReturnValueOnce({
    accountId: "main",
    appId: "app_id",
    appSecret: "app_secret",
    domain: "feishu",
    config: {
      renderMode: "raw",
      streaming: true,
    },
  });

  const rawResult = createDispatcherHarness({
    runtime: createRuntimeLogger(),
  }).result;

  expect(rawResult.replyOptions.suppressDefaultToolProgressMessages).toBeUndefined();

  resolveFeishuAccountMock.mockReturnValueOnce({
    accountId: "main",
    appId: "app_id",
    appSecret: "app_secret",
    domain: "feishu",
    config: {
      renderMode: "card",
      streaming: false,
    },
  });

  const nonStreamingResult = createDispatcherHarness({
    runtime: createRuntimeLogger(),
  }).result;

  expect(nonStreamingResult.replyOptions.suppressDefaultToolProgressMessages).toBeUndefined();
});
```

- [ ] **Step 2: Run the assertion and verify it fails**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "default tool messages"
```

Expected: FAIL because Feishu does not currently set `suppressDefaultToolProgressMessages`.

- [ ] **Step 3: Set the reply option when Feishu owns streaming progress**

In `createFeishuReplyDispatcher`, add:

```ts
const feishuOwnsStreamingProgress = streamingEnabled && renderMode === "card";
```

near:

```ts
const reasoningPreviewEnabled = streamingEnabled && params.allowReasoningPreview === true;
```

Then in the returned `replyOptions`, add:

```ts
...(feishuOwnsStreamingProgress ? { suppressDefaultToolProgressMessages: true } : {}),
```

immediately after `disableBlockStreaming`.

- [ ] **Step 4: Run the suppression assertion**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "default tool messages"
```

Expected: PASS.

- [ ] **Step 5: Run the focused tool timeline tests again**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "tool|progress"
```

Expected: PASS for Feishu tool-related tests.

- [ ] **Step 6: Commit duplicate-card suppression**

```bash
git add extensions/feishu/src/reply-dispatcher.ts extensions/feishu/src/reply-dispatcher.test.ts
git commit -m "fix(feishu): suppress duplicate tool progress cards"
```

## Task 5: Preserve Existing Streaming and Filtering Regressions

**Files:**

- Modify: `extensions/feishu/src/reply-dispatcher.test.ts`
- Inspect: `extensions/feishu/src/reply-dispatcher.ts`

- [ ] **Step 1: Update the raw command detail test final-close assertion**

In `shows raw command detail in streaming card tool status`, after:

```ts
expect(updateTexts.join("\n")).toContain("🛠️ run tests, `pnpm test -- --watch=false`");
```

add:

```ts
expect(streamingCloseText()).toContain(
  "> 🛠️ run tests, `pnpm test -- --watch=false`\n\nfinal answer",
);
```

- [ ] **Step 2: Keep message-like tool filtering strict**

In `omits message-like tools from streaming card status`, ensure the assertions include:

```ts
expect(streamingUpdateTexts().join("\n")).not.toContain("message");
expect(streamingCloseText()).toBe("final answer");
```

If the existing test does not produce final text, add:

```ts
result.replyOptions.onPartialReply?.({ text: "final answer" });
await options.onIdle?.();
```

before asserting `streamingCloseText()`.

- [ ] **Step 3: Run the filtering and raw-detail tests**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "raw command detail|message-like tools"
```

Expected: PASS.

- [ ] **Step 4: Run streaming regression tests around final preservation**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts -t "preserves previous generation blocks|coalesces distinct final payloads|skips exact duplicate final text|skips final text already closed"
```

Expected: PASS. These tests protect against reintroducing the prior streaming-card content loss or duplicate final delivery bugs.

- [ ] **Step 5: Fix any regression by keeping raw `streamText` dedupe intact**

If duplicate final delivery tests fail, verify that the implementation still records:

```ts
deliveredFinalTexts.add(streamText);
```

and that `streamingClosedForReply` is set only when the card close accepted content. Do not change duplicate detection to use `renderStreamBlocks()` because that would include tool/reasoning blocks and stop matching final answer payload text.

- [ ] **Step 6: Commit regression coverage**

```bash
git add extensions/feishu/src/reply-dispatcher.ts extensions/feishu/src/reply-dispatcher.test.ts
git commit -m "test(feishu): preserve streaming timeline regressions"
```

## Task 6: Handle Compaction Status Without Reintroducing Transient Tool State

**Files:**

- Modify: `extensions/feishu/src/reply-dispatcher.ts:846-854`
- Inspect: `extensions/feishu/src/reply-dispatcher.test.ts`

- [ ] **Step 1: Replace compaction callbacks with no-op or ordered quote blocks**

For the local hotfix, prefer no-op compaction callbacks to avoid mixing non-tool transient status into the tool timeline. Change:

```ts
onCompactionStart: streamingEnabled
  ? () => {
      updateStreamingStatusLine("📦 **Compacting context...**");
    }
  : undefined,
onCompactionEnd: streamingEnabled
  ? () => {
      updateStreamingStatusLine("");
    }
  : undefined,
```

to:

```ts
onCompactionStart: undefined,
onCompactionEnd: undefined,
```

- [ ] **Step 2: Search for remaining removed helper references**

Run:

```bash
rg -n "statusLine|reasoningText|buildCombinedStreamText|updateStreamingStatusLine|formatReasoningPrefix" extensions/feishu/src/reply-dispatcher.ts
```

Expected: no matches.

- [ ] **Step 3: Run TypeScript-adjacent focused tests**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit cleanup**

```bash
git add extensions/feishu/src/reply-dispatcher.ts
git commit -m "refactor(feishu): remove transient streaming status state"
```

## Task 7: Full Verification

**Files:**

- No source changes expected.

- [ ] **Step 1: Run Feishu dispatcher tests**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/reply-dispatcher.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Feishu streaming-card transport tests**

Run:

```bash
pnpm exec vitest run extensions/feishu/src/streaming-card.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run extension type checks**

Run:

```bash
pnpm tsgo:extensions:test
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat HEAD~4..HEAD
git diff HEAD~4..HEAD -- extensions/feishu/src/reply-dispatcher.ts extensions/feishu/src/reply-dispatcher.test.ts
```

Expected:

- `reply-dispatcher.ts` owns ordered stream blocks locally.
- `reply-dispatcher.test.ts` covers tool quote persistence, ordering, duplicate suppression, filtering, and streaming regressions.
- No changes to `dispatch-from-config.ts` or `streaming-card.ts` for this feature.

## Task 8: Local Installed Plugin Rollout

**Files:**

- Modify installed package outside repo only after tests pass:
  - `/Users/bytedance/.openclaw/npm/projects/openclaw-feishu-dc69f44688/node_modules/@openclaw/feishu/dist/monitor.account-BvKcwxaW.js`
- Backup under:
  - `/Users/bytedance/Documents/运维/backup/<timestamp>-openclaw-feishu-tool-timeline/`

- [ ] **Step 1: Back up the installed Feishu plugin package**

Run from `/Users/bytedance/Documents/运维`:

```bash
mkdir -p backup/20260609-openclaw-feishu-tool-timeline
cp -R /Users/bytedance/.openclaw/npm/projects/openclaw-feishu-dc69f44688/node_modules/@openclaw/feishu backup/20260609-openclaw-feishu-tool-timeline/feishu.before-tool-timeline
```

Expected: backup directory contains a full `feishu.before-tool-timeline` copy.

- [ ] **Step 2: Apply the source-equivalent patch to the installed dist**

Use the source implementation as the truth. Patch only the installed Feishu dist chunk that currently contains `createFeishuReplyDispatcher`:

```bash
rg -n "function createFeishuReplyDispatcher|createFeishuReplyDispatcher|statusLine|buildCombinedStreamText" /Users/bytedance/.openclaw/npm/projects/openclaw-feishu-dc69f44688/node_modules/@openclaw/feishu/dist
```

Expected: the active chunk is `/Users/bytedance/.openclaw/npm/projects/openclaw-feishu-dc69f44688/node_modules/@openclaw/feishu/dist/monitor.account-BvKcwxaW.js`.

Edit that chunk so it has the same ordered block behavior, duplicate suppression, and final close rendering as the TypeScript source.

- [ ] **Step 3: Syntax-check the patched installed chunk**

Run:

```bash
node --check /Users/bytedance/.openclaw/npm/projects/openclaw-feishu-dc69f44688/node_modules/@openclaw/feishu/dist/monitor.account-BvKcwxaW.js
```

Expected: no syntax errors.

- [ ] **Step 4: Restart OpenClaw gateway**

Run:

```bash
openclaw gateway restart
```

Expected: gateway restarts successfully and Feishu websocket reconnects in logs.

- [ ] **Step 5: Run the live Feishu prompt**

Send this prompt in Feishu:

```text
OpenClaw Feishu 工具时间线测试，标记：OC-FEISHU-TOOL-TIMELINE-20260609。请先调用一个耗时 shell：输出 start，sleep 8，再输出 done 和当前时间；然后总结执行结果。要求正常使用工具，不要只描述。
```

Expected in Feishu:

- one streaming CardKit card,
- at least one `> 🛠 ...` tool quote block inside that card,
- answer text continues streaming in the same card,
- final card preserves the tool quote block and final answer,
- no second tool-summary card appears.

- [ ] **Step 6: Inspect latest trajectory and gateway logs if live output differs**

Run:

```bash
rg -n "OC-FEISHU-TOOL-TIMELINE-20260609|tool.call|tool.result|streaming" /Users/bytedance/Documents/OpenClaw/state /Users/bytedance/Documents/OpenClaw/logs
```

Expected: trajectory contains tool call/result events for the live run, and Feishu logs show a single streaming card lifecycle.
