import { useEffect, useMemo, useState } from "react";
import { Tabs } from "antd";
import { RiDatabase2Fill, RiSwapLine } from "react-icons/ri";
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
  const activeKey = searchParams.get("tab") === "conversion" ? "conversion" : "import";
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
    <Tabs
      activeKey={activeKey}
      type="card"
      onChange={(key) => {
        const next = new URLSearchParams(searchParams);
        next.set("tab", key);
        setSearchParams(next, { replace: true });
      }}
      items={[
        {
          key: "import",
          label: "임포트",
          icon: <RiDatabase2Fill />,
          children: (
            <ProjectImportTab
              projectId={projectId}
              loading={loading}
              isActive={activeKey === "import"}
            />
          ),
        },
        {
          key: "conversion",
          label: "변환",
          icon: <RiSwapLine />,
          children: <ProjectConversionTab projectId={projectId} />,
        },
      ]}
    />
  );
}
