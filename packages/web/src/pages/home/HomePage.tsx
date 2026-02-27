import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  List,
  Row,
  Spin,
  Statistic,
  Steps,
  Tag,
  Typography,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import { apiGet } from "../../tools/api";
import type { ImportJobItem, Project } from "../../types/project";
import { parseDate } from "../../utils/format";

type UploadItem = ImportJobItem & {
  projectName?: string | null;
};

function statusTagProps(status?: string | null) {
  const normalized = status?.toUpperCase();
  switch (normalized) {
    case "DONE":
      return { color: "success", text: "DONE" };
    case "RUNNING":
      return { color: "processing", text: "RUNNING" };
    case "FAILED":
      return { color: "error", text: "FAILED" };
    case "PENDING":
      return { color: "warning", text: "PENDING" };
    default:
      return { color: "default", text: status || "PENDING" };
  }
}

export function HomaPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      const projectList = await apiGet<Project[]>(
        "/api/v1/project/list?limit=20&offset=0"
      );
      if (!active) return;
      const safeProjects = projectList ?? [];
      setProjects(safeProjects);

      const projectSlice = safeProjects.slice(0, 8);
      const projectMap = new Map(
        projectSlice.map((project) => [project.project_id, project.name])
      );

      const uploadResults = await Promise.allSettled(
        projectSlice.map((project) =>
          apiGet<ImportJobItem[]>(
            `/api/v1/import/${project.project_id}/list?limit=10&offset=0`
          ).then((items) =>
            (items ?? []).map((item) => ({
              ...item,
              projectName: projectMap.get(project.project_id) ?? null,
            }))
          )
        )
      );

      if (!active) return;

      const nextUploads = uploadResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value : []
      );

      setUploads(nextUploads);
    };

    load()
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "대시보드 데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const totalProjects = projects.length;
  const totalModels = projects.reduce(
    (sum, project) => sum + (project.models_count ?? 0),
    0
  );

  const recentUploads = useMemo(
    () =>
      [...uploads]
        .sort((a, b) => parseDate(b.uploaded_at) - parseDate(a.uploaded_at))
        .slice(0, 5),
    [uploads]
  );

  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at))
        .slice(0, 5),
    [projects]
  );

  const goToProject = (projectId?: string | null, tab?: string) => {
    if (!projectId) return;
    const suffix = tab ? `?tab=${tab}` : "";
    navigate(`/projects/${projectId}${suffix}`);
  };

  return (
    <Flex vertical gap={12} className="dashboard-page">
      <div className="page-title">최근 활동</div>
      {error ? <Alert type="error" showIcon message={error} /> : null}

      {loading ? (
        <Flex justify="center" style={{ padding: 24 }}>
          <Spin />
        </Flex>
      ) : (
        <>
          <Row gutter={[16, 16]} className="dashboard-row">
            <Col xs={24}>
              <Card className="project-card dashboard-card dashboard-hero" variant="borderless">
                <Flex vertical gap={8}>
                  <Typography.Title level={5} className="dashboard-hero-title">
                    KIT3D 시작하기
                  </Typography.Title>
                  <Steps
                    className="dashboard-hero-steps"
                    size="small"
                    current={0}
                    items={[
                      { title: "프로젝트 생성" },
                      { title: "파일 임포트" },
                      { title: "3D TILES 변환" },
                    ]}
                  />
                  <div className="dashboard-hero-actions">
                    <Button type="primary" onClick={() => navigate("/projects")}>
                      프로젝트로 이동
                    </Button>
                  </div>
                </Flex>
              </Card>
            </Col>
          </Row>
          <Row gutter={[16, 16]} className="dashboard-row">
            <Col xs={24} lg={12}>
              <Card
                className="project-card dashboard-card"
                title="최근 프로젝트"
                variant="borderless"
              >
                <Statistic title="프로젝트" value={totalProjects} />
                <List
                  className="dashboard-list"
                  dataSource={recentProjects}
                  locale={{ emptyText: "프로젝트가 없습니다." }}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button
                          key="open"
                          type="primary"
                          shape="circle"
                          icon={<SearchOutlined />}
                          onClick={() => goToProject(item.project_id, "import")}
                        />,
                      ]}
                    >
                      <List.Item.Meta title={item.name} description={item.created_at ?? "-"} />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                className="project-card dashboard-card"
                title="최근 업로드 모델"
                variant="borderless"
              >
                <Statistic title="모델" value={totalModels} />
                <List
                  className="dashboard-list"
                  dataSource={recentUploads}
                  locale={{ emptyText: "업로드가 없습니다." }}
                  renderItem={(item) => {
                    const status = statusTagProps(item.status);
                    return (
                      <List.Item
                        actions={[
                          <Button
                            key="open"
                            type="primary"
                            shape="circle"
                            icon={<SearchOutlined />}
                            onClick={() => goToProject(item.project_id, "import")}
                          />,
                        ]}
                      >
                        <List.Item.Meta
                          title={item.file_name}
                          description={`${item.projectName ?? "-"} · ${item.uploaded_at ?? "-"}`}
                        />
                        <Tag color={status.color}>{status.text}</Tag>
                      </List.Item>
                    );
                  }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Flex>
  );
}
