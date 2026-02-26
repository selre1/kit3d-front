import type { ReactNode } from "react";
import { Button, Flex } from "antd";
import {
  AimOutlined,
  AppstoreAddOutlined,
  BorderOutlined,
  CloseCircleOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { CesiumToolbarPopover } from "./CesiumToolbarPopover";
import type { MeasureMode } from "./useCesiumMeasure";

type CesiumMeasureControlsProps = {
  mode: MeasureMode;
  onModeChange: (next: MeasureMode) => void;
  onClear: () => void;
};

export function CesiumMeasureControls({
  mode,
  onModeChange,
  onClear,
}: CesiumMeasureControlsProps) {
  const options: { value: MeasureMode; label: string; icon: ReactNode }[] = [
    {
      value: "none",
      label: "끄기",
      icon: <CloseCircleOutlined />,
    },
    {
      value: "position",
      label: "위치",
      icon: <AimOutlined />,
    },
    {
      value: "distance",
      label: "거리",
      icon: <ColumnWidthOutlined />,
    },
    {
      value: "area",
      label: "면적",
      icon: <BorderOutlined />,
    },
    {
      value: "vertical",
      label: "수직측정",
      icon: <ColumnHeightOutlined />,
    },
  ];

  return (
    <CesiumToolbarPopover icon={<AppstoreAddOutlined />} title="측정 도구">
      <Flex className="cesium-measure-panel" align="center" gap={6} wrap="wrap">
        {options.map((option) => {
          const active = mode === option.value;
          return (
            <Button
              key={option.value}
              size="small"
              type="text"
              className={`cesium-measure-toggle${active ? " is-active" : ""}`}
              icon={option.icon}
              onClick={() => onModeChange(option.value)}
              aria-pressed={active}
            >
              {option.label}
            </Button>
          );
        })}
        <Button
          size="small"
          shape="circle"
          className="cesium-measure-reset"
          icon={<ReloadOutlined />}
          onClick={onClear}
          aria-label="초기화"
        />
      </Flex>
    </CesiumToolbarPopover>
  );
}
