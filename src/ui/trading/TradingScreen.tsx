import { motion, useAnimationControls } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { StructureId } from '../../engine/strategies/types';
import { sfx } from '../../audio/sfx';
import { money } from '../format';
import { Kbd, Modal, Pnl } from '../components/ui';
import { useHotkeys } from '../hotkeys';
import { useApp } from '../store/app';
import { useTrading, type Panel, type StudyId } from '../store/trading';
import { BUCKET_NAMES, CONFIDENCES } from '../../engine/scoring/calls';
import { ChartPanel } from './ChartPanel';
import { NewsTicker } from './NewsTicker';
import { CallCards, ExpiryChips, OrderTicket, SizeControls, StructureCards } from './BuilderTray';
import {
  AnalyzePanel,
  DecisionModal,
  FastForwardBar,
  LineupColumn,
  PositionsDock,
  type CardBadges,
} from './Panels';
import { PayoffChart, StatsBlock } from './RightPanel';
import { DebriefStrip } from './Debrief';
import './trading.css';

const STUDY_LABELS: Record<StudyId, string> = {
  bb: 'Bollinger Bands',
  rsi: 'RSI (14)',
  macd: 'MACD',
  vol: 'Volume',
  em: 'Expected-move band',
  sma20: 'SMA 20',
  sma50: 'SMA 50',
  sma200: 'SMA 200',
  ema9: 'EMA 9',
  ema21: 'EMA 21',
  keltner: 'Keltner Channels',
  atr: 'ATR (14)',
  sr: 'Support / resistance',
  relvol: 'Relative volume',
};

function StudyPicker({ onClose }: { onClose: () => void }) {
  const studies = useTrading((s) => s.studies);
  const locked = useTrading((s) => s.lockedStudies);
  const toggle = useTrading((s) => s.toggleStudy);
  const timeframe = useTrading((s) => s.timeframe);
  const setTimeframe = useTrading((s) => s.setTimeframe);
  const setDrawTool = useTrading((s) => s.setDrawTool);
  const undo = useTrading((s) => s.undoDrawing);
  return (
    <Modal onClose={onClose} testId="study-picker">
      <h2>Studies</h2>
      <div className="study-grid num">
        {(Object.keys(STUDY_LABELS) as StudyId[]).map((s) => (
          <label key={s} className={`toggle ${locked.includes(s) ? 'locked' : ''}`}>
            <input
              type="checkbox"
              checked={studies.includes(s)}
              onChange={() => toggle(s)}
              disabled={locked.includes(s)}
            />{' '}
            {STUDY_LABELS[s]}
            {locked.includes(s) && <span className="chip">ANALYST</span>}
          </label>
        ))}
      </div>
      <div className="section-title">Timeframe</div>
      <div className="seg num">
        <button className={timeframe === 'D' ? 'sel' : ''} onClick={() => setTimeframe('D')}>
          DAILY
        </button>
        <button className={timeframe === 'W' ? 'sel' : ''} onClick={() => setTimeframe('W')}>
          WEEKLY
        </button>
      </div>
      <div className="section-title">Drawing</div>
      <div className="modal-actions">
        <button
          className="pixel-btn"
          onClick={() => {
            setDrawTool('trend');
            onClose();
          }}
        >
          TRENDLINE
        </button>
        <button
          className="pixel-btn"
          onClick={() => {
            setDrawTool('hline');
            onClose();
          }}
        >
          HORIZONTAL LINE
        </button>
        <button className="pixel-btn" onClick={() => undo()}>
          UNDO DRAWING
        </button>
      </div>
    </Modal>
  );
}

