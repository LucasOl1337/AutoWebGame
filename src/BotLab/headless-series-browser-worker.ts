import {
  createHeadlessSeriesWorkerController,
  type BrowserSeriesEvent,
  type BrowserSeriesRequest,
} from "./headless-series-worker-controller";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BrowserSeriesRequest>) => void) | null;
  postMessage(event: BrowserSeriesEvent): void;
};

const controller = createHeadlessSeriesWorkerController({
  post: (event) => scope.postMessage(event),
});

scope.onmessage = (event): void => {
  controller.handle(event.data);
};
