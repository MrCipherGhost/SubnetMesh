const ICON = '/notify-icon.svg';
const BASE_TITLE = 'SubnetMesh';
let titleTimer: ReturnType<typeof setInterval> | null = null;
let flashOn = false;

export function flashTabTitle(label: string) {
  if (!document.hidden) return;
  if (titleTimer) clearInterval(titleTimer);
  flashOn = false;
  document.title = label;
  titleTimer = setInterval(() => {
    flashOn = !flashOn;
    document.title = flashOn ? label : BASE_TITLE;
  }, 1200);
}

export function stopTabFlash() {
  if (titleTimer) clearInterval(titleTimer);
  titleTimer = null;
  flashOn = false;
  document.title = BASE_TITLE;
}

export function showDesktopNotice(title: string, body: string) {
  if (!document.hidden) return;
  flashTabTitle(`${title}`);
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body: body.slice(0, 120),
      icon: ICON,
      badge: ICON,
      silent: true,
    });
  } catch { /* OS / browser may reject custom styling beyond icon */ }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) stopTabFlash();
  });
}
