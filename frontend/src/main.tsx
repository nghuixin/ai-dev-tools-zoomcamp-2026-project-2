import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ApiContext, createApi } from "./services/api";
import "./index.css";

const api = createApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiContext.Provider value={api}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApiContext.Provider>
  </StrictMode>,
);
