import React from 'react';
import { 
  LineChart, Clock, Pencil, MousePointer2, TrendingUp, Minus, Square, Menu, Eraser, Trash2, X, Settings, Eye, EyeOff, Plus, 
  ArrowRight, ArrowUpRight, SeparatorVertical, Circle, Triangle, Box, Undo, Type, DollarSign, Columns, Rows 
} from 'lucide-react';
import { Timeframe } from '../types';

interface ChartControlsProps {
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  showTimeframeMenu: boolean;
  setShowTimeframeMenu: (show: boolean) => void;
  showDrawingMenu: boolean;
  setShowDrawingMenu: (show: boolean) => void;
  showIndicatorMenu: boolean;
  setShowIndicatorMenu: (show: boolean) => void;
  drawingMode: string | null;
  setDrawingMode: (mode: string | null) => void;
  setActiveDrawing: (drawing: any) => void;
  clearAllDrawings: () => void;
  addIndicator: (type: string) => void;
  indicators: any[];
  clearAllIndicators: () => void;
  setShowObjectTree: (show: boolean) => void;
  showObjectTree: boolean;
  isObjectsVisible: boolean;
  toggleVisibility: () => void;
  drawings: any[];
  removeIndicator: (id: string) => void;
  removeDrawing: (id: string) => void;
  toggleIndicatorVisibility: (id: string) => void;
  toggleDrawingVisibility: (id: string) => void;
  onEditIndicator?: (indicator: any) => void;
  onEditDrawing?: (drawing: any) => void;
  drawingColor: string;
  setDrawingColor: (color: string) => void;
  drawingLineWidth: number;
  setDrawingLineWidth: (width: number) => void;
}

