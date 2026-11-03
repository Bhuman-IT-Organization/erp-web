// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, within } from '@/test/render';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import { KnowledgeBaseList } from '../KnowledgeBaseList';

const EN = en['knowledge-base'];
const AR = ar['knowledge-base'];

vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/knowledge-base',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

function show(ui: ReactElement, options: { locale?: 'ar' | 'en' } = {}) {
  return renderWithProviders(ui, options);
}

describe('KnowledgeBaseList: Header and Navigation (matching Image 1)', () => {
  beforeEach(() => {
    setSession({ accessToken: 'valid-token', csrfToken: 'valid-csrf' });
  });

  afterEach(() => {
    cleanup();
    clearSession();
  });

  it('renders the Knowledge Base title, Groups link and View Kanban', () => {
    show(<KnowledgeBaseList />);
    expect(screen.getByRole('heading', { name: EN.knowledge_base })).toBeDefined();

    const groupsLink = screen.getByRole('link', { name: /groups/i });
    expect(groupsLink).toBeDefined();
    expect(groupsLink.getAttribute('href')).toBe('/setup/knowledge-base/groups');

    expect(screen.getByText(EN.view_kanban)).toBeDefined();
  });

  it('does NOT render the removed elements from Image 2 (no search, no export, no add button)', () => {
    show(<KnowledgeBaseList />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add knowledge base/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /add knowledge base/i })).toBeNull();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it('renders correctly under Arabic locale', () => {
    const { container } = show(<KnowledgeBaseList />, { locale: 'ar' });
    expect(within(container).getByRole('heading').textContent).toContain(AR.knowledge_base);
    expect(within(container).getByRole('link').getAttribute('href')).toBe(
      '/setup/knowledge-base/groups',
    );
    expect(within(container).getByText(AR.view_kanban)).toBeDefined();
  });
});
