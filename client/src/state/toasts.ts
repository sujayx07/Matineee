import { create } from 'zustand';

export type ToastTone = 'neutral' | 'success' | 'error' | 'signal';

export interface ToastAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  actions?: ToastAction[];
  duration: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'tone' | 'duration'> & Partial<Pick<Toast, 'tone' | 'duration'>>) => number;
  dismiss: (id: number) => void;
}

let seq = 0;
const MAX_VISIBLE = 4;

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    const toast: Toast = { tone: 'neutral', duration: 4200, ...t, id };
    set((s) => ({ toasts: [...s.toasts, toast].slice(-MAX_VISIBLE) }));
    if (toast.duration > 0) setTimeout(() => get().dismiss(id), toast.duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (title: string, opts?: Partial<Omit<Toast, 'id' | 'title'>>) =>
  useToasts.getState().push({ title, ...opts });
