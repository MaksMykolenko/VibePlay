import type { GameControlDto } from '@vibeplay/shared';
import { Keyboard } from 'lucide-react';

interface GameControlsCardProps {
  controls: GameControlDto[];
  title: string;
}

export function GameControlsCard({ controls, title }: GameControlsCardProps) {
  if (controls.length === 0) return null;

  return (
    <section className="game-controls-card bg-glass" aria-labelledby="game-controls-title">
      <h4 id="game-controls-title" className="game-controls-card__title">
        <Keyboard size={18} aria-hidden="true" />
        {title}
      </h4>
      <dl className="game-controls-card__list">
        {controls.map((control, index) => (
          <div
            className="game-controls-card__row"
            key={`${control.action}-${control.keys}-${index}`}
          >
            {control.action && <dt>{control.action}</dt>}
            {control.keys && <dd>{control.keys}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
