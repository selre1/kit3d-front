import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Spin,
} from "antd";
import { RiFileTextLine } from "react-icons/ri";
import { useNavigate } from "react-router-dom";

import { apiGet, apiPost } from "../../tools/api";
import type { Project } from "../../types/project";

type ProjectCard = {
  id: string;
  name: string;
  description: string;
  updated: string;
  owner: string;
  models: number;
  empty: boolean;
};

type ProjectFormValues = {
  name: string;
  description?: string;
};

function mapProjectToCard(project: Project): ProjectCard {
  return {
    id: project.project_id,
    name: project.name,
    description: project.description || "",
    updated: project.created_at ? `${project.created_at}` : "",
    owner: "프로젝트 소유자",
    models: project.models_count || 0,
    empty: (project.models_count || 0) === 0,
  };
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchProjects, setSearchProjects] = useState<ProjectCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [form] = Form.useForm<ProjectFormValues>();
  const navigate = useNavigate();
  const pageSize = 8;

  useEffect(() => {
    let active = true;
    setLoading(true);
    const offset = (page - 1) * pageSize;
    const requestLimit = pageSize + 1;
    apiGet<Project[]>(`/api/v1/project/list?limit=${requestLimit}&offset=${offset}`)
      .then((data) => {
        if (!active) return;
        const hasMore = data.length > pageSize;
        const sliced = data.slice(0, pageSize);
        const next = sliced.map(mapProjectToCard);
        setProjects(next.length ? next : []);
        setHasNext(hasMore);
        setError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, refreshKey]);

  useEffect(() => {
    const keyword = searchText.trim();
    if (!keyword) {
      setSearchProjects([]);
      setSearchLoading(false);
      return;
    }

    let active = true;
    setSearchLoading(true);
    apiGet<Project[]>("/api/v1/project/list?limit=2000&offset=0")
      .then((data) => {
        if (!active) return;
        const mapped = (data ?? []).map(mapProjectToCard);
        setSearchProjects(mapped);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setSearchLoading(false);
      });

    return () => {
      active = false;
    };
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [searchText]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      await apiPost<Project>("/api/v1/project/create", values);
      form.resetFields();
      setCreateOpen(false);
      setPage(1);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setCreating(false);
    }
  };

  const isSearching = searchText.trim().length > 0;
  const searchSource = isSearching ? searchProjects : projects;

  const filteredProjects = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return projects;
    return searchSource.filter((project) =>
      [project.name, project.description, project.owner]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [projects, searchSource, searchText]);

  const pagedProjects = useMemo(() => {
    if (!isSearching) return projects;
    const start = (page - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, isSearching, page, pageSize, projects]);

  const content = useMemo(() => {
    if (loading || (isSearching && searchLoading)) {
      return (
        <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
          <Spin />
        </div>
      );
    }

    if (error) {
      return <div style={{ padding: 24, color: "#ff8a8a" }}>프로젝트를 불러오지 못했습니다: {error}</div>;
    }

    if (!projects.length && !isSearching) {
      return <Empty description="프로젝트가 없습니다." />;
    }

    if (isSearching && !filteredProjects.length) {
      return <Empty description="검색 결과가 없습니다." />;
    }

    const displayProjects = isSearching ? pagedProjects : projects;
    const paginationTotal = isSearching
      ? filteredProjects.length
      : (page - 1) * pageSize + projects.length + (hasNext ? 1 : 0);

    return (
      <>
        <div className="project-grid">
          {displayProjects.map((project) => (
            <Card
              key={project.id}
              className="project-card"
              hoverable
              variant="borderless"
              onClick={() => {
                navigate(`/projects/${project.id}`);
              }}
            >
              <div className="project-meta">
                <div>
                  <div className="project-title">{project.name}</div>
                  <div className="project-owner">{project.description || "설명 없음"}</div>
                  <div className="project-owner">
                    {project.owner} {project.updated ? `/ ${project.updated}` : ""}
                  </div>
                </div>
                <Avatar size="small">{project.owner[0] ?? "P"}</Avatar>
              </div>
              <div className="project-preview">
                {project.empty ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="모델 없음" />
                ) : (
                  <div style={{ width: "100%", textAlign: "center" }}>
                    <Badge count={project.models} showZero>
                      <Avatar shape="square" size="large" icon={<RiFileTextLine />} />
                    </Badge>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
        <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={paginationTotal}
            showSizeChanger={false}
            onChange={(next) => setPage(next)}
          />
        </div>
      </>
    );
  }, [
    error,
    filteredProjects,
    hasNext,
    isSearching,
    loading,
    navigate,
    page,
    pageSize,
    pagedProjects,
    projects,
    searchLoading,
  ]);

  return (
    <>
      <div className="page-title">프로젝트 목록</div>
      <div className="page-subtitle">프로젝트를 선택하거나 새 프로젝트를 생성하세요.</div>

      <div className="toolbar">
        <div className="toolbar-left">
          <Input.Search
            placeholder="프로젝트 검색"
            style={{ width: 220 }}
            allowClear
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <div className="toolbar-right">
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            새 프로젝트
          </Button>
        </div>
      </div>

      {content}

      <Modal
        title="프로젝트 생성"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="생성"
        cancelText="취소"
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="프로젝트 이름"
            name="name"
            rules={[{ required: true, message: "프로젝트 이름을 입력하세요." }]}
          >
            <Input placeholder="예: 테스트 프로젝트" />
          </Form.Item>
          <Form.Item label="설명 (선택)" name="description">
            <Input.TextArea placeholder="설명 없음" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
