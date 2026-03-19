import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Breadcrumb } from "antd";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
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

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const activeMenu = location.pathname.startsWith("/settings")
    ? "settings"
    : location.pathname.startsWith("/dem")
      ? "dem"
      : location.pathname.startsWith("/projects")
        ? "projects"
        : "home";

  const isProjectDetail = location.pathname.startsWith("/projects/");

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
            <Link to="/projects" className="header-link">
              프로젝트
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

    if (activeMenu === "projects") {
      return [{ title: "프로젝트" }];
    }

    return [{ title: "홈" }];
  }, [activeMenu, currentProject, isProjectDetail]);

  return (
    <AppShell
      activeMenu={activeMenu}
      onMenuChange={(key) =>
        navigate(
          key === "settings"
            ? "/settings"
            : key === "dem"
              ? "/dem"
              : key === "projects"
                ? "/projects"
                : "/"
        )
      }
      headerTitle={<Breadcrumb className="header-breadcrumb" items={breadcrumbItems} />}
      contentClassName={activeMenu === "dem" ? "page page-dem" : "page"}
    >
      <Suspense fallback={<div className="page" />}>
        <Routes>
          <Route path="/" element={<HomaPage />} />
          <Route path="/home" element={<HomaPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route
            path="/projects/:id"
            element={<ProjectDetailPage onProjectLoaded={setCurrentProject} />}
          />
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
