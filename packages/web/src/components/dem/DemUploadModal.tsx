import { useEffect, useMemo, useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { Input, Modal, Tabs, Upload } from "antd";
import type { UploadFile, UploadProps } from "antd";

import type { DemUploadSubmitPayload } from "./types";

type DemUploadModalProps = {
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: DemUploadSubmitPayload) => Promise<void>;
};

export function DemUploadModal({ open, submitting, onCancel, onSubmit }: DemUploadModalProps) {
  const [tab, setTab] = useState<"file" | "url">("file");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");

  useEffect(() => {
    if (!open) {
      setTab("file");
      setFileList([]);
      setSourceUrl("");
    }
  }, [open]);

  const canSubmit = useMemo(() => {
    if (tab === "file") return fileList.length > 0;
    return Boolean(sourceUrl.trim());
  }, [fileList.length, sourceUrl, tab]);

  const uploadProps: UploadProps = {
    multiple: false,
    maxCount: 1,
    accept: ".tif,.tiff",
    beforeUpload: (file) => {
      setFileList([
        {
          uid: `${Date.now()}`,
          name: file.name,
          size: file.size,
          type: file.type,
          originFileObj: file,
          status: "done",
        },
      ]);
      return false;
    },
    onRemove: () => {
      setFileList([]);
    },
    fileList,
  };

  const handleSubmit = async () => {
    if (tab === "file") {
      const file = fileList[0]?.originFileObj;
      if (!file) return;
      await onSubmit({ mode: "file", file });
      return;
    }

    const url = sourceUrl.trim();
    if (!url) return;
    await onSubmit({ mode: "url", url });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="업로드"
      cancelText="취소"
      okButtonProps={{ disabled: !canSubmit, loading: submitting }}
      className="dem-upload-modal"
      title="Add DEM"
      destroyOnClose
      centered
      width={720}
    >
      <Tabs
        activeKey={tab}
        onChange={(next) => setTab(next as "file" | "url")}
        items={[
          {
            key: "file",
            label: "By model",
            children: (
              <div className="dem-upload-section">
                <Upload.Dragger {...uploadProps}>
                  <p className="ant-upload-drag-icon">
                    <UploadOutlined />
                  </p>
                  <p className="ant-upload-text">DEM(.tif/.tiff) 파일을 선택하세요</p>
                  <p className="ant-upload-hint">선택한 파일은 업로드 시 목록에 즉시 반영됩니다.</p>
                </Upload.Dragger>
              </div>
            ),
          },
          {
            key: "url",
            label: "By object URL",
            children: (
              <div className="dem-upload-section">
                <Input
                  placeholder="https://example.com/path/dem.tif"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                />
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
}
