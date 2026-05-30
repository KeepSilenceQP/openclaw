import { createProjectShardVitestConfig } from "./vitest.project-shard-config.ts";
import { fullSuiteVitestShards } from "./vitest.test-shards.mjs";

/** Default full core unit shard Vitest configuration. */
export default createProjectShardVitestConfig(fullSuiteVitestShards[0].projects);
