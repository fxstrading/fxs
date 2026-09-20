// src/lib/trading/analysis.ts
//
// Rule-based "market analysis" — plain-language summary derived entirely
// from the same SMA/EMA/RSI/Bollinger math already used for the chart
// overlays (indicators.ts). Deliberately NOT an LLM: no API call, no
// per-use cost, no rate limit, and no risk of an AI model phrasing
// something as investment advice. Every line here traces back to a
// concrete, inspectable rule (e.g. "RSI > 70"), which matters on a
// real-money trading platform — see the disclaimer text below, which
// callers should always render alongside the output.
//
// This is intentionally simple pattern-matching over a few standard
// indicators, not a trading strategy or a signal generator. Treat it as
// a plain-language readout of numbers the user could compute themselves,
// not a recommendation.

import { sma, ema, rsi, bollingerBands, type CandlePoint } from "./indicators";

export type Bias = "bullish" | "bearish" | "neutral";

export type AnalysisResult = {
  bias: Bias;
  summary: string; // one-line headline
  points: string[]; // supporting bullet points, each tied to one indicator
};

const MIN_CANDLES_REQUIRED = 21; // needs at least 21 closes for SMA20/EMA20/Bollinger to produce a value

export function generateAnalysis(candles: CandlePoint[]): AnalysisResult | null {
  if (candles.length < MIN_CANDLES_REQUIRED) return null;

  const closes = candles.map((c) => c.close);
  const lastClose = closes[closes.length - 1];

  const smaSeries = sma(candles, 20);
  const emaSeries = ema(candles, 20);
  const rsiSeries = rsi(candles, 14);
  const bb = bollingerBands(candles, 20, 2);

  const lastSma = smaSeries[smaSeries.length - 1]?.value ?? null;
  const lastEma = emaSeries[emaSeries.length - 1]?.value ?? null;
  const lastRsi = rsiSeries[rsiSeries.length - 1]?.value ?? null;
  const lastBbUpper = bb.upper[bb.upper.length - 1]?.value ?? null;
  const lastBbLower = bb.lower[bb.lower.length - 1]?.value ?? null;

  const points: string[] = [];
  let bullishSignals = 0;
  let bearishSignals = 0;

  // --- Trend, via price vs SMA20/EMA20 ---
  if (lastSma !== null) {
    if (lastClose > lastSma) {
      points.push(`Price is trading above its 20-period SMA (${lastSma.toFixed(2)}), consistent with an uptrend.`);
      bullishSignals++;
    } else {
      points.push(`Price is trading below its 20-period SMA (${lastSma.toFixed(2)}), consistent with a downtrend.`);
      bearishSignals++;
    }
  }

  if (lastEma !== null) {
    if (lastClose > lastEma) {
      bullishSignals++;
    } else {
      bearishSignals++;
    }
  }

  // --- Momentum, via RSI14 ---
  if (lastRsi !== null) {
    if (lastRsi >= 70) {
      points.push(`RSI is at ${lastRsi.toFixed(0)}, in overbought territory (≥70) — momentum has been strongly upward, sometimes a precursor to a pullback.`);
      bearishSignals++; // overbought leans toward a mean-reversion read
    } else if (lastRsi <= 30) {
      points.push(`RSI is at ${lastRsi.toFixed(0)}, in oversold territory (≤30) — momentum has been strongly downward, sometimes a precursor to a bounce.`);
      bullishSignals++;
    } else {
      points.push(`RSI is at ${lastRsi.toFixed(0)}, in neutral territory — no strong overbought/oversold signal.`);
    }
  }

  // --- Volatility positioning, via Bollinger Bands ---
  if (lastBbUpper !== null && lastBbLower !== null) {
    if (lastClose >= lastBbUpper) {
      points.push(`Price is at or above the upper Bollinger Band — trading at the high end of its recent volatility range.`);
    } else if (lastClose <= lastBbLower) {
      points.push(`Price is at or below the lower Bollinger Band — trading at the low end of its recent volatility range.`);
    } else {
      const bandWidth = lastBbUpper - lastBbLower;
      const positionPct = bandWidth > 0 ? ((lastClose - lastBbLower) / bandWidth) * 100 : 50;
      points.push(`Price is within its Bollinger Bands, roughly ${positionPct.toFixed(0)}% of the way from the lower to upper band.`);
    }
  }

  let bias: Bias = "neutral";
  if (bullishSignals > bearishSignals) bias = "bullish";
  else if (bearishSignals > bullishSignals) bias = "bearish";

  const summary =
    bias === "bullish"
      ? "Indicators lean bullish"
      : bias === "bearish"
      ? "Indicators lean bearish"
      : "Indicators are mixed / neutral";

  return { bias, summary, points };
}

// Always render this alongside any analysis output.
export const ANALYSIS_DISCLAIMER =
  "This is an automated readout of standard technical indicators, not investment advice or a prediction. Past price action does not guarantee future results.";
