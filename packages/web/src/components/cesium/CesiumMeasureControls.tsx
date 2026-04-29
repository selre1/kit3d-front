import type { ReactNode } from "react";
import { Button, Flex } from "antd";
import {
  RiApps2Line,
  RiCloseCircleLine,
  RiFocus3Line,
  RiRefreshLine,
  RiRuler2Line,
  RiRulerLine,
  RiShapeLine,
} from "react-icons/ri";
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
      icon: <RiCloseCircleLine />,
    },
    {
      value: "position",
      label: "위치",
      icon: <RiFocus3Line />,
    },
    {
      value: "distance",
      label: "거리",
      icon: <RiRulerLine />,
    },
    {
      value: "area",
      label: "면적",
      icon: <RiShapeLine />,
    },
    {
      value: "vertical",
      label: "수직측정",
      icon: <RiRuler2Line />,
    },
  ];

  return (
    <CesiumToolbarPopover icon={<RiApps2Line />} title="측정 도구">
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
          icon={<RiRefreshLine />}
          onClick={onClear}
          aria-label="초기화"
        />
      </Flex>
    </CesiumToolbarPopover>
  );
}
