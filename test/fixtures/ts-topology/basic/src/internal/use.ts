import { sharedThing } from "fixture-sdk";

/** Internal fixture consumer used by topology boundary tests. */
export function internalUse() {
  return sharedThing();
}
