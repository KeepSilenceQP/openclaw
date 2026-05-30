// Shared value shapes for parsed chat command arguments.
export type CommandArgValue = string | number | boolean | bigint;
export type CommandArgValues = Record<string, CommandArgValue>;

export type CommandArgs = {
  raw?: string;
  values?: CommandArgValues;
};
