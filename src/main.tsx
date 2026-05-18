import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import App from "./App.tsx";
import "./index.css";

document.documentElement.classList.add("dark");
document.documentElement.style.setProperty("--font-sans", '"Geist Sans", ui-sans-serif, system-ui, sans-serif');
document.documentElement.style.setProperty("--font-mono", '"Geist Mono", ui-monospace, Menlo, monospace');

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
