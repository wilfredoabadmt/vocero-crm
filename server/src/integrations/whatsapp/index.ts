import { config } from '../../config.js';
import type { GraphApiClient } from './graph-client.js';
import { RealGraphClient } from './graph-client.js';
import { SimulatedGraphClient } from './mock-client.js';

let client: GraphApiClient | null = null;

export function getGraphClient(): GraphApiClient {
  if (!client) client = config.SIMULATION_MODE ? new SimulatedGraphClient() : new RealGraphClient();
  return client;
}

export { verifyWebhookSignature, GraphApiError } from './graph-client.js';
export { parseWebhook, describeMetaError } from './parser.js';
export { dispatchWebhook, registerWebhookDispatcher } from './dispatcher.js';
export type * from './types.js';
