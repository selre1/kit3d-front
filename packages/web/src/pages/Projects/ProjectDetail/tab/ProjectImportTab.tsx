import { useState } from "react";
import { Button, Modal, Progress, Spin, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { InboxOutlined } from "@ant-design/icons";

import { apiPost } from "../../../../tools/api";
import type { ImportJobItem, ImportUploadResponse } from "../../../../types/project";
import { ProjectModelsList } from "./import/ProjectModelsList";

type ProjectImportTabProps = {
  projectId: string;
  loading: boolean;
  isActive?: boolean;
};

export function ProjectImportTab({ projectId, loading, isActive = true }: ProjectImportTabProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const getSkipReasonLabel = (reason?: string) => {
    if (reason === "duplicate_file_name") {
      return "duplicate file name";
    }
    return reason || "unknown";
  };

  const handleRestartImport = (item: ImportJobItem) => {
    const jobId = item.job_id;
    if (!jobId) {
      message.warning("Job ID is missing.");
      return;
    }

    const key = `retry-${jobId}`;
    message.loading({ content: "Retrying import...", key });
    apiPost<{ items: ImportJobItem[] }>(`/api/v1/import/${jobId}/retry`, { job_id: jobId })
      .then(() => {
        message.success({ content: "Import retry started.", key });
        setRefreshKey((prev) => prev + 1);
      })
      .catch((err: Error) => {
        message.error({ content: err.message || "Failed to retry import.", key });
      });
  };

  const resetUploadState = () => {
    setFileList([]);
    setUploading(false);
    setUploadPercent(0);
  };

  const handleUpload = () => {
    if (!projectId) return;
    if (!fileList.length) {
      message.warning("Select IFC files first.");
      return;
    }

    setUploading(true);
    setUploadPercent(0);

    const formData = new FormData();
    fileList.forEach((file) => {
      const payload = file.originFileObj ?? (file instanceof File ? file : null);
      if (payload) {
        formData.append("files", payload);
      }
    });

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => {
      if (event.total > 0) {
        setUploadPercent(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let response: ImportUploadResponse | null = null;
      try {
        response = JSON.parse(xhr.responseText) as ImportUploadResponse;
      } catch {
        response = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const skipped = response?.skipped ?? [];
        const uploadedCount = response?.uploaded?.length ?? response?.items?.length ?? 0;

        if (skipped.length > 0) {
          const preview = skipped
            .slice(0, 5)
            .map((skipItem) => `${skipItem.file_name} (${getSkipReasonLabel(skipItem.reason)})`)
            .join(", ");
          const suffix = skipped.length > 5 ? ` +${skipped.length - 5} more` : "";
          message.warning(
            `Uploaded ${uploadedCount}, skipped ${skipped.length}: ${preview}${suffix}`
          );
        } else {
          message.success("Upload complete.");
        }

        setRefreshKey((prev) => prev + 1);
        setUploadOpen(false);
        resetUploadState();
      } else {
        message.error(`Upload failed: ${xhr.status}`);
        setUploading(false);
      }
    };

    xhr.onerror = () => {
      message.error("Upload failed.");
      setUploading(false);
    };

    xhr.open("POST", `/api/v1/import/${projectId}/process`);
    xhr.send(formData);
  };

  return (
    <>
      <div className="models-list-wrapper">
        {loading ? (
          <Spin />
        ) : projectId ? (
          <ProjectModelsList
            projectId={projectId}
            refreshKey={refreshKey}
            isActive={isActive}
            onRestartImport={handleRestartImport}
            headerAction={
              <Button
                type="primary"
                onClick={() => setUploadOpen(true)}
                disabled={!projectId || uploading}
              >
                업로드
              </Button>
            }
          />
        ) : null}
      </div>

      <Modal
        className="import-upload-modal"
        title="업로드"
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false);
          resetUploadState();
        }}
        footer={null}
      >
        <Upload.Dragger
          multiple
          accept=".ifc"
          fileList={fileList}
          beforeUpload={(file) => {
            setFileList((prev) => [...prev, file]);
            return false;
          }}
          onRemove={(file) => {
            setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
          }}
          style={{ padding: 16 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">IFC 파일을 드래그하거나 클릭해 업로드하세요.</p>
          <p className="ant-upload-hint">여러 개 IFC 파일을 한 번에 올릴 수 있습니다.</p>
        </Upload.Dragger>

        {uploading ? (
          <div style={{ marginTop: 12 }}>
            <Progress percent={uploadPercent} status="active" />
          </div>
        ) : null}

        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Button
            onClick={() => {
              setUploadOpen(false);
              resetUploadState();
            }}
            disabled={uploading}
          >
            취소
          </Button>
          <Button type="primary" onClick={handleUpload} disabled={uploading}>
            업로드 시작
          </Button>
        </div>
      </Modal>
    </>
  );
}
