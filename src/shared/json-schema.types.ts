// Shared types for shared json schema types behavior.
import type { TSchema } from "typebox";

export type JsonSchemaObject = TSchema & Record<string, unknown>;