export function HelpModal() {
  const open = useApp((s) => s.helpOpen);
  const setHelp = useApp((s) => s.setHelp);
  const keys = useApp((s) => s.settings.hotkeys);
  if (!open) return null;
  const glossary: [string, string][] = [
    [
      'IV rank (IVR)',
      'Where implied volatility sits in its own one-year range (0 = lowest, 100 = highest). Sell premium when it is high.',
    ],
    [
      'Expected move (EM)',
      'The market-implied one-standard-deviation move to expiration, from the at-the-money straddle. Keep short strikes outside it.',
    ],
    [
      'POP',
      "Probability the trade makes money at expiration, from a lognormal model using the options' own IV.",
    ],
    [
      'Delta (Δ)',
      'How much the position gains per $1 rise in the stock. A 30Δ short strike is roughly a 30% chance of finishing in the money.',
    ],
    ['Theta (Θ)', 'What time decay pays (or costs) you per day.'],
    ['Vega', 'What a 1-point change in implied volatility does to the position.'],
    [
      'Edge Rank',
      'How your credit per dollar of width compares with every similar spread on the same chain that day.',
    ],
    [
      'Natural / mid',
      'Natural is the worst price (buy the ask, sell the bid) and always fills. Mid is halfway and fills less often.',
    ],
    [
      'Pin risk',
      'When the stock closes right at your short strike on expiration day, you may or may not be assigned.',
    ],
  ];
  return (
    <Modal onClose={() => setHelp(false)} wide testId="help-modal">
      <h2>Help and glossary</h2>
      <div className="help-grid">
        <div>
          <div className="section-title">Glossary</div>
          {glossary.map(([k, v]) => (
            <p key={k}>
              <b className="amber-text">{k}:</b> {v}
            </p>
          ))}
        </div>
        <div className="num">
          <div className="section-title">Hotkeys (thinkorswim defaults, remap in Settings)</div>
          {(
            [
              [
                'positions',
                'builder',
                'analyze',
                'lineup',
                'studies',
                'timeframe',
                'home',
                'back',
                'help',
                'settings',
              ],
              [
                'sell',
                'buy',
                'flatten',
                'reverse',
                'autoSend',
                'playPause',
                'confirm',
                'ladderIn',
                'ladderOut',
              ],
            ] as const
          ).map((group, gi) => (
            <div key={gi} className="hotkey-list">
              {group.map((a) => (
                <div key={a}>
                  <Kbd>{keys[a]}</Kbd> {a}
                </div>
              ))}
            </div>
          ))}
          <p>
            <Kbd>1-5</Kbd> call bucket ({BUCKET_NAMES.join(', ')}) · <Kbd>Shift+1-5</Kbd> confidence{' '}
            {CONFIDENCES.map((c) => `${c * 100}%`).join('/')}
          </p>
        </div>
      </div>
    </Modal>
  );
}

export function TradingTopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  if (!session) return null;
  const marked = session.markedEquityCents();
  return (
    <div className="topbar panel" data-testid="topbar">
      {left}
      <div className="tb-item num">
        <span className="dim">EQUITY</span> <span data-testid="equity">{money(marked)}</span>
      </div>
      <div className="tb-item num">
        <span className="dim">REALIZED</span> <Pnl cents={session.realizedCents} testId="realized" />
      </div>
      <div className="tb-item num">
        <span className="dim">DAY</span> {session.dayIndex}
      </div>
      <div className="tb-spacer" />
      {right}
      <FastForwardBar />
    </div>
  );
}

