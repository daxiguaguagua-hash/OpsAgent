import {
  API_ERROR_CODE,
  API_MESSAGE,
} from "./constants";

export class DemoForcedFailureError extends Error {
  readonly code = API_ERROR_CODE.DEMO_FORCED_FAILURE;

  constructor() {
    super(API_MESSAGE.DEMO_FORCED_FAILURE);
  }
}
