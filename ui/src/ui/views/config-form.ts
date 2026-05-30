// Public barrel for generated config-form rendering. Keep imports here narrow so
// callers do not need to know which split module owns analysis, shared schema
export { renderConfigForm, type ConfigFormProps, SECTION_META } from "./config-form.render.ts";
export { analyzeConfigSchema, type ConfigSchemaAnalysis } from "./config-form.analyze.ts";
export { renderNode } from "./config-form.node.ts";
export { schemaType, type JsonSchema } from "./config-form.shared.ts";
