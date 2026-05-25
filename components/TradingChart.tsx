
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { init, dispose, Chart, registerOverlay } from 'klinecharts';
import { registerCustomOverlays } from '../overlays';
import { DERIV_WS_URL, TIMEFRAME_GRANULARITY } from '../constants';
import { NEW_APP_ID } from '../src/services/derivApiService';
import { Timeframe } from '../types';
import { AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

import ChartControls from './ChartControls';

interface TradingChartProps {
  underlying_symbol?: string;
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  barrier?: string | number;
  openPositions?: any[];
}

let overlaysRegistered = false;

const TradingChart: React.FC<TradingChartProps> = ({
  underlying_symbol = '1HZ100V',
  timeframe,
  onTimeframeChange,
  barrier,
  openPositions = []
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const [lastPrice, setLastPrice] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // UI State
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [showDrawingMenu, setShowDrawingMenu] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [showObjectTree, setShowObjectTree] = useState(false);
  const [drawingMode, setDrawingMode] = useState<string | null>(null);
  const [drawingColor, setDrawingColor] = useState('#ef4444');
  const [drawingLineWidth, setDrawingLineWidth] = useState(2);
  const [indicators, setIndicators] = useState<any[]>([]);
  const [drawings, setDrawings] = useState<any[]>([]);
  const [isObjectsVisible, setIsObjectsVisible] = useState(true);
  const [isChartReady, setIsChartReady] = useState(false);
  const [crosshairData, setCrosshairData] = useState<any>(null);
  const [latestCandle, setLatestCandle] = useState<any>(null);
  const barrierOverlayRef = useRef<string | null>(null);

  // Refs for data tracking
  const pingIntervalRef = useRef<any>(null);

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (!overlaysRegistered) {
      try {
        registerCustomOverlays();
        overlaysRegistered = true;
      } catch (e) {
        console.error('Failed to register custom overlays:', e);
      }
    }

    try {
      const chart = init(chartContainerRef.current, {
        styles: {
          grid: {
            show: true,
            horizontal: {
              show: true,
              size: 1,
              color: 'rgba(255, 255, 255, 0.05)',
              style: 'dashed' as any,
              dashedValue: [2, 2]
            },
            vertical: {
              show: true,
              size: 1,
              color: 'rgba(255, 255, 255, 0.05)',
              style: 'dashed' as any,
              dashedValue: [2, 2]
            }
          },
          candle: {
            type: (timeframe.endsWith('t') ? 'area' : 'candle_solid') as any,
            bar: {
              upColor: '#22c55e',
              downColor: '#ef4444',
              noChangeColor: '#888888'
            },
            area: {
              lineSize: 2,
              lineColor: '#ef4444',
              backgroundColor: [{
                offset: 0,
                color: 'rgba(239, 68, 68, 0.2)'
              }, {
                offset: 1,
                color: 'rgba(239, 68, 68, 0)'
              }]
            }
          },
          indicator: {
              lastValueMark: {
                  show: true
              }
          },
          xAxis: {
          },
          yAxis: {
          }
        }
      });

      if (!chart) {
        throw new Error('KLineChart initialization returned null');
      }

      chartRef.current = chart;
      setIsChartReady(true);

      const handleResize = () => {
        chart.resize();
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartContainerRef.current) {
          dispose(chartContainerRef.current);
        }
      };
    } catch (e) {
      console.error('KLineChart Init Error:', e);
      setChartError('Failed to initialize chart engine');
    }
  }, []);

  // Handle Crosshair and OHLC Display
  useEffect(() => {
    if (!chartRef.current || !isChartReady) return;
    // @ts-ignore
    chartRef.current.subscribeAction('onCrosshairChange', (event: any) => {
      if (event.data) {
        setCrosshairData(event.data);
      } else {
        setCrosshairData(null);
      }
    });
  }, [isChartReady]);


  // Handle Timeframe Type Change (Candle vs Area)
  useEffect(() => {
    if (!chartRef.current) return;
    const isTick = timeframe.endsWith('t');
    chartRef.current.setStyles({
      candle: {
        type: (isTick ? 'area' : 'candle_solid') as any
      }
    });
  }, [timeframe]);



  // WebSocket Connection and Data Handling
  useEffect(() => {
    if (!isChartReady) return;
    
    console.log('Starting chart data connection for:', underlying_symbol);
    setIsLoading(true);
    setChartError(null);
    
    if (chartRef.current) {
      chartRef.current.clearData();
    }

    const connectWS = () => {
      // Don't recreate if already connected or connecting
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
      
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      // Connect to the new Deriv API public endpoint without query parameters as per docs
      const wsUrl = DERIV_WS_URL;
      console.log(`[CHART] Connecting to WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const connectionTimeout = setTimeout(() => {
        if (isLoading && !chartError && ws.readyState !== WebSocket.OPEN) {
          console.warn('[CHART] Connection timeout');
          setChartError('Connection timeout. Please check your internet or retry.');
          setIsLoading(false);
          ws.close();
        }
      }, 30000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log(`[CHART] WebSocket connected for ${underlying_symbol}`);
        const granularity = TIMEFRAME_GRANULARITY[timeframe] || 60;
        const isTick = timeframe.endsWith('t');

        const request: any = {
          ticks_history: underlying_symbol,
          count: 1000,
          end: 'latest',
          style: isTick ? 'ticks' : 'candles',
          subscribe: 1,
          req_id: 1 
        };

        if (!isTick) {
          request.granularity = granularity;
        }

        console.log(`[CHART] Requesting ${request.style} for ${underlying_symbol} (req_id: 1)`);
        ws.send(JSON.stringify(request));

        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000); // 30s as per docs
      };

      ws.onmessage = (msg) => {
        let data;
        try {
          data = JSON.parse(msg.data);
        } catch (e) {
          console.error('[CHART] Parse Error:', e);
          return;
        }
        
        if (data.error) {
          console.error('[CHART] API Error:', data.error);
          setChartError(`${data.error.message || 'Unknown Error'} (${data.error.code || 'Check console'})`);
          setIsLoading(false);
          return;
        }

        if (data.msg_type === 'history' || data.msg_type === 'candles') {
          console.log(`[CHART] Data received: ${data.msg_type}`);
          setIsLoading(false);
        }

        if (!chartRef.current) return;

        if (data.candles) {
          if (!data.candles || data.candles.length === 0) {
            setChartError('No historical data found.');
            setIsLoading(false);
            return;
          }
          const kLineData = data.candles.map((c: any) => ({
            timestamp: c.epoch * 1000,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseFloat(c.volume || c.count || '0')
          }));
          chartRef.current.applyNewData(kLineData);
          setLastPrice(kLineData[kLineData.length - 1].close);
          setLatestCandle(kLineData[kLineData.length - 1]);
          setIsLoading(false);
          setTimeout(() => chartRef.current?.resize(), 50);
        } else if (data.history) {
          if (!data.history.times || data.history.times.length === 0) {
            setChartError('No history found.');
            setIsLoading(false);
            return;
          }
          const kLineData = data.history.times.map((t: number, i: number) => ({
            timestamp: t * 1000,
            open: parseFloat(data.history.prices[i]),
            high: parseFloat(data.history.prices[i]),
            low: parseFloat(data.history.prices[i]),
            close: parseFloat(data.history.prices[i]),
            volume: 1
          }));
          chartRef.current.applyNewData(kLineData);
          setLastPrice(kLineData[kLineData.length - 1].close);
          setLatestCandle(kLineData[kLineData.length - 1]);
          setIsLoading(false);
          setTimeout(() => chartRef.current?.resize(), 50);
        } else if (data.ohlc) {
          const timestamp = (data.ohlc.open_time || data.ohlc.epoch) * 1000;
          const update = {
            timestamp,
            open: parseFloat(data.ohlc.open),
            high: parseFloat(data.ohlc.high),
            low: parseFloat(data.ohlc.low),
            close: parseFloat(data.ohlc.close),
            volume: 1
          };
          chartRef.current.updateData(update);
          setLastPrice(update.close);
          setLatestCandle(update);
          setIsLoading(false);
        } else if (data.tick) {
          const timestamp = data.tick.epoch * 1000;
          const price = parseFloat(data.tick.quote);
          const update = {
            timestamp,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 1
          };
          chartRef.current.updateData(update);
          setLastPrice(price);
          setLatestCandle(update);
          setIsLoading(false);
        }
      };

      ws.onerror = (e) => {
        console.error('WebSocket Error:', e);
        setChartError('Connection Error: Failed to connect to data server');
        setIsLoading(false);
      };

      ws.onclose = (e) => {
        console.log('WebSocket Closed:', e.code, e.reason);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (!e.wasClean && !chartError) {
          setChartError('Connection lost. Please retry.');
        }
      };
    };

    connectWS();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [underlying_symbol, timeframe, retryTrigger, isChartReady]);

  // Handle Indicators
  const addIndicator = (type: string) => {
    if (!chartRef.current) return;
    
    const typeMap: Record<string, string> = {
      'MA': 'MA',
      'EMA': 'EMA',
      'BOLL': 'BOLL',
      'SAR': 'SAR',
      'BBI': 'BBI',
      'VOL': 'VOL',
      'MACD': 'MACD',
      'RSI': 'RSI',
      'KDJ': 'KDJ',
      'WR': 'WR',
      'CCI': 'CCI',
      'ATR': 'ATR',
      'OBV': 'OBV',
      'TRIX': 'TRIX',
      'DMA': 'DMA',
      'DMI': 'DMI',
      'PSY': 'PSY',
      'BIAS': 'BIAS',
      'ROC': 'ROC',
      'MTM': 'MTM',
      'AO': 'AO'
    };

    const klineType = typeMap[type] || type;
    const isMain = ['MA', 'EMA', 'BOLL', 'SAR', 'BBI'].includes(klineType);
    
    const paneId = isMain ? 'candle_pane' : (klineType === 'VOL' ? 'vol_pane' : `pane_${Math.random().toString(36).substr(2, 9)}`);
    const id = chartRef.current.createIndicator(klineType, isMain, { id: paneId });

    if (id) {
        setIndicators(prev => [...prev, { id, type: klineType, name: type, visible: true, paneId: id }]);
    }
    setShowIndicatorMenu(false);
  };

  const removeIndicator = (id: string) => {
    if (!chartRef.current) return;
    const ind = indicators.find(i => i.id === id);
    if (ind) {
        chartRef.current.removeIndicator(ind.paneId, ind.type);
        setIndicators(prev => prev.filter(i => i.id !== id));
    }
  };

  const toggleIndicatorVisibility = (id: string) => {
    if (!chartRef.current) return;
    setIndicators(prev => prev.map(ind => {
      if (ind.id === id) {
        const nextVisible = !ind.visible;
        chartRef.current?.overrideIndicator({
          name: ind.type,
          visible: nextVisible
        }, ind.paneId);
        return { ...ind, visible: nextVisible };
      }
      return ind;
    }));
  };

  const clearAllIndicators = () => {
    if (!chartRef.current) return;
    indicators.forEach(ind => chartRef.current?.removeIndicator(ind.paneId, ind.type));
    setIndicators([]);
  };

  // Handle Drawing Tools
  useEffect(() => {
    if (!chartRef.current) return;

    const overlayMap: Record<string, string> = {
      'trendline': 'segment',
      'horizontal': 'horizontalLine',
      'vertical': 'verticalLine',
      'ray': 'rayLine',
      'arrow': 'arrow',
      'rectangle': 'rectangle',
      'circle': 'circle',
      'triangle': 'triangle',
      'parallelogram': 'parallelogram',
      'arc': 'arc',
      'fib': 'fibonacciLine',
      'priceLine': 'priceLine',
      'priceChannel': 'priceChannelLine',
      'parallelLine': 'parallelLine',
      'text': 'text'
    };

    if (drawingMode && drawingMode !== 'cursor' && drawingMode !== 'eraser') {
      const klineOverlay = overlayMap[drawingMode];
      if (klineOverlay) {
        const styles: any = {
          line: {
            color: drawingColor,
            size: drawingLineWidth
          },
          polygon: {
            color: drawingColor + '33'
          }
        };

        // Special handling for Fibonacci to show levels on the right
        if (klineOverlay === 'fibonacciLine') {
          styles.text = {
            position: 'right',
            color: drawingColor,
            size: 10,
            family: 'monospace',
            weight: 'bold' as any
          };
        }

        chartRef.current.createOverlay({
          name: klineOverlay,
          styles,
          onDrawEnd: (event: any) => {
            setDrawings(prev => {
              if (prev.find(d => d.id === event.overlay.id)) return prev;
              return [...prev, { id: event.overlay.id, type: event.overlay.name, visible: true }];
            });
            setDrawingMode(null);
            return true;
          },
          onRemoved: (event: any) => {
            setDrawings(prev => prev.filter(d => d.id !== event.overlay.id));
            return true;
          }
        });
      }
    }
  }, [drawingMode, drawingColor, drawingLineWidth]);

  // Track overlays
  useEffect(() => {
    // We handle tracking via onDrawEnd and onRemoved in createOverlay
  }, []);



  // Handle Barrier Display
  useEffect(() => {
    if (!chartRef.current || !isChartReady) return;

    // Remove existing barrier
    if (barrierOverlayRef.current) {
      chartRef.current.removeOverlay(barrierOverlayRef.current);
      barrierOverlayRef.current = null;
    }

    if (barrier !== undefined && barrier !== null && barrier !== '') {
      let barrierLevel: number;
      const barrierStr = barrier.toString();
      
      if (barrierStr.startsWith('+') || barrierStr.startsWith('-')) {
        barrierLevel = lastPrice + parseFloat(barrierStr);
      } else {
        barrierLevel = parseFloat(barrierStr);
      }

      if (!isNaN(barrierLevel) && barrierLevel > 0) {
        const id = chartRef.current.createOverlay({
          name: 'barrier',
          points: [{ value: barrierLevel }],
          styles: {
            line: {
              color: '#f59e0b',
              size: 2
            }
          },
          lock: true
        });
        barrierOverlayRef.current = id as string;
      }
    }
  }, [barrier, lastPrice, isChartReady]);

  // Handle Open Positions Display
  const positionOverlaysRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!chartRef.current || !isChartReady) return;

    // Remove old overlays
    Object.values(positionOverlaysRef.current).forEach(id => {
      chartRef.current?.removeOverlay(id);
    });
    positionOverlaysRef.current = {};

    openPositions.forEach(pos => {
      const entryPrice = parseFloat(pos.entry_price);
      const currentPrice = lastPrice;
      const profit = (currentPrice - entryPrice) * (pos.type === 'CALL' ? 1 : -1);
      const isProfit = profit >= 0;

      const id = chartRef.current?.createOverlay({
        name: 'tradeLine',
        points: [{ value: entryPrice, profit: profit } as any],
        lock: true
      });
      if (id) {
        positionOverlaysRef.current[pos.id] = id as string;
      }
    });
  }, [openPositions, lastPrice, isChartReady]);


  const removeDrawing = (id: string) => {
    if (!chartRef.current) return;
    chartRef.current.removeOverlay(id);
    setDrawings(prev => prev.filter(d => d.id !== id));
  };

  const toggleDrawingVisibility = (id: string) => {
    if (!chartRef.current) return;
    setDrawings(prev => prev.map(d => {
      if (d.id === id) {
        const nextVisible = !d.visible;
        chartRef.current?.overrideOverlay({
          id: d.id,
          visible: nextVisible
        });
        return { ...d, visible: nextVisible };
      }
      return d;
    }));
  };

  const clearAllDrawings = () => {
    if (!chartRef.current) return;
    chartRef.current.removeOverlay();
    setDrawings([]);
  };

  // Object Eye (Visibility Toggle)
  const toggleVisibility = () => {
    if (!chartRef.current) return;
    const nextVisible = !isObjectsVisible;
    setIsObjectsVisible(nextVisible);
    
    // Toggle all indicators and update state
    setIndicators(prev => prev.map(ind => {
      chartRef.current?.overrideIndicator({
        name: ind.type,
        visible: nextVisible
      }, ind.paneId);
      return { ...ind, visible: nextVisible };
    }));

    // Toggle all drawings and update state
    setDrawings(prev => prev.map(d => {
      chartRef.current?.overrideOverlay({
        id: d.id,
        visible: nextVisible
      });
      return { ...d, visible: nextVisible };
    }));
  };


  return (
    <div className="w-full h-full flex flex-col relative group bg-[#0b0e14]">
      <div className="flex-1 min-h-0 relative">
        <div ref={chartContainerRef} className="absolute inset-0" />
        
        {/* Unified Sidebar */}
        <div className="fixed top-40 left-2 z-40 flex flex-col gap-1.5 pointer-events-none">
          <div className="pointer-events-auto">
            <ChartControls 
              timeframe={timeframe}
              onTimeframeChange={onTimeframeChange}
              showTimeframeMenu={showTimeframeMenu}
              setShowTimeframeMenu={setShowTimeframeMenu}
              showDrawingMenu={showDrawingMenu}
              setShowDrawingMenu={setShowDrawingMenu}
              showIndicatorMenu={showIndicatorMenu}
              setShowIndicatorMenu={setShowIndicatorMenu}
              drawingMode={drawingMode}
              setDrawingMode={setDrawingMode}
              setActiveDrawing={() => {}}
              clearAllDrawings={clearAllDrawings}
              addIndicator={addIndicator}
              indicators={indicators}
              clearAllIndicators={clearAllIndicators}
              setShowObjectTree={setShowObjectTree}
              showObjectTree={showObjectTree}
              isObjectsVisible={isObjectsVisible}
              toggleVisibility={toggleVisibility}
              drawings={drawings}
              removeIndicator={removeIndicator}
              removeDrawing={removeDrawing}
              toggleIndicatorVisibility={toggleIndicatorVisibility}
              toggleDrawingVisibility={toggleDrawingVisibility}
              drawingColor={drawingColor}
              setDrawingColor={setDrawingColor}
              drawingLineWidth={drawingLineWidth}
              setDrawingLineWidth={setDrawingLineWidth}
            />
          </div>
        </div>

        {/* Visibility Toggle (Object Eye) */}
        <div className="absolute top-3 left-14 z-40 pointer-events-auto">
            <button 
                onClick={toggleVisibility}
                className={`p-2 rounded-lg border transition-all ${
                    isObjectsVisible ? 'bg-white/5 border-white/5 text-gray-400' : 'bg-red-600 border-red-600 text-white'
                }`}
                title="Toggle Visibility"
            >
                {isObjectsVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
        </div>

        {/* Price Badge */}
        <div className="absolute top-3 right-3 z-40 pointer-events-none">
          <div className="bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/5 flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-mono font-black text-white tabular-nums">
              {lastPrice.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Loading / Error States */}
        {isLoading && !chartError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e14]/80 backdrop-blur-md z-[60]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Loading Chart...</span>
            </div>
          </div>
        )}

        {chartError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e14]/80 backdrop-blur-md z-[60]">
            <div className="flex flex-col items-center gap-4 max-w-xs text-center">
              <AlertCircle className="w-12 h-12 text-red-500" />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Chart Error</h3>
                <p className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed">{chartError}</p>
              </div>
              <button 
                onClick={() => setRetryTrigger(prev => prev + 1)}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
              >
                Retry Connection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chart Footer with Refresh Icon */}
      <div className="h-6 bg-[#141922] border-t border-white/5 flex items-center justify-center px-3 flex-shrink-0">
        <button 
          onClick={() => setRetryTrigger(prev => prev + 1)}
          className="p-1 hover:bg-white/5 rounded-md transition-all group"
          title="Refresh Chart"
        >
          <RefreshCw className={`w-3 h-3 text-gray-500 group-hover:text-red-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};

export default TradingChart;

