import { useEffect, useMemo, useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { Modal, Upload } from "antd";
import type { UploadFile, UploadProps } from "antd";

import type { DemUploadSubmitPayload } from "./types";

type DemUploadModalProps = {
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: DemUploadSubmitPayload) => Promise<void>;
};

export function DemUploadModal({ open, submitting, onCancel, onSubmit }: DemUploadModalProps) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    if (!open) {
      setFileList([]);
    }
  }, [open]);

  const canSubmit = useMemo(() => fileList.length > 0, [fileList.length]);

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
    const file = fileList[0]?.originFileObj;
    if (!file) return;
    await onSubmit({ file });
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
      title="DEM 업로드"
      destroyOnClose
      centered
    >
      <div className="dem-upload-section">
        <Upload.Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">DEM(.tif/.tiff) 파일을 선택하세요</p>
          <p className="ant-upload-hint">업로드 후 목록에 추가되고 즉시 미리보기가 적용됩니다.</p>
        </Upload.Dragger>
      </div>
    </Modal>
  );
}
