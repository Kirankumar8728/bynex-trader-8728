
import React, { useEffect, useState, useRef } from 'react';
import { DerivTick } from '../types';
import { DERIV_WS_URL } from '../constants';

import { NEW_APP_ID } from '../src/services/derivApiService';

const MarketTicker: React.FC = () => {
  const [ticks, setTicks] = useState<DerivTick[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(DERIV_WS_URL);
    let pingInterval: any;

    ws.current.onopen = () => {
      pingInterval = setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ ping: 1 }));
        }
      }, 30000);

      const symbols = ['1HZ100V', '1HZ50V', 'frxEURUSD', 'frxGBPUSD'];
      symbols.forEach(symbol => {
        ws.current?.send(JSON.stringify({
          ticks: symbol,
          subscribe: 1
        }));
      });
    };

    ws.current.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (data.error) {
        console.error('[TICKER] API Error:', data.error);
        return;
      }

      if (data.msg_type === 'tick') {
        const newTick: DerivTick = {
          underlying_symbol: data.tick.underlying_symbol || data.tick.symbol,
          quote: data.tick.quote,
          epoch: data.tick.epoch
        };
        
        setTicks(prev => {
          const index = prev.findIndex(t => t.underlying_symbol === newTick.underlying_symbol);
          if (index !== -1) {
            const oldTick = prev[index];
            newTick.change = newTick.quote - oldTick.quote;
            const updated = [...prev];
            updated[index] = newTick;
            return updated;
          }
          return [...prev, newTick];
        });
      }
    };

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      ws.current?.close();
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3">
      {ticks.map((tick) => (
        <div key={tick.underlying_symbol} className="bg-[#161b27] p-3 rounded-2xl border border-gray-800 flex flex-col">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter truncate max-w-[60px]">
              {tick.underlying_symbol.replace('R_', '').replace('frx', '')}
            </span>
            <span className={`text-[8px] font-bold ${
              (tick.change ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {(tick.change ?? 0) >= 0 ? '+' : ''}{(tick.change ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="text-sm font-mono font-black text-white">
            {tick.quote.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MarketTicker;
