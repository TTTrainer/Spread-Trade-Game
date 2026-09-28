import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { CLIENT_BY_ID, type ClientDef } from '../../content/clients';
import { DESKS } from '../../content/desks';
import type { WindowDef } from '../../engine/market/types';
import {
  contractBoard,
  contractFilled,
  contractPayout,
  contractStructures,
  type Contract,
} from '../../engine/meta/contracts';
import { contractsDone, recordContract, weekKey } from '../../engine/meta/profile';
import { clientChecks } from '../../engine/run/clients';
import { defaultSessionConfig, TradingSession } from '../../engine/trading/session';
import type { Position } from '../../engine/lifecycle/types';
import { sfx } from '../../audio/sfx';
import { Pnl } from '../components/ui';
import { ipcSource } from '../data/ipcSource';
import { useApp } from '../store/app';
import { useProfile } from '../store/profile';
import { useTrading } from '../store/trading';
import { TradingLayout, TradingTopBar } from '../trading/TradingScreen';
import './screens.css';
import './modes.css';

const src = ipcSource();

interface ActiveContract {
  contract: Contract | null;
  startEquityCents: number;
  result: { filled: boolean; realizedCents: number; bonus: number } | null;
  set: (p: Partial<ActiveContract>) => void;
}

const useContract = create<ActiveContract>((set) => ({
  contract: null,
  startEquityCents: 0,
  result: null,
  set: (p) => set(p),
}));

function factsOf(p: Position) {
  return {
    structureId: p.structureId,
    maxLossCents: p.entry.maxLossCents,
    pop: p.entry.pop,
    dte: p.entry.dte,
    credit: p.openNet < 0,
    rewardToRisk: p.entry.rewardToRisk,
    edgeTier: p.entry.edgeTier,
  };
}

