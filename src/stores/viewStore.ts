// src/stores/viewStore.ts
import { create } from 'zustand';
import type { CrmView } from '@/types';

interface ViewState {
  currentView: CrmView;
  setCurrentView: (view: CrmView) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  currentView: 'dashboard', // Default view
  setCurrentView: (view) => set({ currentView: view }),
}));