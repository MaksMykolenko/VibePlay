export type ToastKind = 'success' | 'warning' | 'danger' | 'info';

function dispatch(type: ToastKind, message: string): void {
  window.dispatchEvent(new CustomEvent('vibeplay_toast', { detail: { type, message } }));
}

export const toast = {
  success: (message: string) => dispatch('success', message),
  warning: (message: string) => dispatch('warning', message),
  danger: (message: string) => dispatch('danger', message),
  info: (message: string) => dispatch('info', message),
};
