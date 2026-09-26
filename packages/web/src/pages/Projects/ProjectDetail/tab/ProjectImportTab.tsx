import { useState } from "react";
import { Alert, Button, Modal, Progress, Spin, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { InboxOutlined } from "@ant-design/icons";

import type { ModelTypeConfig } from "../../../../config/modelTypes";
import { isUploadableFileName } from "../../../../config/modelTypes";
import { apiPost } from "../../../../tools/api";
import type {
  ImportJobItem,
  ImportSkipReason,
  ImportUploadResponse,
} from "../../../../types/project";
import { ProjectModelsList } from "./import/ProjectModelsList";

type ProjectImportTabProps = {
  projectId: string;
  modelType: ModelTypeConfig;
  loading: boolean;
  isActive?: boolean;
};

export function ProjectImportTab({
  projectId,
  modelType,
  loading,
  isActive = true,
}: ProjectImportTabProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  /** 업로드 실패 안내. 모달 안에 남겨 두고 파일을 고쳐 다시 올리게 한다. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /** skipped[].reason 을 사용자 문구로 옮긴다. */
  const getSkipReasonLabel = (reason?: ImportSkipReason) => {
    switch (reason) {
      case "duplicate_file_name":
        return "같은 이름의 파일이 이미 있습니다";
      case "no_model_in_archive":
        return `zip 에 .${modelType.key} 파일이 없습니다`;
      case "invalid_archive":
        return "zip 을 읽을 수 없습니다";
      default:
        return reason || "알 수 없는 사유";
    }
  };

  /**
   * 업로드 실패 안내. 400 확장자 / 409 프로젝트 타입 / 404 프로젝트 없음 / 422 텍스처 누락.
   * FastAPI 요청 검증 실패도 422 인데, 그때는 detail 이 배열이라 문자열 여부로 구분한다.
   */
  const getUploadErrorMessage = (status: number, responseText: string) => {
    let rawDetail: unknown;
    try {
      rawDetail = (JSON.parse(responseText) as { detail?: unknown })?.detail;
    } catch {
      rawDetail = undefined;
    }
    const detail = typeof rawDetail === "string" ? rawDetail : "";

    if (status === 422) {
      // 텍스처 누락이면 detail 을 그대로 보여준다. 검사가 저장 전에 돌아 파일이 남지 않는다.
      return detail
        ? `${detail} (저장된 파일 없음)`
        : "업로드 요청 형식이 올바르지 않습니다.";
    }
    if (status === 409) {
      // 타입 검사가 저장 전에 돌아 파일이 남지 않는다.
      const base =
        detail || `${modelType.shortLabel} 프로젝트가 아닙니다.`;
      return `${base} ${modelType.shortLabel} 파일은 ${modelType.shortLabel} 프로젝트에 올려주세요. (저장된 파일 없음)`;
    }
    if (status === 400) {
      // 한 요청에 확장자가 섞이면 전체가 400 이다.
      return detail || `${modelType.accept} 파일만 업로드할 수 있습니다.`;
    }
    if (status === 404) {
      return detail || "프로젝트를 찾을 수 없습니다.";
    }
    return detail || `업로드에 실패했습니다. (${status})`;
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

  // zip 을 받는 타입에만 압축 안내를 띄운다.
  const archiveHint = modelType.uploadExtensions.includes("zip");
  const uploadLabel = modelType.uploadExtensions
    .map((ext) => ext.toUpperCase())
    .join(" / ");

  const resetUploadState = () => {
    setFileList([]);
    setUploading(false);
    setUploadPercent(0);
    setUploadError(null);
  };

  const handleUpload = () => {
    if (!projectId) return;
    if (!fileList.length) {
      message.warning(`${modelType.shortLabel} 파일을 먼저 선택하세요.`);
      return;
    }

    setUploading(true);
    setUploadPercent(0);
    setUploadError(null);

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
          const suffix = skipped.length > 5 ? ` 외 ${skipped.length - 5}건` : "";
          message.warning(
            `${uploadedCount}건 업로드, ${skipped.length}건 제외: ${preview}${suffix}`,
            6
          );
        } else {
          message.success("업로드를 완료했습니다.");
        }

        setRefreshKey((prev) => prev + 1);
        setUploadOpen(false);
        resetUploadState();
      } else {
        setUploadError(getUploadErrorMessage(xhr.status, xhr.responseText));
        setUploading(false);
      }
    };

    xhr.onerror = () => {
      setUploadError("업로드에 실패했습니다.");
      setUploading(false);
    };

    xhr.open("POST", `${modelType.importApiBase}/${projectId}/process`);
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
            modelType={modelType}
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
        title={`${modelType.shortLabel} 업로드`}
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false);
          resetUploadState();
        }}
        footer={null}
      >
        {archiveHint ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="텍스처가 있는 모델은 zip 으로 묶어 올려주세요."
            description={
              <Typography.Paragraph style={{ margin: 0 }}>
                zip 안에는 <code>0.fbx</code> 와 같은 이름의 <code>0.fbm/</code> 폴더가 있고,
                하위에 텍스처 이미지(jpg, png 등)가 있어야 합니다.
                <br />
                텍스처가 없다면 <code>.fbx</code> 를 그대로 올리셔도 됩니다.
                <br />
                zip 은 영문 파일명을 권장합니다.
              </Typography.Paragraph>
            }
          />
        ) : null}

        <Upload.Dragger
          multiple
          accept={modelType.accept}
          fileList={fileList}
          beforeUpload={(file) => {
            if (!isUploadableFileName(modelType, file.name)) {
              message.warning(`${file.name}: ${modelType.accept} 파일만 업로드할 수 있습니다.`);
              return Upload.LIST_IGNORE;
            }
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
          <p className="ant-upload-text">
            {uploadLabel} 파일을 드래그하거나 클릭해 업로드하세요.
          </p>
          <p className="ant-upload-hint">
            여러 개를 한 번에 올릴 수 있습니다. 같은 이름의 파일은 제외됩니다.
          </p>
        </Upload.Dragger>

        {uploadError ? (
          <Alert
            type="error"
            showIcon
            closable
            style={{ marginTop: 12 }}
            message={uploadError}
            onClose={() => setUploadError(null)}
          />
        ) : null}

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