export function TradingLayout({
  top,
  allowedStructures,
  onDone,
  leftExtra,
  rightExtra,
  badges,
  levels,
}: {
  top: ReactNode;
  levels?: Partial<Record<StructureId, number>>;
  allowedStructures?: StructureId[];
  onDone?: ReactNode;
  leftExtra?: ReactNode;
  rightExtra?: ReactNode;
  badges?: (cardId: string) => CardBadges;
}) {
  const panel = useTrading((s) => s.panel);
  const setPanel = useTrading((s) => s.setPanel);
  const ff = useTrading((s) => s.ff);
  const shake = useTrading((s) => s.shake);
  const debriefs = useTrading((s) => s.debriefs);
  const session = useTrading((s) => s.session);
  const reverse = useTrading((s) => s.reverse);
  const setCall = useTrading((s) => s.setCall);
  const setConfidence = useTrading((s) => s.setConfidence);
  const setHelp = useApp((s) => s.setHelp);
  const controls = useAnimationControls();
  const [studiesOpen, setStudiesOpen] = useStudyPicker();

  useEffect(() => {
    if (shake > 0)
      void controls.start({
        x: [0, -10, 9, -6, 4, 0],
        y: [0, 5, -4, 3, -1, 0],
        transition: { duration: 0.4 },
      });
  }, [shake]);

  const tabs: Panel[] = ['builder', 'positions', 'analyze'];
  useHotkeys({
    positions: () => setPanel('positions'),
    builder: () => setPanel('builder'),
    analyze: () => setPanel('analyze'),
    nextPanel: () => setPanel(tabs[(tabs.indexOf(panel) + 1) % tabs.length]),
    prevPanel: () => setPanel(tabs[(tabs.indexOf(panel) + tabs.length - 1) % tabs.length]),
    reverse: () => reverse(),
    studies: () => setStudiesOpen(true),
    timeframe: () => useTrading.getState().setTimeframe(useTrading.getState().timeframe === 'D' ? 'W' : 'D'),
    help: () => setHelp(true),
    bucket1: () => void setCall(0),
    bucket2: () => void setCall(1),
    bucket3: () => void setCall(2),
    bucket4: () => void setCall(3),
    bucket5: () => void setCall(4),
    conf1: () => void setConfidence(0.5),
    conf2: () => void setConfidence(0.6),
    conf3: () => void setConfidence(0.7),
    conf4: () => void setConfidence(0.8),
    conf5: () => void setConfidence(0.9),
  });

  if (ff === 'done' && onDone) {
    return (
      <div className="trading-done" data-testid="trading-done">
        <DebriefStrip debriefs={debriefs} blind={session?.config.blind ?? false} />
        {onDone}
      </div>
    );
  }

  return (
    <motion.div className="trading" animate={controls} data-testid="trading-screen">
      <div className="t-top">{top}</div>
      <div className="t-left">
        <LineupColumn extra={leftExtra} badges={badges} />
      </div>
      <div className="t-center">
        <ChartPanel />
        <NewsTicker />
      </div>
      <div className="t-right panel">
        <PayoffChart />
        <StatsBlock />
        {rightExtra}
      </div>
      <div className="t-tray panel">
        <div className="tray-tabs num">
          {tabs.map((t) => (
            <button
              key={t}
              className={panel === t ? 'sel' : ''}
              onClick={() => setPanel(t)}
              data-testid={`tab-${t}`}
            >
              {t.toUpperCase()}{' '}
              <span className="kbd">Ctrl+{t === 'positions' ? 1 : t === 'builder' ? 2 : 3}</span>
            </button>
          ))}
          <button onClick={() => setStudiesOpen(true)}>
            STUDIES <span className="kbd">Ctrl+E</span>
          </button>
          <button onClick={() => setHelp(true)}>
            HELP <span className="kbd">Ctrl+8</span>
          </button>
        </div>
        <div className="tray-body">
          {panel === 'builder' && (
            <div className="builder-row">
              <CallCards />
              <StructureCards allowed={allowedStructures} levels={levels} />
              <div className="tray-col">
                <ExpiryChips />
                <SizeControls />
              </div>
              <OrderTicket />
            </div>
          )}
          {panel === 'positions' && <PositionsDock />}
          {panel === 'analyze' && <AnalyzePanel />}
        </div>
      </div>
      <DecisionModal />
      {studiesOpen && <StudyPicker onClose={() => setStudiesOpen(false)} />}
    </motion.div>
  );
}

function useStudyPicker(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  return [
    open,
    (v: boolean) => {
      if (v) sfx('select');
      setOpen(v);
    },
  ];
}
