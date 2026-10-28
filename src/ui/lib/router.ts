import { useEffect, useState } from 'react';

export interface Route {
  readonly view: string;
  readonly id: string | null;
}

export const parseRoute = (hash: string): Route => {
  const clean = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const [view = '', id = ''] = clean.split('/');
  return {
    view: view === '' ? 'dashboard' : view,
    id: id === '' ? null : decodeURIComponent(id),
  };
};

export const routeHref = (path: string): string => (path === '' ? '#/' : `#/${path}`);

export const navigate = (path: string): void => {
  window.location.hash = routeHref(path);
};

export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
};
