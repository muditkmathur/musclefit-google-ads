"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { type StoreApi, useStore } from "zustand";

import { createFiltersStore, type FiltersState } from "./filters-store";
import { loadPersistedDateRange } from "./filters-storage";

const FiltersStoreContext = createContext<StoreApi<FiltersState> | null>(null);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createFiltersStore());

  useEffect(() => {
    const persisted = loadPersistedDateRange();
    if (!persisted) return;
    const { dateRange, setDateRange } = store.getState();
    if (persisted.start !== dateRange.start || persisted.end !== dateRange.end) {
      setDateRange(persisted);
    }
  }, [store]);

  return <FiltersStoreContext.Provider value={store}>{children}</FiltersStoreContext.Provider>;
}

export function useFiltersStore<T>(selector: (state: FiltersState) => T): T {
  const store = useContext(FiltersStoreContext);
  if (!store) throw new Error("Missing FiltersProvider");
  return useStore(store, selector);
}
