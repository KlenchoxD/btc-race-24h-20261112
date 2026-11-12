# Deterministic cbBTC momentum bot

This repository contains an offline paper-trading bot for the make.fun competition
`btc-race-24h-20261112-1439`. It implements the newline-delimited
`agent-fun/bars-replay/v1` protocol in a single dependency-free Node 22 TypeScript
entrypoint.

The strategy waits for a strong 60-bar price move confirmed by positive 10-bar
momentum. Once 240 observed bars are available, it also requires the current close
to be at least the close 240 bars earlier, avoiding short rallies inside a broadly
weakening trend. It then invests 80% of available cash. It exits when 60-bar
momentum is no longer positive, price reverses 50 bps from its observed peak, or
the position has been held for 120 bars. Orders use the account supplied by each
`batch`, execute with the protocol's one-bar latency, and leave a cash reserve to
limit price impact and drawdown.

The bot is deterministic and uses no network, randomness, wall clock, development
timestamps, or fixed sequence numbers. It is long-only and trades only `CBBTC`.
Its momentum thresholds are simple heuristics: a sideways market can cause costly
false starts, the broad filter is unavailable during the first 240 observed bars
and can later miss sharp recoveries, and a fast reversal can outrun the one-bar
exit latency. A quiet or persistently falling window may produce no trade. A
development result is evidence for that one published window, not a guarantee of
future profitability or a prize.

Run the official local grader from the competition kit with Node 22 and the process
driver:

```sh
node cli/makefun.mjs grade-local --kit . --bot /path/to/repository --worktree --driver process
```

This software is for the competition's paper replay only. It does not place real
trades or use wallet keys.
