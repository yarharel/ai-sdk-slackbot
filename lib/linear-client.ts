import { LinearClient } from "@linear/sdk";

let _linearClient: LinearClient | null = null;

export function getLinearClient(): LinearClient {
  if (!_linearClient) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) throw new Error("LINEAR_API_KEY not configured");
    _linearClient = new LinearClient({ apiKey });
  }
  return _linearClient;
}

export function _resetLinearClientForTesting() {
  _linearClient = null;
}