"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { createClient } from "@/lib/supabase/client";
import { sma, ema, bollingerBands, rsi, type CandlePoint } from "@/lib/trading/indicators";
import ChartDrawingLayer, { type DrawingTool } from "./ChartDrawingLayer";

type Candle = {
  bucket_ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type IndicatorKey = "sma20" | "ema20" | "bollinger" | "rsi";

const INDICATOR_LABELS: Record<IndicatorKey, string> = {
  sma20: "SMA 20",
  ema20: "EMA 20",
  bollinger: "Bollinger",
  rsi: "RSI 14",
};

function precisionFromPipSize(pipSize?: number): number {
  if (!pipSize || pipSize <= 0) return 2;
  const decimalPart = pipSize.toString().split(".")[1] ?? "";
  return decimalPart.length + 1; // one extra decimal beyond the pip, standard forex quoting convention
}

export default function PriceChart({
  marketId,
  latestTick,
  pipSize,
}: {
  marketId: string;
  latestTick?: { bid: number; ask: number; ts: string };
  pipSize?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const currentCandleRef = useRef<{ ts: number; open: number; high: number; low: number; close: number } | null>(null);

  // Full candle history kept in memory so indicators can be recomputed on
  // every tick without a round trip to the database.
  const candlesRef = useRef<{ time: number; open: number; high: number; low: number; close: number }[]>([]);

  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(new Set());
  const activeIndicatorsRef = useRef<Set<IndicatorKey>>(activeIndicators);

  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [clearSignal, setClearSignal] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    activeIndicatorsRef.current = activeIndicators;
  }, [activeIndicators]);

  // Memoized for the same reason as in TradingTerminal.tsx — see
  // lib/supabase/client.ts for the underlying singleton fix.
  const supabase = useMemo(() => createClient(), []);

  function toggleIndicator(key: IndicatorKey) {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function recomputeIndicators() {
    const chart = chartRef.current;
    if (!chart) return;

    const points: CandlePoint[] = candlesRef.current.map((c) => ({ time: c.time, close: c.close }));

    // SMA
    if (activeIndicatorsRef.current.has("sma20")) {
      if (!smaSeriesRef.current) {
        smaSeriesRef.current = chart.addLineSeries({ color: "#facc15", lineWidth: 2, priceLineVisible: false });
      }
      smaSeriesRef.current.setData(sma(points, 20).map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    } else if (smaSeriesRef.current) {
      chart.removeSeries(smaSeriesRef.current);
      smaSeriesRef.current = null;
    }

    // EMA
    if (activeIndicatorsRef.current.has("ema20")) {
      if (!emaSeriesRef.current) {
        emaSeriesRef.current = chart.addLineSeries({ color: "#38bdf8", lineWidth: 2, priceLineVisible: false });
      }
      emaSeriesRef.current.setData(ema(points, 20).map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    } else if (emaSeriesRef.current) {
      chart.removeSeries(emaSeriesRef.current);
      emaSeriesRef.current = null;
    }

    // Bollinger Bands
    if (activeIndicatorsRef.current.has("bollinger")) {
      const bb = bollingerBands(points, 20, 2);
      if (!bbUpperRef.current) {
        bbUpperRef.current = chart.addLineSeries({ color: "#a78bfa", lineWidth: 1, priceLineVisible: false });
        bbMiddleRef.current = chart.addLineSeries({ color: "#a78bfa80", lineWidth: 1, priceLineVisible: false, lineStyle: 2 });
        bbLowerRef.current = chart.addLineSeries({ color: "#a78bfa", lineWidth: 1, priceLineVisible: false });
      }
      bbUpperRef.current!.setData(bb.upper.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      bbMiddleRef.current!.setData(bb.middle.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      bbLowerRef.current!.setData(bb.lower.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    } else if (bbUpperRef.current) {
      chart.removeSeries(bbUpperRef.current);
      chart.removeSeries(bbMiddleRef.current!);
      chart.removeSeries(bbLowerRef.current!);
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
    }

    // RSI — rendered in the bottom slice of the same pane, its own 0-100 scale
    if (activeIndicatorsRef.current.has("rsi")) {
      if (!rsiSeriesRef.current) {
        rsiSeriesRef.current = chart.addLineSeries({
          color: "#fb923c",
          lineWidth: 2,
          priceLineVisible: false,
          priceScaleId: "rsi",
        });
        chart.priceScale("rsi").applyOptions({
          scaleMargins: { top: 0.75, bottom: 0 },
        });
      }
      rsiSeriesRef.current.setData(rsi(points, 14).map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    } else if (rsiSeriesRef.current) {
      chart.removeSeries(rsiSeriesRef.current);
      rsiSeriesRef.current = null;
    }
  }

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b899b",
      },
      grid: {
        vertLines: { color: "#2c2e42" },
        horzLines: { color: "#2c2e42" },
      },
      width: containerRef.current.clientWidth,
      height: 300,
      timeScale: { timeVisible: true, secondsVisible: false },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true, // one-finger drag to pan through time
        vertTouchDrag: false, // reserved so a vertical finger drag doesn't fight the page's own scroll
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true, // two-finger pinch to zoom
      },
      kineticScroll: { touch: true, mouse: false }, // momentum/inertia after a touch pan, feels native on mobile
    });

    const series = chart.addCandlestickSeries({
      upColor: "#4ade80",
      downColor: "#f87171",
      borderVisible: false,
      wickUpColor: "#4ade80",
      wickDownColor: "#f87171",
      priceFormat: {
        type: "price",
        precision: precisionFromPipSize(pipSize),
        minMove: pipSize ? pipSize / 10 : 0.01,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    setChartWidth(containerRef.current.clientWidth);

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
        setChartWidth(containerRef.current.clientWidth);
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
      rsiSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load historical candles whenever the active market changes
  useEffect(() => {
    if (!marketId || !seriesRef.current) return;

    currentCandleRef.current = null;

    (async () => {
      const { data, error } = await supabase.rpc("get_candles", {
        p_market_id: marketId,
        p_interval_seconds: 60,
        p_limit: 200,
      });

      if (error) {
        console.error("[PriceChart] get_candles failed:", error.message);
        return;
      }
      if (!data || !seriesRef.current) return;

      const candles = (data as Candle[])
        .slice()
        .reverse()
        .map((c) => ({
          time: Math.floor(new Date(c.bucket_ts).getTime() / 1000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

      candlesRef.current = candles;

      seriesRef.current.applyOptions({
        priceFormat: {
          type: "price",
          precision: precisionFromPipSize(pipSize),
          minMove: pipSize ? pipSize / 10 : 0.01,
        },
      });

      seriesRef.current.setData(
        candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
      );

      if (candles.length > 0) {
        const last = candles[candles.length - 1];
        currentCandleRef.current = { ...last, ts: last.time };
      }

      chartRef.current?.timeScale().fitContent();
      recomputeIndicators();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId, supabase]);

  // Re-run indicator calculations whenever the toggled set changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    recomputeIndicators();
  }, [activeIndicators]);

  // Live tick updates: fold each new tick into the currently-forming 1-minute
  // candle. Uses the `latestTick` prop (already subscribed once by the parent
  // TradingTerminal) instead of opening a second, redundant realtime
  // subscription — halves the realtime egress for anyone viewing the chart.
  useEffect(() => {
    if (!marketId || !latestTick) return;

    const mid = (latestTick.bid + latestTick.ask) / 2;
    const tickTime = Math.floor(new Date(latestTick.ts).getTime() / 1000);
    const bucketTs = Math.floor(tickTime / 60) * 60;

    if (!seriesRef.current) return;

    const current = currentCandleRef.current;
    let updatedCandle: { ts: number; open: number; high: number; low: number; close: number };

    if (!current || current.ts !== bucketTs) {
      updatedCandle = { ts: bucketTs, open: mid, high: mid, low: mid, close: mid };
      candlesRef.current = [...candlesRef.current, { time: bucketTs, open: mid, high: mid, low: mid, close: mid }];
    } else {
      updatedCandle = {
        ts: bucketTs,
        open: current.open,
        high: Math.max(current.high, mid),
        low: Math.min(current.low, mid),
        close: mid,
      };
      const last = candlesRef.current[candlesRef.current.length - 1];
      if (last && last.time === bucketTs) {
        last.high = updatedCandle.high;
        last.low = updatedCandle.low;
        last.close = updatedCandle.close;
      }
    }

    currentCandleRef.current = updatedCandle;
    seriesRef.current.update({
      time: bucketTs as UTCTimestamp,
      open: updatedCandle.open,
      high: updatedCandle.high,
      low: updatedCandle.low,
      close: updatedCandle.close,
    });

    recomputeIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestTick, marketId]);

  return (
    <div className="flex flex-col md:flex-row gap-3">
      <div className="flex-1 min-w-0">
        <div style={{ position: "relative" }}>
          <div ref={containerRef} className="w-full" />
          <ChartDrawingLayer
            chart={chartRef.current}
            series={seriesRef.current}
            width={chartWidth}
            height={300}
            activeTool={activeTool}
            onToolUsed={() => setActiveTool("cursor")}
            clearSignal={clearSignal}
          />
        </div>
      </div>

      {/* Indicator + drawing tools: a right-side column on wider screens,
          stacked above the chart on narrow/mobile viewports where a side
          column wouldn't leave enough room for the chart itself. */}
      <div className="flex flex-row md:flex-col gap-1.5 flex-wrap md:w-36 md:shrink-0 order-first md:order-last">
        <p className="text-xs font-semibold w-full hidden md:block" style={{ color: "var(--text-muted)" }}>
          Indicators
        </p>
        {(Object.keys(INDICATOR_LABELS) as IndicatorKey[]).map((key) => (
          <button
            key={key}
            onClick={() => toggleIndicator(key)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition md:w-full md:text-left"
            style={
              activeIndicators.has(key)
                ? { background: "rgba(59,130,246,0.15)", color: "var(--fxs-blue)", border: "1px solid var(--fxs-blue)" }
                : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
            }
          >
            {INDICATOR_LABELS[key]}
          </button>
        ))}

        <p className="text-xs font-semibold w-full hidden md:block mt-2" style={{ color: "var(--text-muted)" }}>
          Draw
        </p>
        {(
          [
            ["cursor", "Cursor"],
            ["trendline", "Trend Line"],
            ["horizontal", "Horizontal"],
            ["arrow", "Arrow"],
            ["fib", "Fibonacci"],
          ] as [DrawingTool, string][]
        ).map(([tool, label]) => (
          <button
            key={tool}
            onClick={() => setActiveTool(tool)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition md:w-full md:text-left"
            style={
              activeTool === tool
                ? { background: "rgba(255,200,87,0.15)", color: "var(--gold)", border: "1px solid var(--gold)" }
                : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
            }
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setClearSignal((n) => n + 1)}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition md:w-full md:text-left"
          style={{ background: "var(--bg-elevated)", color: "#f87171", border: "1px solid var(--border)" }}
        >
          Clear
        </button>
        <button
          onClick={() => chartRef.current?.timeScale().fitContent()}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition md:w-full md:text-left"
          style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          ⤢ Reset zoom
        </button>
      </div>
    </div>
  );
}
