import type { ReactNode } from "react";
import { Button, Flex, Popover, Typography } from "antd";

type CesiumToolbarPopoverProps = {
  icon: ReactNode;
  title: string;
  ariaLabel?: string;
  children: ReactNode;
};

export function CesiumToolbarPopover({
  icon,
  title,
  ariaLabel,
  children,
}: CesiumToolbarPopoverProps) {
  const getContainer = (trigger: HTMLElement): HTMLElement => {
    const candidates = [
      trigger.closest(".conversion-modal-layout"),
      trigger.closest(".cesium-viewer-root"),
      trigger.closest(".cesium-viewer-shell"),
      trigger.parentElement,
    ];
    const element = candidates.find(
      (node): node is HTMLElement => node instanceof HTMLElement
    );
    return element ?? trigger;
  };
  const content = (
    <Flex className="cesium-toolbar-popover" vertical gap={10}>
      <Typography.Text className="cesium-toolbar-popover-title">
        {title}
      </Typography.Text>
      <div className="cesium-toolbar-popover-body">{children}</div>
    </Flex>
  );

  return (
    <Popover
      placement="top"
      trigger="hover"
      content={content}
      overlayClassName="cesium-toolbar-popover-wrap"
      mouseEnterDelay={0.05}
      mouseLeaveDelay={0.1}
      getPopupContainer={getContainer}
    >
      <Button
        className="cesium-toolbar-icon"
        type="text"
        shape="circle"
        icon={icon}
        aria-label={ariaLabel ?? title}
      />
    </Popover>
  );
}
