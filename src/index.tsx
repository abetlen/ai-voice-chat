import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const container = document.getElementById("app");
const root = createRoot(container as HTMLElement);
root.render(<App />);

navigator.serviceWorker.register(
  new URL("service-worker.js", import.meta.url),
  { type: "module", scope: "." }
);