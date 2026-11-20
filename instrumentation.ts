import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { startPersonalReminderWorker } = await import('./services/personal-reminder-worker');
      startPersonalReminderWorker();
      const { startCompanyTaskWorker } = await import('./services/company-task-worker');
      startCompanyTaskWorker();
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