const TIMEFRAMES: Timeframe[] = ['1t', '1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '8h', '24h'];

const ChartControls: React.FC<ChartControlsProps> = ({
  timeframe, onTimeframeChange,
  showTimeframeMenu, setShowTimeframeMenu,
  showDrawingMenu, setShowDrawingMenu,
  showIndicatorMenu, setShowIndicatorMenu,
  drawingMode, setDrawingMode, setActiveDrawing, clearAllDrawings,
  addIndicator, indicators, clearAllIndicators,
  setShowObjectTree, showObjectTree, isObjectsVisible, toggleVisibility, drawings, removeIndicator, removeDrawing,
  toggleIndicatorVisibility, toggleDrawingVisibility,
  onEditIndicator, onEditDrawing,
  drawingColor, setDrawingColor, drawingLineWidth, setDrawingLineWidth
}) => {
  return (
    <div className="flex flex-col gap-2 pb-10 pointer-events-none">
      {/* Top Row: Timeframe and Objects */}
      <div className="flex flex-row gap-2">
        {/* Timeframe Control */}
        <div className="relative pointer-events-auto">
          <button 
            onClick={() => {
              setShowTimeframeMenu(!showTimeframeMenu);
              setShowDrawingMenu(false);
              setShowIndicatorMenu(false);
              setShowObjectTree(false);
            }}
            className={`w-10 h-10 bg-black/40 backdrop-blur-md rounded-xl border border-white/5 flex flex-col items-center justify-center transition-colors relative ${
              showTimeframeMenu ? 'bg-red-600 border-red-600 text-white' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Timeframe"
          >
            {showTimeframeMenu ? <X className="w-5 h-5" /> : (
              <>
                <Clock className="w-4 h-4 mb-0.5" />
                <span className={`text-[8px] font-black uppercase leading-none ${showTimeframeMenu ? 'text-white' : 'text-white'}`}>{timeframe}</span>
              </>
            )}
          </button>
          {showTimeframeMenu && (
            <div className="fixed top-[340px] inset-x-0 bottom-0 bg-[#0b0e14]/95 backdrop-blur-xl z-[200000] flex flex-col animate-in slide-in-from-bottom duration-300 border-t border-white/5">
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Timeframe</h2>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Select chart interval</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowTimeframeMenu(false)}
                  className="w-10 h-10 bg-red-600 hover:bg-red-700 rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-red-600/20"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 pb-32">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => {
                        onTimeframeChange(tf);
                        setShowTimeframeMenu(false);
                      }}
                      className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 ${
                        timeframe === tf 
                          ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20' 
                          : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-black uppercase tracking-widest">{tf}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Objects Control (Eye) */}
        <div className="relative pointer-events-auto">
          <button 
            onClick={() => {
              setShowObjectTree(!showObjectTree);
              setShowTimeframeMenu(false);
              setShowDrawingMenu(false);
              setShowIndicatorMenu(false);
            }}
            className={`w-10 h-10 bg-black/40 backdrop-blur-md rounded-xl border border-white/5 flex flex-col items-center justify-center transition-all relative ${
              showObjectTree ? 'bg-red-600 border-red-600 text-white' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Objects"
          >
            {showObjectTree ? <X className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            {!showObjectTree && (indicators.length > 0 || drawings.length > 0) && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border border-[#0b0e14]">
                {indicators.length + drawings.length}
              </span>
            )}
          </button>
          {showObjectTree && (
            <div className="fixed top-[340px] inset-x-0 bottom-0 bg-[#0b0e14]/95 backdrop-blur-xl z-[200001] flex flex-col animate-in slide-in-from-bottom duration-300 border-t border-white/5">
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Active Objects</h2>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Manage indicators and drawings</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowObjectTree(false)}
                  className="w-10 h-10 bg-red-600 hover:bg-red-700 rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-red-600/20"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-6">
                {(indicators.length > 0 || drawings.length > 0) && (
                  <div className="flex items-center justify-between px-2 mb-4">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Global Visibility</span>
                    <button 
                      onClick={toggleVisibility}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        isObjectsVisible ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {isObjectsVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {isObjectsVisible ? 'Hide All' : 'Show All'}
                    </button>
                  </div>
                )}

                {indicators.length === 0 && drawings.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 opacity-20">
                    <Eye className="w-16 h-16 text-white mb-4" />
                    <p className="text-xs font-black text-white uppercase tracking-widest">No active objects</p>
                  </div>
                )}

                {indicators.length > 0 && (
                  <div className="space-y-3">
                    <div className="px-2">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Indicators ({indicators.length})</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {indicators.map(ind => (
                        <div key={ind.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <LineChart className="w-4 h-4 text-gray-400" />
                            <span className="text-xs font-black text-white uppercase">{ind.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => toggleIndicatorVisibility(ind.id)} 
                              className={`p-2 rounded-lg transition-all ${ind.visible ? 'bg-white/5 text-gray-400' : 'bg-red-600 text-white'}`}
                            >
                              {ind.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button onClick={() => onEditIndicator?.(ind)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400">
                              <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={() => removeIndicator(ind.id)} className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {drawings.length > 0 && (
                  <div className="space-y-3">
                    <div className="px-2">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Drawings ({drawings.length})</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {drawings.map(d => (
                        <div key={d.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <Pencil className="w-4 h-4 text-gray-400" />
                            <span className="text-xs font-black text-white uppercase">{d.type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => toggleDrawingVisibility(d.id)} 
                              className={`p-2 rounded-lg transition-all ${d.visible ? 'bg-white/5 text-gray-400' : 'bg-red-600 text-white'}`}
                            >
                              {d.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button onClick={() => onEditDrawing?.(d)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400">
                              <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={() => removeDrawing(d.id)} className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {(indicators.length > 0 || drawings.length > 0) && (
                <div className="p-4 border-t border-white/5 bg-black/20">
                  <button 
                    onClick={() => {
                      clearAllIndicators();
                      clearAllDrawings();
                      setShowObjectTree(false);
                    }}
                    className="w-full h-12 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear All Objects
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Drawing Tools Control */}
      <div className="relative pointer-events-auto">
        <button 
          onClick={() => {
            setShowDrawingMenu(!showDrawingMenu);
            setShowTimeframeMenu(false);
            setShowIndicatorMenu(false);
            setShowObjectTree(false);
          }}
          className={`w-10 h-10 bg-black/40 backdrop-blur-md rounded-xl border border-white/5 flex items-center justify-center transition-all ${
            showDrawingMenu ? 'bg-red-600 border-red-600 text-white' : 'hover:bg-white/10 text-gray-400'
          }`}
          title="Drawing Tools"
        >
          {showDrawingMenu ? <X className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
        </button>
        {showDrawingMenu && (
          <div className="fixed top-[340px] inset-x-0 bottom-0 bg-[#0b0e14]/95 backdrop-blur-xl z-[200000] flex flex-col animate-in slide-in-from-bottom duration-300 border-t border-white/5">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
                  <Pencil className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Drawing Tools</h2>
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Analyze market patterns</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDrawingMenu(false)}
                className="w-10 h-10 bg-red-600 hover:bg-red-700 rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-red-600/20"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-6">
              {/* Available Tools Section */}
              <div className="space-y-4">
                <div className="px-2">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Available Tools</span>
                </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {[
                      { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
                      { id: 'trendline', icon: TrendingUp, label: 'Trend Line' },
                      { id: 'horizontal', icon: Minus, label: 'Horizontal' },
                      { id: 'vertical', icon: SeparatorVertical, label: 'Vertical' },
                      { id: 'ray', icon: ArrowUpRight, label: 'Ray' },
                      { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
                      { id: 'priceLine', icon: DollarSign, label: 'Price Line' },
                      { id: 'priceChannel', icon: Columns, label: 'Price Channel' },
                      { id: 'parallelLine', icon: Rows, label: 'Parallel Line' },
                      { id: 'rectangle', icon: Square, label: 'Rectangle' },
                      { id: 'circle', icon: Circle, label: 'Circle' },
                      { id: 'triangle', icon: Triangle, label: 'Triangle' },
                      { id: 'parallelogram', icon: Box, label: 'Parallelogram' },
                      { id: 'arc', icon: Undo, label: 'Arc' },
                      { id: 'fib', icon: Menu, label: 'Fibonacci' },
                      { id: 'text', icon: Type, label: 'Text' },
                      { id: 'eraser', icon: Eraser, label: 'Eraser' },
                    ].map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => {
                        setDrawingMode(tool.id === 'cursor' ? null : tool.id);
                        setActiveDrawing(null);
                        setShowDrawingMenu(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all ${
                        (drawingMode === tool.id || (tool.id === 'cursor' && !drawingMode))
                          ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20' 
                          : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <tool.icon className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase tracking-wider">{tool.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Drawing Settings Section */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="px-2">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Settings</span>
                </div>
                <div className="flex flex-col gap-4 px-2">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-gray-400 w-16">Color</span>
                    <div className="flex gap-2">
                      {['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ffffff'].map(color => (
                        <button
                          key={color}
                          onClick={() => setDrawingColor(color)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${drawingColor === color ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-gray-400 w-16">Width</span>
                    <div className="flex gap-2 flex-1">
                      {[1, 2, 3, 4].map(width => (
                        <button
                          key={width}
                          onClick={() => setDrawingLineWidth(width)}
                          className={`flex-1 h-8 rounded-lg border transition-all flex items-center justify-center ${drawingLineWidth === width ? 'bg-white/20 border-white/50 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                        >
                          <div className="w-full max-w-[20px] bg-current rounded-full" style={{ height: width }} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Indicator Control */}
      <div className="relative pointer-events-auto">
        <button 
          onClick={() => {
            setShowIndicatorMenu(!showIndicatorMenu);
            setShowTimeframeMenu(false);
            setShowDrawingMenu(false);
            setShowObjectTree(false);
          }}
          className={`w-10 h-10 bg-black/40 backdrop-blur-md rounded-xl border border-white/5 flex items-center justify-center transition-colors ${
            showIndicatorMenu ? 'bg-red-600 border-red-600 text-white' : 'hover:bg-white/10 text-gray-400'
          }`}
          title="Indicators"
        >
          {showIndicatorMenu ? <X className="w-5 h-5" /> : <LineChart className="w-5 h-5" />}
        </button>
        {showIndicatorMenu && (
          <div className="fixed top-[340px] inset-x-0 bottom-0 bg-[#0b0e14]/95 backdrop-blur-xl z-[200000] flex flex-col animate-in slide-in-from-bottom duration-300 border-t border-white/5">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
                  <LineChart className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Indicators</h2>
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Add or modify technical indicators</p>
                </div>
              </div>
              <button 
                onClick={() => setShowIndicatorMenu(false)}
                className="w-10 h-10 bg-red-600 hover:bg-red-700 rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-red-600/20"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-6">
              {/* Active Indicators Section */}
              {indicators.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Active Indicators</span>
                    <button 
                      onClick={clearAllIndicators}
                      className="text-[10px] font-black text-gray-500 hover:text-red-500 uppercase transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove All
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {indicators.map(ind => (
                      <div key={ind.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:border-red-500/30 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                            <Settings className="w-4 h-4 text-gray-400" />
                          </div>
                          <div>
                            <span className="block text-xs font-black text-white uppercase">{ind.name}</span>
                            <span className="text-[9px] font-bold text-gray-500 uppercase">Active on chart</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              onEditIndicator?.(ind);
                              setShowIndicatorMenu(false);
                            }}
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => removeIndicator(ind.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-500 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Indicators Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Trend Category */}
                <div className="space-y-4">
                  <div className="px-2">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Trend Indicators</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['MA', 'EMA', 'BOLL', 'SAR', 'BBI', 'VOL'].map(t => (
                      <button 
                        key={t} 
                        onClick={() => {
                          addIndicator(t);
                        }} 
                        className="flex items-center justify-between p-3 bg-white/5 hover:bg-red-600 border border-white/5 hover:border-red-600 rounded-xl group transition-all text-left"
                      >
                        <span className="text-[10px] font-black text-gray-300 group-hover:text-white uppercase">{t}</span>
                        <Plus className="w-3 h-3 text-gray-600 group-hover:text-white" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Oscillators Category */}
                <div className="space-y-4">
                  <div className="px-2">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Oscillators</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['MACD', 'RSI', 'KDJ', 'WR', 'CCI', 'ATR', 'OBV', 'TRIX', 'DMA', 'DMI', 'PSY', 'BIAS', 'ROC', 'MTM', 'AO'].map(t => (
                      <button 
                        key={t} 
                        onClick={() => {
                          addIndicator(t);
                        }} 
                        className="flex items-center justify-between p-3 bg-white/5 hover:bg-red-600 border border-white/5 hover:border-red-600 rounded-xl group transition-all text-left"
                      >
                        <span className="text-[10px] font-black text-gray-300 group-hover:text-white uppercase">{t}</span>
                        <Plus className="w-3 h-3 text-gray-600 group-hover:text-white" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartControls;
