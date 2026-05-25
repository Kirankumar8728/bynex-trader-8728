import React from 'react';
import { Timeframe } from '../types';
import { LineChart, Clock, Pencil } from 'lucide-react';

interface TradingToolbarProps {
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  chartRef: React.RefObject<any>;
}

const TradingToolbar: React.FC<TradingToolbarProps> = ({ timeframe, onTimeframeChange, chartRef }) => {
  return (
    <div className="flex flex-wrap gap-4 p-2 bg-[#141922] border-t border-white/5">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => chartRef.current?.toggleTimeframeMenu()}>
        <Clock className="w-4 h-4 text-gray-500" />
        <span className="text-[10px] font-bold text-gray-500 uppercase">Timeframe: {timeframe}</span>
      </div>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => chartRef.current?.toggleIndicatorMenu()}>
        <LineChart className="w-4 h-4 text-gray-500" />
        <span className="text-[10px] font-bold text-gray-500 uppercase">Indicators</span>
      </div>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => chartRef.current?.toggleDrawingMenu()}>
        <Pencil className="w-4 h-4 text-gray-500" />
        <span className="text-[10px] font-bold text-gray-500 uppercase">Drawing</span>
      </div>
    </div>
  );
};

export default React.memo(TradingToolbar);
