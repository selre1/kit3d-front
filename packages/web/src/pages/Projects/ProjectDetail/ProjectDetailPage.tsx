import { useEffect, useMemo, useState } from "react";
import { Tabs } from "antd";
import {DatabaseFilled, SwapOutlined} from "@ant-design/icons";
import { useParams, useSearchParams } from "react-router-dom";

import { apiGet } from "../../../tools/api";
import type { Project } from "../../../types/project";
import { ProjectConversionTab } from "./tab/ProjectConversionTab";
import { ProjectImportTab } from "./tab/ProjectImportTab";

type ProjectDetailPageProps = {
  onProjectLoaded?: (project: Project | null) => void;
};

export function ProjectDetailPage({ onProjectLoaded }: ProjectDetailPageProps) {
  const { id } = useParams();
  const projectId = useMemo(() => id ?? "", [id]);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey =
    searchParams.get("tab") === "conversion" ? "conversion" : "import";
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onProjectLoaded?.(null);
    if (!projectId) return;
    let active = true;
    setLoading(true);
    apiGet<Project[]>("/api/v1/project/list")
      .then((data) => {
        if (!active) return;
        const found = data.find((item) => item.project_id === projectId) || null;
        setProject(found);
        onProjectLoaded?.(found);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, onProjectLoaded]);

  return (
    <>
      {/* <div className="page-title">{project?.name}</div> */}
      {/* <div className="page-subtitle">{project?.description || "No description"}</div> */}


        <Tabs
          activeKey={activeKey}
          type="card"
          //centered
          onChange={(key) => {
            const next = new URLSearchParams(searchParams);
            next.set("tab", key);
            setSearchParams(next, { replace: true });
          }}
          items={[
            {
              key: "import",
              label: "임포트",
              children: (
                <ProjectImportTab
                  projectId={projectId}
                  loading={loading}
                  isActive={activeKey === "import"}
                />
              ),
              icon: <DatabaseFilled/>
            },
            {
              key: "conversion",
              label: "변환",
              children: <ProjectConversionTab projectId={projectId} />,
              icon: <SwapOutlined />
            },
          ]}
        />
    
    </>
  );
}
