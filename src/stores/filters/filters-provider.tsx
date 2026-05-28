"use client";

import { createContext, useContext, useState } from "react";

import { type StoreApi, useStore } from "zustand";

import { createFiltersStore, type FiltersState } from "./filters-store";

const FiltersStoreContext = createContext<StoreApi<FiltersState> | null>(null);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createFiltersStore());
  return <FiltersStoreContext.Provider value={store}>{children}</FiltersStoreContext.Provider>;
}

export function useFiltersStore<T>(selector: (state: FiltersState) => T): T {
  const store = useContext(FiltersStoreContext);
  if (!store) throw new Error("Missing FiltersProvider");
  return useStore(store, selector);
}
