"use client";
import { useEffect, useState } from "react";
import { useOps } from "./area";
// Loads one team dataset and returns it with a reload function.
export function useLoad<T = any>(action: string) {
  const { ops, setError, mode, token } = useOps();
  const [data, setData] = useState<T | null>(null);
  const reload = async () => setData(await ops(action));
  useEffect(() => {
    if (mode !== "live" || !token) return;
    let active = true;
    ops(action)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [action, mode, token]);
  return { data, reload };
}
