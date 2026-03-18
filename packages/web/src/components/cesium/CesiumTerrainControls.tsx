import { Flex, Slider, Switch } from "antd";
import { RiEarthLine } from "react-icons/ri";
import type { CesiumSpecialEvn } from "./useCesiumSpecialEvn";
import { CesiumToolbarPopover } from "./CesiumToolbarPopover";

type CesiumTerrainControlsProps = {
  value: CesiumSpecialEvn;
  onChange: (next: CesiumSpecialEvn) => void;
};

export function CesiumTerrainControls({
  value,
  onChange,
}: CesiumTerrainControlsProps) {
  const update = (patch: Partial<CesiumSpecialEvn>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <CesiumToolbarPopover icon={<RiEarthLine />} title="지형 설정">
      <Flex className="cesium-terrain-panel" vertical gap={10}>
        <Flex className="cesium-toolbar-field" align="center" gap={6}>
          <span>활성화</span>
          <Switch
            size="small"
            checked={value.translucencyEnabled}
            onChange={(checked) => update({ translucencyEnabled: checked })}
          />
        </Flex>
        <Flex className="cesium-toolbar-field" align="center" gap={6}>
          <span>거리 효과</span>
          <Switch
            size="small"
            disabled={!value.translucencyEnabled}
            checked={value.fadeByDistance}
            onChange={(checked) => update({ fadeByDistance: checked })}
          />
        </Flex>
        <Flex className="cesium-toolbar-field" align="center" gap={8}>
          <span>투명도</span>
          <Slider
            className="cesium-terrain-slider"
            min={0}
            max={1}
            step={0.05}
            disabled={!value.translucencyEnabled}
            value={value.alpha}
            onChange={(nextValue) => {
              const next = Array.isArray(nextValue) ? nextValue[0] : nextValue;
              update({ alpha: next });
            }}
          />
        </Flex>
      </Flex>
    </CesiumToolbarPopover>
  );
}
