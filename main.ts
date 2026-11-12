import { createInterface } from "node:readline";

const SYMBOL = "CBBTC";
const MOMENTUM_BARS = 60;
const ENTRY_MOMENTUM_BPS = 60;
const FAST_CONFIRM_BARS = 10;
const BROAD_TREND_BARS = 240;
const TRAILING_STOP_BPS = 50;
const MAX_HOLD_BARS = 120;
const COOLDOWN_BARS = 30;
const TARGET_CASH_BPS = 8000n;
const ORDER_SLIPPAGE_BPS = 150;

const closes = [];
let barIndex = -1;
let peakClose = 0;
let entryBar = -1;
let lastExitBar = -1_000_000;
let orderNumber = 0;
let pendingClientId = null;
let minimumNotional = 1_000_000n;

function changeBps(current, previous) {
  return 10_000 * (current / previous - 1);
}

function nextClientId(side) {
  orderNumber += 1;
  return `${side}-${orderNumber}`;
}

function positionFrom(account) {
  return account.positions.find(
    (position) => position.symbol === SYMBOL && BigInt(position.qty) > 0n,
  );
}

function reconcilePending(message, position) {
  if (pendingClientId === null) return;

  const result = message.fills.find((fill) => fill.client_id === pendingClientId);
  if (result === undefined) return;

  if (result.status === "rejected" && position === undefined) entryBar = -1;
  pendingClientId = null;
}

function decide(message) {
  const orders = [];
  const bar = message.bars.find((candidate) => candidate.symbol === SYMBOL);
  const position = positionFrom(message.account);

  reconcilePending(message, position);
  if (bar === undefined) return orders;

  const close = Number(bar.c);
  closes.push(close);
  barIndex += 1;

  if (position !== undefined) {
    peakClose = Math.max(peakClose, close);

    if (closes.length > MOMENTUM_BARS) {
      const slowMomentum = changeBps(
        close,
        closes[closes.length - 1 - MOMENTUM_BARS],
      );
      const reversal = changeBps(close, peakClose);
      const heldBars = entryBar < 0 ? 0 : barIndex - entryBar;

      if (
        slowMomentum <= 0 ||
        reversal <= -TRAILING_STOP_BPS ||
        heldBars >= MAX_HOLD_BARS
      ) {
        const clientId = nextClientId("sell");
        orders.push({
          side: "sell",
          client_id: clientId,
          symbol: SYMBOL,
          qty: position.qty,
          max_slippage_bps: ORDER_SLIPPAGE_BPS,
        });
        pendingClientId = clientId;
        lastExitBar = barIndex;
      }
    }

    return orders;
  }

  if (
    pendingClientId !== null ||
    closes.length <= MOMENTUM_BARS ||
    barIndex - lastExitBar <= COOLDOWN_BARS
  ) {
    return orders;
  }

  const slowMomentum = changeBps(
    close,
    closes[closes.length - 1 - MOMENTUM_BARS],
  );
  const fastMomentum = changeBps(
    close,
    closes[closes.length - 1 - FAST_CONFIRM_BARS],
  );
  const broadTrendSupportsEntry =
    closes.length <= BROAD_TREND_BARS ||
    changeBps(
      close,
      closes[closes.length - 1 - BROAD_TREND_BARS],
    ) >= 0;

  if (
    slowMomentum > ENTRY_MOMENTUM_BPS &&
    fastMomentum > 0 &&
    broadTrendSupportsEntry
  ) {
    const cash = BigInt(message.account.cash_quote_units);
    const notional = (cash * TARGET_CASH_BPS) / 10_000n;

    if (notional >= minimumNotional) {
      const clientId = nextClientId("buy");
      orders.push({
        side: "buy",
        client_id: clientId,
        symbol: SYMBOL,
        notional_quote_units: notional.toString(),
        max_slippage_bps: ORDER_SLIPPAGE_BPS,
      });
      pendingClientId = clientId;
      entryBar = barIndex;
      peakClose = close;
    }
  }

  return orders;
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

input.on("line", (line) => {
  const message = JSON.parse(line);

  if (message.type === "hello") {
    if (message.protocol !== "agent-fun/bars-replay/v1") process.exitCode = 1;
    minimumNotional = BigInt(message.fees.min_notional_quote_units);
    return;
  }

  if (message.type === "batch") {
    const reply = { type: "reply", seq: message.seq, orders: decide(message) };
    process.stdout.write(`${JSON.stringify(reply)}\n`);
  }
});
