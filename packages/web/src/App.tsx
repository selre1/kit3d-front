import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Breadcrumb } from "antd";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import {
  DEFAULT_MODEL_TYPE,
  MODEL_TYPES,
  resolveModelType,
  resolveModelTypeByMenuKey,
} from "./config/modelTypes";
import type { Project } from "./types/project";
import "./App.css";

const HomaPage = lazy(() =>
  import("./pages/home/HomePage").then((module) => ({ default: module.HomaPage }))
);
const ProjectsPage = lazy(() =>
  import("./pages/Projects/ProjectsPage").then((module) => ({ default: module.ProjectsPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/Settings/SettingsPage").then((module) => ({ default: module.SettingsPage }))
);
const ProjectDetailPage = lazy(() =>
  import("./pages/Projects/ProjectDetail/ProjectDetailPage").then((module) => ({
    default: module.ProjectDetailPage,
  }))
);
const DemPage = lazy(() =>
  import("./pages/Dem/DemPage").then((module) => ({ default: module.DemPage }))
);

/** 기존 /projects/:id 링크를 기본 모델 타입 경로로 넘겨준다. */
function LegacyProjectRedirect() {
  const { id } = useParams();
  const base = MODEL_TYPES[DEFAULT_MODEL_TYPE].basePath;
  return <Navigate to={id ? `${base}/${id}` : base} replace />;
}

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const modelTypeSegment = location.pathname.startsWith("/models/")
    ? location.pathname.split("/")[2]
    : null;
  const modelType = useMemo(() => resolveModelType(modelTypeSegment), [modelTypeSegment]);

  const activeMenu = location.pathname.startsWith("/settings")
    ? "settings"
    : location.pathname.startsWith("/dem")
      ? "dem"
      : location.pathname.startsWith("/models")
        ? modelType.menuKey
        : "home";

  const isModelSection = location.pathname.startsWith("/models");
  const isProjectDetail = isModelSection && location.pathname.split("/").length > 3;

  useEffect(() => {
    if (!isProjectDetail) {
      setCurrentProject(null);
    }
  }, [isProjectDetail]);

  const breadcrumbItems = useMemo(() => {
    if (isProjectDetail) {
      return [
        {
          title: (
            <Link to={modelType.basePath} className="header-link">
              {modelType.label}
            </Link>
          ),
        },
        {
          title: currentProject?.name ?? "",
        },
      ];
    }

    if (activeMenu === "settings") {
      return [{ title: "설정" }];
    }

    if (activeMenu === "dem") {
      return [{ title: "지형" }];
    }

    if (isModelSection) {
      return [{ title: modelType.label }];
    }

    return [{ title: "홈" }];
  }, [activeMenu, currentProject, isModelSection, isProjectDetail, modelType]);

  return (
    <AppShell
      activeMenu={activeMenu}
      onMenuChange={(key) => {
        const picked = resolveModelTypeByMenuKey(key);
        if (picked) {
          navigate(picked.basePath);
          return;
        }
        navigate(key === "settings" ? "/settings" : key === "dem" ? "/dem" : "/");
      }}
      headerTitle={<Breadcrumb className="header-breadcrumb" items={breadcrumbItems} />}
      contentClassName={
        activeMenu === "dem" ? "page page-dem" : activeMenu === "home" ? "page page-home" : "page"
      }
    >
      <Suspense fallback={<div className="page" />}>
        <Routes>
          <Route path="/" element={<HomaPage />} />
          <Route path="/home" element={<HomaPage />} />
          <Route path="/models" element={<Navigate to={MODEL_TYPES[DEFAULT_MODEL_TYPE].basePath} replace />} />
          <Route path="/models/:modelType" element={<ProjectsPage />} />
          <Route
            path="/models/:modelType/:id"
            element={<ProjectDetailPage onProjectLoaded={setCurrentProject} />}
          />
          {/* 예전 경로 호환 */}
          <Route
            path="/projects"
            element={<Navigate to={MODEL_TYPES[DEFAULT_MODEL_TYPE].basePath} replace />}
          />
          <Route path="/projects/:id" element={<LegacyProjectRedirect />} />
          <Route path="/dem" element={<DemPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
