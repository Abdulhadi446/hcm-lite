// Minimal ambient types for node:sqlite.
// node_modules/@types/node@20 does not ship node:sqlite declarations yet;
// the module exists at runtime (Node >= 22.5, this repo runs Node 26).
// Remove this file if/when @types/node is upgraded past 22.5.
declare module "node:sqlite" {
  export type SqlValue = null | string | number | bigint | Uint8Array;
  export type RunResult = { changes: number | bigint; lastInsertRowid: number | bigint };

  export class StatementSync {
    run(...params: SqlValue[]): RunResult;
    get(...params: SqlValue[]): Record<string, SqlValue> | undefined;
    all(...params: SqlValue[]): Array<Record<string, SqlValue>>;
    iterate(...params: SqlValue[]): IterableIterator<Record<string, SqlValue>>;
  }

  export class DatabaseSync {
    constructor(location: string, options?: {
      open?: boolean;
      readOnly?: boolean;
      enableForeignKeyConstraints?: boolean;
      enableDoubleQuotedStringLiterals?: boolean;
      allowExtension?: boolean;
    });
    readonly open: boolean;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
    function(name: string, options: unknown, fn: (...args: unknown[]) => unknown): DatabaseSync;
    isTransaction: boolean;
  }
}
