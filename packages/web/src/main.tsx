import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import "antd/dist/reset.css";

import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#2521ff",
          colorBgBase: "#0b0d13",
          colorText: "#e9eef8",
          colorTextSecondary: "#9aa6bf",
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>
);
