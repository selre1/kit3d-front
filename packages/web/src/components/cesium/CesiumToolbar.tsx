import type { ReactNode } from "react";
import { Card, Flex } from "antd";

type CesiumToolbarProps = {
  children: ReactNode;
};

export function CesiumToolbar({ children }: CesiumToolbarProps) {
  return (
    <Card className="cesium-toolbar" size="small" bordered={false}>
      <Flex align="center" gap={16} wrap="wrap">
        {children}
      </Flex>
    </Card>
  );
}
