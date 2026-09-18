"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

export type DrawingTool = "cursor" | "trendline" | "horizontal" | "arrow" | "fib";

type Point = { time: number; price: number };

type Drawing = {
  id: string;
  type: Exclude<DrawingTool, "cursor">;
  p1: Point;
  p2: Point;
};

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export default function ChartDrawingLayer({
  chart,
  series,
  width,
  height,
  activeTool,
  onToolUsed,
  clearSignal,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  width: number;
  height: number;
  activeTool: DrawingTool;
  onToolUsed: () => void;
  clearSignal: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  const draftRef = useRef<{ p1: Point } | null>(null);
  const draftEndRef = useRef<Point | null>(null);
  const activeToolRef = useRef(activeTool);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  function pixelToPoint(x: number, y: number): Point | null {
    if (!chart || !series) return null;
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return { time: time as number, price };
  }

  function pointToPixel(p: Point): { x: number; y: number } | null {
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(p.time as never);
    const y = series.priceToCoordinate(p.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const all: Drawing[] = [...drawingsRef.current];
    if (draftRef.current && draftEndRef.current && activeToolRef.current !== "cursor") {
      all.push({
        id: "__draft",
        type: activeToolRef.current as Drawing["type"],
        p1: draftRef.current.p1,
        p2: draftEndRef.current,
      });
    }

    for (const d of all) {
      drawOne(ctx, d, d.id === "__draft");
    }
  }

  function drawOne(ctx: CanvasRenderingContext2D, d: Drawing, isDraft: boolean) {
    const a = pointToPixel(d.p1);
    const b = pointToPixel(d.p2);
    if (!a || !b) return;

    const color = isDraft ? "#ffc85799" : "#ffc857";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    if (d.type === "trendline") {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (d.type === "horizontal") {
      ctx.beginPath();
      ctx.moveTo(0, a.y);
      ctx.lineTo(ctx.canvas.width, a.y);
      ctx.stroke();
      ctx.font = "11px sans-serif";
      ctx.fillText(d.p1.price.toFixed(2), ctx.canvas.width - 60, a.y - 4);
    } else if (d.type === "arrow") {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const headLen = 10;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - headLen * Math.cos(angle - Math.PI / 6), b.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(b.x - headLen * Math.cos(angle + Math.PI / 6), b.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (d.type === "fib") {
      const top = Math.min(d.p1.price, d.p2.price);
      const bottom = Math.max(d.p1.price, d.p2.price);
      const range = bottom - top;
      ctx.font = "10px sans-serif";
      for (const level of FIB_LEVELS) {
        const price = bottom - range * level;
        const y = series?.priceToCoordinate(price);
        if (y === null || y === undefined) continue;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(ctx.canvas.width, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(`${(level * 100).toFixed(1)}%  ${price.toFixed(2)}`, 6, y - 3);
      }
    }
  }

  // Redraw whenever chart pans/zooms
  useEffect(() => {
    if (!chart) return;
    const handler = () => redraw();
    chart.timeScale().subscribeVisibleTimeRangeChange(handler);
    return () => chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series]);

  // Redraw on size change
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // Clear all drawings when the parent bumps clearSignal
  const firstClear = useRef(true);
  useEffect(() => {
    if (firstClear.current) {
      firstClear.current = false;
      return;
    }
    drawingsRef.current = [];
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal]);

  function startDraft(clientX: number, clientY: number, rect: DOMRect) {
    if (activeTool === "cursor") return;
    const p = pixelToPoint(clientX - rect.left, clientY - rect.top);
    if (!p) return;

    if (activeTool === "horizontal") {
      drawingsRef.current = [...drawingsRef.current, { id: crypto.randomUUID(), type: "horizontal", p1: p, p2: p }];
      onToolUsed();
      redraw();
      return;
    }

    draftRef.current = { p1: p };
    draftEndRef.current = p;
  }

  function updateDraft(clientX: number, clientY: number, rect: DOMRect) {
    if (!draftRef.current) return;
    const p = pixelToPoint(clientX - rect.left, clientY - rect.top);
    if (!p) return;
    draftEndRef.current = p;
    redraw();
  }

  function finishDraft() {
    if (!draftRef.current || !draftEndRef.current) return;
    drawingsRef.current = [
      ...drawingsRef.current,
      { id: crypto.randomUUID(), type: activeTool as Drawing["type"], p1: draftRef.current.p1, p2: draftEndRef.current },
    ];
    draftRef.current = null;
    draftEndRef.current = null;
    onToolUsed();
    redraw();
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    startDraft(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    updateDraft(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  }

  function handleMouseUp() {
    finishDraft();
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (activeTool === "cursor") return;
    e.preventDefault(); // stop the page from scrolling/panning while drawing
    const touch = e.touches[0];
    if (!touch) return;
    startDraft(touch.clientX, touch.clientY, e.currentTarget.getBoundingClientRect());
  }

  function handleTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (!draftRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    updateDraft(touch.clientX, touch.clientY, e.currentTarget.getBoundingClientRect());
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) {
    if (activeTool !== "cursor") e.preventDefault();
    finishDraft();
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute top-0 left-0"
      style={{
        zIndex: 20,
        pointerEvents: activeTool === "cursor" ? "none" : "auto",
        cursor: activeTool === "cursor" ? "default" : "crosshair",
        touchAction: activeTool === "cursor" ? "auto" : "none",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  );
}
