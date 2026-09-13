import { useEffect, useMemo, useState } from "react";
import { Tabs } from "antd";
import { ImportOutlined, SwapOutlined } from "@ant-design/icons";
import { useParams, useSearchParams } from "react-router-dom";

import { resolveModelType } from "../../../config/modelTypes";
import { apiGet } from "../../../tools/api";
import type { Project } from "../../../types/project";
import { ProjectConversionTab } from "./tab/ProjectConversionTab";
import { ProjectImportTab } from "./tab/ProjectImportTab";

type ProjectDetailPageProps = {
  onProjectLoaded?: (project: Project | null) => void;
};

export function ProjectDetailPage({ onProjectLoaded }: ProjectDetailPageProps) {
  const { id, modelType: modelTypeParam } = useParams();
  const projectId = useMemo(() => id ?? "", [id]);
  const modelType = useMemo(() => resolveModelType(modelTypeParam), [modelTypeParam]);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey = searchParams.get("tab") === "conversion" ? "conversion" : "import";
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onProjectLoaded?.(null);
    if (!projectId) return;

    let active = true;
    setLoading(true);
    // TODO: 서버가 GET /project/{id} 를 배포하면(요청서 07번) 단건 조회로 교체한다.
    apiGet<Project[]>(`${modelType.projectApiBase}/list`)
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
  }, [projectId, onProjectLoaded, modelType]);

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
          icon: <ImportOutlined />,
          children: (
            <ProjectImportTab
              key={modelType.key}
              projectId={projectId}
              modelType={modelType}
              loading={loading}
              isActive={activeKey === "import"}
            />
          ),
        },
        {
          key: "conversion",
          label: "변환",
          icon: <SwapOutlined />,
          children: (
            <ProjectConversionTab
              key={modelType.key}
              projectId={projectId}
              modelType={modelType}
            />
          ),
        },
      ]}
    />
  );
}
