import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const STORE_TS = `import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import { counterReducer } from "./counterSlice.js";

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    // Add more slices here
  },
});

export type RootState    = ReturnType<typeof store.getState>;
export type AppDispatch  = typeof store.dispatch;

// Typed hooks — use these throughout your app instead of plain useDispatch/useSelector
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
`;

const COUNTER_SLICE_TS = `import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface CounterState {
  value: number;
}

const initialState: CounterState = { value: 0 };

export const counterSlice = createSlice({
  name: "counter",
  initialState,
  reducers: {
    increment:       (state)                          => { state.value += 1; },
    decrement:       (state)                          => { state.value -= 1; },
    incrementByAmount: (state, action: PayloadAction<number>) => { state.value += action.payload; },
  },
});

export const { increment, decrement, incrementByAmount } = counterSlice.actions;
export const counterReducer = counterSlice.reducer;
`;

const REDUX_PROVIDER_TSX = `"use client";

import { Provider } from "react-redux";
import { store } from "@/store";
import type { ReactNode } from "react";

export function ReduxProvider({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
`;

export const reduxModule: PluginDefinition = {
  manifest: {
    id: "state-redux",
    name: "Redux Toolkit",
    version: "1.0.0",
    description: "Redux Toolkit with a typed store, example slice, and React provider",
    category: "state",
    dependencies: [
      { name: "@reduxjs/toolkit", version: "^2.2.5", scope: "dependencies" },
      { name: "react-redux", version: "^9.1.2", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/store/index.ts", content: STORE_TS },
      { relativePath: "src/store/counterSlice.ts", content: COUNTER_SLICE_TS },
      { relativePath: "src/components/ReduxProvider.tsx", content: REDUX_PROVIDER_TSX },
    ],
    configPatches: [],
    compatibility: {
      conflicts: ["state-zustand", "state-tanstack-query"],
    },
  },
};