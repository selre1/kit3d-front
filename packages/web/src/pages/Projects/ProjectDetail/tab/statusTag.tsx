import { Tag } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";

function statusTagProps(status?: string | null) {
  switch (status?.toUpperCase()) {
    case "DONE":
      return { color: "success", icon: <CheckCircleOutlined /> };
    case "RUNNING":
      return { color: "processing", icon: <LoadingOutlined spin /> };
    case "FAILED":
      return { color: "error", icon: <CloseCircleOutlined /> };
    case "PENDING":
      return { color: "warning", icon: <ExclamationCircleOutlined /> };
    default:
      return { color: "default", icon: <ClockCircleOutlined /> };
  }
}

type StatusTagProps = {
  status?: string | null;
  label?: string;
};

export function StatusTag({ status, label }: StatusTagProps) {
  const { color, icon } = statusTagProps(status);
  return (
    <Tag color={color} icon={icon} variant="solid">
      {label ?? status ?? "PENDING"}
    </Tag>
  );
}
