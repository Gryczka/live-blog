/**
 * Type declaration for the OpenNext worker
 * This file is generated at build time by OpenNext
 */
declare module '*.open-next/worker.js' {
  interface WorkerHandler {
    fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
  }

  const handler: WorkerHandler;
  export default handler;
}
