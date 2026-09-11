import { Layout, Menu } from "antd";
import {
  RiHome5Line,
  RiSettings3Line,
} from "react-icons/ri";
import {ViewInArOutlined} from "@mui/icons-material";

import { MdOutlineTerrain } from "react-icons/md";
import { useState } from "react";
import type { ReactNode } from "react";

import { MODEL_TYPE_LIST } from "../../config/modelTypes";

const { Header, Sider, Content } = Layout;

export const MODELS_MENU_KEY = "models";

type AppShellProps = {
  children: ReactNode;
  activeMenu: string;
  onMenuChange: (key: string) => void;
  headerTitle?: ReactNode;
  contentClassName?: string;
};

export function AppShell({
  children,
  activeMenu,
  onMenuChange,
  headerTitle,
  contentClassName,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  // 사용자가 직접 접거나 편 적이 없으면(null) 현재 메뉴에 맞춰 자동으로 펼친다.
  const [manualOpenKeys, setManualOpenKeys] = useState<string[] | null>(null);
  const openKeys =
    manualOpenKeys ?? (activeMenu.startsWith(`${MODELS_MENU_KEY}:`) ? [MODELS_MENU_KEY] : []);

  return (
    <Layout className="app-shell">
      <Sider
        width={240}
        className="app-sider"
        breakpoint="lg"
        collapsedWidth={72}
        onCollapse={(next) => setCollapsed(next)}
      >
        <div className="brand">
          <img className="brand-logo" src="/kit3d.png" alt="KIT3D logo" />
          <span className="brand-text">KIT3D</span>
        </div>
        <div className="sidebar-divider" />
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeMenu]}
          openKeys={openKeys}
          onOpenChange={(keys) => setManualOpenKeys(keys as string[])}
          onClick={({ key }) => onMenuChange(key)}
          inlineCollapsed={collapsed}
          items={[
            { key: "home", label: "홈", icon: <RiHome5Line /> },
            {
              key: MODELS_MENU_KEY,
              label: "3D 모델",
              icon: <ViewInArOutlined />,
              children: MODEL_TYPE_LIST.map((modelType) => ({
                key: modelType.menuKey,
                label: modelType.label,
              })),
            },
            { key: "dem", label: "지형 모델", icon: <MdOutlineTerrain /> },
            { key: "settings", label: "설정", icon: <RiSettings3Line /> },
          ]}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <div className="header-title">{headerTitle}</div>
        </Header>

        <Content className={contentClassName || "page"}>{children}</Content>
      </Layout>
    </Layout>
  );
}
