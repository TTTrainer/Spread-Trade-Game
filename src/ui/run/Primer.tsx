/** How a run is won, in three lines with pictures. Shown before a run and in the shop. */
export function Primer({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`primer num ${compact ? 'compact' : ''}`} data-testid="primer">
      <div className="pr-row">
        <span className="pr-ico">
          <b className="fx-chips">◆</b>×<b className="fx-mult">✚</b>
        </span>
        <span>
          Winners score <b className="fx-chips">CHIPS</b> × <b className="fx-mult">MULT</b>. Losers only lose
          chips.
        </span>
      </div>
      <div className="pr-row">
        <span className="pr-ico">⚙</span>
        <span>Stack a family: owning 2, 3 or 4 of a kind unlocks its bonuses.</span>
      </div>
      <div className="pr-row">
        <span className="pr-ico">✂</span>
        <span>Close at your plan. A stop taken early is the cheapest loss.</span>
      </div>
    </div>
  );
}
