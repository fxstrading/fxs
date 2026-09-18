// src/lib/trading/indicators.ts
//
// Pure functions computing standard technical indicators from OHLC candle
// data. No chart library dependency here — just math — so these are easy
// to unit test and reuse (e.g. if we ever add server-side signal alerts).

export type CandlePoint = { time: number; close: number };

export type LinePoint = { time: number; value: number };

export function sma(candles: CandlePoint[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) {
      out.push({ time: candles[i].time, value: sum / period });
    }
  }
  return out;
}

export function ema(candles: CandlePoint[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  if (candles.length < period) return out;

  const k = 2 / (period + 1);
  // Seed with a simple average of the first `period` closes
  let prev = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  out.push({ time: candles[period - 1].time, value: prev });

  for (let i = period; i < candles.length; i++) {
    const value = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value });
    prev = value;
  }
  return out;
}

export function bollingerBands(
  candles: CandlePoint[],
  period = 20,
  stdDevMultiplier = 2
): { upper: LinePoint[]; middle: LinePoint[]; lower: LinePoint[] } {
  const middle = sma(candles, period);
  const upper: LinePoint[] = [];
  const lower: LinePoint[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const mean = middle[i - period + 1].value;
    const variance = window.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    upper.push({ time: candles[i].time, value: mean + stdDevMultiplier * stdDev });
    lower.push({ time: candles[i].time, value: mean - stdDevMultiplier * stdDev });
  }

  return { upper, middle, lower };
}

// Wilder's smoothing method, the standard RSI calculation
export function rsi(candles: CandlePoint[], period = 14): LinePoint[] {
  const out: LinePoint[] = [];
  if (candles.length < period + 1) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const rsiAt = (ag: number, al: number) => {
    if (al === 0) return 100;
    const rs = ag / al;
    return 100 - 100 / (1 + rs);
  };

  out.push({ time: candles[period].time, value: rsiAt(avgGain, avgLoss) });

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].time, value: rsiAt(avgGain, avgLoss) });
  }

  return out;
}
