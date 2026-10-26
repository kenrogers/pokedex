/** main.tsx — starts the React app. Everything you see lives in App.tsx. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import App from "./App";
import { KeyGate } from "./components/KeyGate";
import { captureAccessPassword } from "./core/keys";

captureAccessPassword();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KeyGate>
      <App />
    </KeyGate>
  </StrictMode>,
);
