import { call } from "./nex.js";

export const prefs = {
  get: () => call("prefs.get"),
  set: (key, value) => call("prefs.set", { key, value }),
  location: () => call("prefs.location"),
  setLocation: (path) => call("prefs.setLocation", { path }),
};
