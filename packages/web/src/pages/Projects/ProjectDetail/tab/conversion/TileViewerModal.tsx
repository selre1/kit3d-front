import { useState } from "react";
import { Layout, Modal } from "antd";

import { CesiumFeatureInspector, CesiumViewer } from "../../../../../components/cesium";
import type { CesiumFeatureInfo } from "../../../../../components/cesium";

type TileViewerModalProps = {
  open: boolean;
  tilesetUrls: string[];
  onClose: () => void;
};

export function TileViewerModal({ open, tilesetUrls, onClose }: TileViewerModalProps) {
  const [feature, setFeature] = useState<CesiumFeatureInfo | null>(null);

  const handleClose = () => {
    setFeature(null);
    onClose();
  };

  return (
    <Modal
      className="conversion-modal"
      title="3D"
      open={open}
      onCancel={handleClose}
      footer={null}
      width="92vw"
      centered
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      <Layout className="conversion-modal-layout">
        <Layout.Content className="conversion-viewer">
          <CesiumViewer tilesetUrls={tilesetUrls} onFeatureSelect={setFeature} />
        </Layout.Content>
        <Layout.Content className="conversion-tree">
          <div className="conversion-tree-header">
            <div className="conversion-tree-title">모델정보</div>
          </div>
          <div className="conversion-tree-body">
            <CesiumFeatureInspector info={feature} />
          </div>
        </Layout.Content>
      </Layout>
    </Modal>
  );
}
