import { useEffect, useMemo, useState } from "react";
import type { CesiumFeatureInfo } from "./types";

type CesiumFeatureInspectorProps = {
  info: CesiumFeatureInfo | null;
  emptyLabel?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

const TOGGLE_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className="inspect_toggle_icon"
  >
    <path
      fillRule="evenodd"
      d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z"
      clipRule="evenodd"
    />
  </svg>
);

export function CesiumFeatureInspector({
  info,
  emptyLabel = "모델을 클릭해 주세요.",
}: CesiumFeatureInspectorProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenSections({});
  }, [info]);

  const propsEntries = useMemo(() => {
    if (!info?.props) return [];
    return Object.entries(info.props);
  }, [info]);

  if (!info || propsEntries.length === 0) {
    return (
      <div id="inspector_list_container">
        <div className="inspect_list" style={{ textAlign: "center" }}>
          <div style={{ color: "#e6edf3" }}>{emptyLabel}</div>
        </div>
      </div>
    );
  }

  return (
    <div id="inspector_list_container">

      {propsEntries.map(([key, value]) => {
        const sectionKey = String(key);
        const isOpen = openSections[sectionKey] ?? false;
        const entries = (
          isPlainObject(value) ? Object.entries(value) : [["value", value]]
        ) as [string, unknown][];

        return (
          <div
            key={sectionKey}
            className={`inspect_section ${isOpen ? "is-open" : ""}`}
          >
            <button
              type="button"
              className="inspect_section_header"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenSections((prev) => ({
                  ...prev,
                  [sectionKey]: !isOpen,
                }))
              }
            >
              <span className="inspect_section_toggle">{TOGGLE_ICON}</span>
              <span className="inspect_section_title">{sectionKey}</span>
            </button>
            <div className="inspect_section_body">
              {entries.map(([childKey, childValue]) => {
                const label = String(childKey);
                return (
                  <div className="inspect_list" key={`${sectionKey}-${label}`}>
                    <div className="k">{label}</div>
                    <div style={{ color: "#cccccc" }}>
                      {formatValue(childValue) || "-"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
