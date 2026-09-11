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
  // 타일링 미지원 타입(FBX)은 변환 탭 자체가 없으므로 임포트로 되돌린다.
  const activeKey =
    searchParams.get("tab") === "conversion" && modelType.tiling ? "conversion" : "import";
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
        ...(modelType.tiling
          ? [
              {
                key: "conversion",
                label: "변환",
                icon: <SwapOutlined />,
                children: <ProjectConversionTab projectId={projectId} />,
              },
            ]
          : []),
      ]}
    />
  );
}
