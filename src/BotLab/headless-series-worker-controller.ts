import {
  headlessAutomationConsumer,
  type BuiltInAutomationSeriesPlan,
} from "./headless-automation-consumer";
import type {
  HeadlessSeriesCommand,
  HeadlessSeriesRun,
} from "./headless-series-runner";

export type BrowserSeriesRequest =
  | { type: "start"; plan: BuiltInAutomationSeriesPlan }
  | { type: "command"; command: HeadlessSeriesCommand };

export type BrowserSeriesEvent =
  | { type: "snapshot"; snapshot: ReturnType<HeadlessSeriesRun["getSnapshot"]> }
  | { type: "result"; receipt: Awaited<HeadlessSeriesRun["result"]> }
  | { type: "error"; error: string };

export interface BrowserSeriesPort {
  post(event: BrowserSeriesEvent): void;
}

export interface BrowserSeriesStarter {
  runBuiltInSeries(plan: BuiltInAutomationSeriesPlan): HeadlessSeriesRun;
}

export interface HeadlessSeriesWorkerController {
  handle(request: BrowserSeriesRequest): void;
  dispose(): void;
}

export function createHeadlessSeriesWorkerController(
  port: BrowserSeriesPort,
  starter: BrowserSeriesStarter = headlessAutomationConsumer,
): HeadlessSeriesWorkerController {
  let activeExecution: HeadlessSeriesRun | null = null;
  let unsubscribe: (() => void) | null = null;
  let disposed = false;

  const cleanup = (): void => {
    unsubscribe?.();
    unsubscribe = null;
    activeExecution = null;
  };

  const postError = (error: string): void => {
    if (!disposed) port.post({ type: "error", error });
  };

  const handle = (request: BrowserSeriesRequest): void => {
    if (disposed) return;
    if (request.type === "command") {
      if (!activeExecution) {
        postError("no_active_headless_series");
        return;
      }
      activeExecution.dispatch(request.command);
      return;
    }

    if (activeExecution) {
      postError("headless_series_already_active");
      return;
    }

    try {
      const execution = starter.runBuiltInSeries(request.plan);
      activeExecution = execution;
      unsubscribe = execution.subscribe((snapshot) => {
        if (!disposed) port.post({ type: "snapshot", snapshot });
      });
      void execution.result
        .then((receipt) => {
          cleanup();
          if (!disposed) port.post({ type: "result", receipt });
        })
        .catch((error: unknown) => {
          cleanup();
          const message = error instanceof Error ? error.message : "unknown_series_worker_error";
          postError(message);
        });
    } catch (error) {
      cleanup();
      const message = error instanceof Error ? error.message : "invalid_series_worker_request";
      postError(message);
    }
  };

  return {
    handle,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      activeExecution?.dispatch("cancel");
      cleanup();
    },
  };
}
