import React, { Suspense, lazy } from 'react';
import { IS_DEMO } from '../lib/appMode';
import { RealGamesProvider } from './RealGamesProvider';

export { useGames } from './gamesContext';

const DemoGamesProvider =
  import.meta.env.APP_MODE === 'demo'
    ? lazy(async () => {
        const module = await import('./demo/useDemoGames');
        return { default: module.DemoGamesProvider };
      })
    : null;

export const GamesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (IS_DEMO && DemoGamesProvider) {
    return (
      <Suspense fallback={null}>
        <DemoGamesProvider>{children}</DemoGamesProvider>
      </Suspense>
    );
  }
  return <RealGamesProvider>{children}</RealGamesProvider>;
};
