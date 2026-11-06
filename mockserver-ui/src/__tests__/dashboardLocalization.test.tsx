import { afterAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import ComposerView from '../components/ComposerView';
import OnboardingPanel from '../components/OnboardingPanel';
import { humanizeError } from '../lib/errorMessage';
import { useDashboardStore } from '../store';
import { buildTheme } from '../theme';

vi.hoisted(() => {
  vi.stubEnv('VITE_MOCKSERVER_DASHBOARD_LOCALE', 'zh-CN');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('Simplified Chinese dashboard', () => {
  it('renders the translated onboarding and navigates to the mock editor', async () => {
    useDashboardStore.setState({ view: 'get-started' });
    render(
      <ThemeProvider theme={buildTheme('dark')}>
        <OnboardingPanel connectionParams={{ host: '127.0.0.1', port: '1080', secure: false }} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('heading', { name: '欢迎使用 MockServer' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '创建 Mock 规则' }));
    expect(useDashboardStore.getState().view).toBe('composer');
  });

  it('translates the 404 summary and preserves the original error details', () => {
    expect(humanizeError(new Error('MockServer returned 404: original server details'))).toEqual({
      message: '未找到请求的资源（HTTP 404）。',
      details: 'original server details',
    });
  });

  it('shows a Chinese 404 summary and the raw server details when mock registration fails', async () => {
    const details = 'Registration endpoint unavailable on this server';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(details, { status: 404 }));
    try {
      useDashboardStore.setState({ activeExpectations: [], pendingEditExpectation: null, view: 'composer' });
      sessionStorage.removeItem('mockserver-composer-mode');
      render(
        <ThemeProvider theme={buildTheme('dark')}>
          <ComposerView connectionParams={{ host: '127.0.0.1', port: '1080', secure: false }} />
        </ThemeProvider>,
      );

      expect(screen.getByRole('button', { name: '快速模式' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '高级模式' })).toBeInTheDocument();

      const user = userEvent.setup({ delay: null });
      await user.type(screen.getByLabelText('路径'), '/localized-save');
      await user.click(screen.getByRole('button', { name: '注册规则' }));

      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:1080/mockserver/expectation',
        expect.objectContaining({ method: 'PUT' }),
      );
      const alert = within(await screen.findByTestId('register-error'));
      expect(alert.getByText('未找到请求的资源（HTTP 404）。')).toBeInTheDocument();
      expect(alert.queryByText(details)).not.toBeInTheDocument();
      await user.click(alert.getByRole('button', { name: '详情' }));
      expect(await alert.findByText(details)).toBeInTheDocument();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
