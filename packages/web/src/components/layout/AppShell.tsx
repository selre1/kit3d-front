import { Layout, Menu } from "antd";
import { HomeOutlined, ProjectOutlined, SettingOutlined } from "@ant-design/icons";
import { useState } from "react";

//verbatimModuleSyntax 옵션이 켜져 있으면 타입과 값 import를 엄격히 분리
//ReactNode는 타입만 존재
import type { ReactNode } from "react";

const { Header, Sider, Content } = Layout;

type AppShellProps = {
  children: ReactNode;
  activeMenu: string;
  onMenuChange: (key: string) => void;
  headerTitle?: ReactNode;
};

export function AppShell({
  children,
  activeMenu,
  onMenuChange,
  headerTitle,
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
            { key: "home", label: "홈", icon: <HomeOutlined /> },
            { key: "projects", label: "프로젝트", icon: <ProjectOutlined /> },
            { key: "settings", label: "설정", icon: <SettingOutlined /> },
          ]}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <div className="header-title">
            {headerTitle}
          </div>
          {/* <div className="header-actions">
            <Badge dot>
              <Button type="text">Notifications</Button>
            </Badge>
            <Avatar size="small">B</Avatar>
          </div> */}
        </Header>

        <Content className="page">{children}</Content>
      </Layout>
    </Layout>
  );
}
