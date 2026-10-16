import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastTone = 'info' | 'ok' | 'warn';
export type ToastItem = { id: string; text: string; tone: ToastTone };

const MAX_TOASTS = 4;
const DEFAULT_MS = 3500;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts(current => current.filter(t => t.id !== id));
  }, []);

  const push = useCallback((text: string, tone: ToastTone = 'info', ms = DEFAULT_MS) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(current => [...current, { id, text, tone }].slice(-MAX_TOASTS));
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
          <span>{toast.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
