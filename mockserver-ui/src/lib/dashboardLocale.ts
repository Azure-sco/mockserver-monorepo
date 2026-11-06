export const dashboardLocale = import.meta.env.VITE_MOCKSERVER_DASHBOARD_LOCALE === 'zh-CN' ? 'zh-CN' : 'en';

export function uiText(english: string, chinese: string): string {
  return dashboardLocale === 'zh-CN' ? chinese : english;
}
