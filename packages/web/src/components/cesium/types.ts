export type CesiumFeatureInfo = {
  meta: Record<string, unknown>;
  props: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};

export type CesiumViewerProps = {
  className?: string;
  tilesetUrls?: string[];
  onFeatureSelect?: (info: CesiumFeatureInfo | null) => void;
};
