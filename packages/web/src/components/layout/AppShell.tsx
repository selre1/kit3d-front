import { Layout, Menu } from "antd";
import {
  RiHome5Line,
  RiSettings3Line,
} from "react-icons/ri";
import {ViewInArOutlined} from "@mui/icons-material";

import { MdOutlineTerrain } from "react-icons/md";
import { useState } from "react";
import type { ReactNode } from "react";

const { Header, Sider, Content } = Layout;

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
          onClick={({ key }) => onMenuChange(key)}
          inlineCollapsed={collapsed}
          items={[
            { key: "home", label: "홈", icon: <RiHome5Line /> },
            { key: "projects", label: "3D 모델", icon: <ViewInArOutlined /> },
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
