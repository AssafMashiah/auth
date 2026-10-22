// Node stand-in for the Workers runtime module, so tests can import src/index.ts.
export class WorkerEntrypoint<Env = unknown> {
  constructor(protected ctx: unknown, protected env: Env) {}
}