export function ContractsScreen() {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const toast = useApp((s) => s.toast);
  const settings = useApp((s) => s.settings);
  const { profile, load } = useProfile();
  const [windows, setWindows] = useState<WindowDef[] | null>(null);
  const [index, setIndex] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const week = weekKey(new Date());

  useEffect(() => {
    void load();
    void Promise.all([src.windows({}), src.symbols()]).then(([w, syms]) => {
      setWindows(w);
      setIndex(new Set(syms.filter((s) => s.isEtf).map((s) => s.symbol)));
    });
  }, []);

  const board = useMemo(() => (windows ? contractBoard(windows, index, week) : []), [windows, index, week]);
  const done = contractsDone(profile, week);

  const accept = async (c: Contract) => {
    const def = CLIENT_BY_ID[c.clientId];
    const structures = contractStructures(def, profile.desks);
    if (!structures.length) return;
    setBusy(true);
    try {
      const meta = await src.meta();
      const session = new TradingSession(
        src,
        defaultSessionConfig({
          seed: `contract-${c.id}`,
          mode: 'sandbox',
          startEquityCents: settings.game.startingCapitalCents,
          realism: { ...settings.realism },
          pause: { ...settings.game.pause },
          benchmark: meta.benchmark,
          callMode: settings.game.bucketMode,
          blind: true,
          rescale: settings.blind.rescale,
        }),
      );
      await session.dispatch({ t: 'addCard', cardId: 'c1', windowId: c.windowId });
      useContract.getState().set({ contract: c, startEquityCents: session.equityCents(), result: null });
      useTrading.getState().init(session, {
        recordMode: 'contracts',
        maxPositions: 1,
        onChange: () => void onContractChange(),
        onSessionEnd: () => void finishContract(),
      });
      useTrading.getState().setStructure(structures[0]);
      sfx('whoosh');
      go('contractTrading');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'warn');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen contracts" data-testid="contracts-screen">
      <h1 className="screen-title">CONTRACTS</h1>
      <p className="screen-sub">
        This week's client requests ({week}), each on a blind chart. Place one trade that meets every line to
        fill it (paid in Bonus), and earn half again if the trade makes money. Once you place the trade, the
        contract is taken: leaving early forfeits it. You have <b className="amber-text">{profile.bonus}</b>{' '}
        Bonus.
      </p>
      {!windows && <p className="dim">Loading the board…</p>}
      <div className="contract-board">
        {board.map((c) => {
          const def = CLIENT_BY_ID[c.clientId];
          const res = done[c.id];
          const structures = contractStructures(def, profile.desks);
          const needs = c.desks.filter((d) => !profile.desks.includes(d)).map((d) => DESKS[d].name);
          return (
            <div
              key={c.id}
              className={`panel contract ${res ? 'done' : ''}`}
              data-testid={`contract-${c.clientId}`}
            >
              <div className="client-name">{def.name}</div>
              <div className="persona">{def.persona}</div>
              <div className="ask">“{def.ask}”</div>
              <ul className="num">
                {clientChecks(def.request, null, settings.game.startingCapitalCents).map((k) => (
                  <li key={k.label}>{k.label}</li>
                ))}
              </ul>
              <div className="foot num">
                <span>
                  <span className="amber-text">{c.reward} Bonus</span>{' '}
                  <span className="dim">(+{Math.round(c.reward / 2)} if profitable)</span>
                </span>
                {res ? (
                  <span className={`chip ${res.open ? 'warn' : res.filled ? 'good' : 'bad'}`}>
                    {res.open ? 'FORFEITED' : res.filled ? `FILLED +${res.bonus}` : 'NOT FILLED'}
                  </span>
                ) : structures.length ? (
                  <button
                    className="pixel-btn primary"
                    disabled={busy}
                    onClick={() => void accept(c)}
                    data-testid={`accept-${c.clientId}`}
                  >
                    ACCEPT ▶
                  </button>
                ) : (
                  <span className="chip" title="Unlock a desk that trades this in Career">
                    NEEDS {needs.join(' OR ').toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="modal-actions">
        <button className="pixel-btn" onClick={back}>
          BACK
        </button>
      </div>
    </div>
  );
}

/** The first placed trade takes the contract (so a peek at the outcome can't be retried). */
async function onContractChange(): Promise<void> {
  const { contract, startEquityCents, result } = useContract.getState();
  const s = useTrading.getState().session;
  if (!contract || !s || result) return;
  const p = s.positions[0];
  if (!p) return;
  const done = contractsDone(useProfile.getState().profile, contract.week)[contract.id];
  if (done) return;
  const filled = contractFilled(CLIENT_BY_ID[contract.clientId], factsOf(p), startEquityCents);
  await useProfile
    .getState()
    .set((pr) =>
      recordContract(pr, contract.week, contract.id, { filled, realizedCents: 0, bonus: 0, open: true }),
    );
  useApp
    .getState()
    .toast(
      filled
        ? 'Request filled. Now manage the trade.'
        : 'This trade misses the request. The contract will not pay.',
      filled ? 'good' : 'warn',
    );
}

async function finishContract(): Promise<void> {
  const { contract, startEquityCents } = useContract.getState();
  const s = useTrading.getState().session;
  if (!contract || !s) return;
  const p = s.positions[0];
  if (!p) return;
  const def: ClientDef = CLIENT_BY_ID[contract.clientId];
  const filled = contractFilled(def, factsOf(p), startEquityCents);
  const realized = p.realizedCents ?? 0;
  const bonus = contractPayout(contract.reward, filled, realized);
  await useProfile
    .getState()
    .set((pr) => recordContract(pr, contract.week, contract.id, { filled, realizedCents: realized, bonus }));
  useContract.getState().set({ result: { filled, realizedCents: realized, bonus } });
  if (bonus) sfx('coin');
}

export function ContractTrading() {
  const go = useApp((s) => s.go);
  const { contract, result, startEquityCents } = useContract();
  const profile = useProfile((s) => s.profile);
  const plan = useTrading((s) => s.plan)();
  const builder = useTrading((s) => s.builder);
  const session = useTrading((s) => s.session);
  useTrading((s) => s.version);
  if (!contract) return null;
  const def = CLIENT_BY_ID[contract.clientId];
  const placed = session?.positions[0];
  const facts = placed
    ? factsOf(placed)
    : plan?.ok && plan.entry
      ? {
          structureId: builder.structureId,
          maxLossCents: plan.entry.maxLossCents,
          pop: plan.entry.pop,
          dte: plan.entry.dte,
          credit: (plan.mid ?? 0) < 0,
          rewardToRisk: plan.entry.rewardToRisk,
          edgeTier: plan.entry.edgeTier,
        }
      : null;
  const checks = clientChecks(def.request, facts, startEquityCents);
  const leave = () => {
    useTrading.getState().pause();
    useTrading.getState().reset();
    go('contracts');
  };
  return (
    <TradingLayout
      allowedStructures={contractStructures(def, profile.desks)}
      top={
        <TradingTopBar
          left={
            <>
              <button
                className="pixel-btn"
                onClick={leave}
                data-testid="contract-back"
                title={placed && !result ? 'Leaving now forfeits the contract.' : undefined}
              >
                ◀ BOARD
              </button>
              <div className="tb-item">
                <span className="amber-text">CONTRACT</span> <span className="dim">{def.name}</span>
              </div>
            </>
          }
        />
      }
      leftExtra={
        <div className="client-card open" data-testid="contract-checklist" title={def.persona}>
          <div className="section-title">
            Client <span className="chip">{contract.reward} Bonus</span>
          </div>
          <b className="client-name">{def.name}</b>
          <div className="client-ask">{def.ask}</div>
          <ul className="client-checks num">
            {checks.map((k) => (
              <li key={k.label} className={k.pass ? 'pass' : 'fail'}>
                {k.pass ? '✔' : '✘'} {k.label}
              </li>
            ))}
          </ul>
        </div>
      }
      onDone={
        <div className="modal-actions done-actions" data-testid="contract-result">
          {result && (
            <div className="num">
              {result.filled ? 'Request filled. ' : 'Request not filled. '}
              Trade P/L <Pnl cents={result.realizedCents} />. Bonus{' '}
              <b className="amber-text">+{result.bonus}</b>
            </div>
          )}
          <button className="pixel-btn primary" onClick={leave}>
            BACK TO THE BOARD
          </button>
        </div>
      }
    />
  );
}
