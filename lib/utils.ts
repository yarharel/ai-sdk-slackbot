import Exa from "exa-js";

let _exaInstance: Exa | null = null;

export function getExa(): Exa {
  if (!_exaInstance) {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      throw new Error("EXA_API_KEY environment variable is not set");
    }
    _exaInstance = new Exa(apiKey);
  }
  return _exaInstance;
}