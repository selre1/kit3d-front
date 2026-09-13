import { useCallback, useEffect, useRef, useState } from "react";

import type { ModelTypeConfig } from "../../../../../config/modelTypes";
import { apiGet } from "../../../../../tools/api";
import type { FbxTileJob, IfcTileJob } from "../../../../../types/project";
import {
  PAGE_SIZE,
  POLL_INTERVAL_MS,
  isPending,
  normalizeFbxTileJob,
  normalizeIfcTileJob,
} from "./types";
import type { TileRow } from "./types";

export function useTileJobs(projectId: string, modelType: ModelTypeConfig) {
  const isFbx = modelType.tiling === "fbx";
  const tileApiBase = modelType.tileApiBase;

  const [rows, setRows] = useState<TileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [projectId, modelType.key]);

  const fetchRows = useCallback(
    async (silent = false) => {
      if (!projectId) return;
      const requestId = ++requestIdRef.current;
      const isStale = () => requestId !== requestIdRef.current;

      if (!silent) setLoading(true);
      try {
        const offset = (page - 1) * PAGE_SIZE;
        const url = `${tileApiBase}/${projectId}/list?limit=${PAGE_SIZE + 1}&offset=${offset}`;
        const next = isFbx
          ? ((await apiGet<FbxTileJob[]>(url)) ?? []).map(normalizeFbxTileJob)
          : ((await apiGet<IfcTileJob[]>(url)) ?? []).map(normalizeIfcTileJob);
        if (isStale()) return;
        setHasNext(next.length > PAGE_SIZE);
        setRows(next.slice(0, PAGE_SIZE));
        setError(null);
      } catch (err) {
        if (isStale()) return;
        if (err instanceof Error) setError(err.message);
      } finally {
        if (!silent && !isStale()) setLoading(false);
      }
    },
    [isFbx, page, projectId, tileApiBase]
  );

  useEffect(() => {
    void fetchRows();
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchRows]);

  const fetchRowsRef = useRef(fetchRows);
  fetchRowsRef.current = fetchRows;
  const hasPending = rows.some(isPending);

  useEffect(() => {
    if (!isFbx || !hasPending || !projectId) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void fetchRowsRef.current(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isFbx, hasPending, projectId]);

  const prepend = useCallback((row: TileRow) => {
    setRows((prev) => [row, ...prev].slice(0, PAGE_SIZE));
  }, []);

  return {
    rows,
    loading,
    error,
    page,
    setPage,
    total: (page - 1) * PAGE_SIZE + rows.length + (hasNext ? 1 : 0),
    prepend,
  };
}
