import { useCallback } from 'react';
import { useConnectionParams } from './useConnectionParams';
import { useDashboardStore } from '../store';
import { loadWholeExpectation } from '../lib/fullExpectation';
import { humanizeError } from '../lib/errorMessage';
import { uiText } from '../lib/dashboardLocale';
import type { JsonListItem } from '../types';

/**
 * Runs `act` with the item's whole expectation: at once when the item was sent whole, or once it is loaded
 * by id when the server shortened its bodies in the live update. If the load fails `act` is not run and a
 * notification says so, so Edit, Duplicate and Test never act on a shortened body.
 */
export function useWithWholeExpectation(): (item: JsonListItem, act: (whole: JsonListItem) => void) => void {
  const params = useConnectionParams();
  return useCallback(
    (item: JsonListItem, act: (whole: JsonListItem) => void) => {
      if (!item.truncatedExpectation) {
        act(item);
        return;
      }
      const epoch = useDashboardStore.getState().connectionEpoch;
      loadWholeExpectation(params, item).then((whole) => {
        // Never hand an expectation loaded from one MockServer to an action on another.
        if (useDashboardStore.getState().connectionEpoch === epoch) act(whole);
      }, notifyWholeExpectationLoadFailed);
    },
    [params],
  );
}

export function notifyWholeExpectationLoadFailed(e: unknown): void {
  const reason = humanizeError(e).message;
  useDashboardStore.getState().setNotification({
    message: uiText(`Could not load the whole expectation, so nothing was done: ${reason}`, `无法加载完整的 Mock 规则，本次操作已取消。原因：${reason}`),
    severity: 'error',
  });
}
