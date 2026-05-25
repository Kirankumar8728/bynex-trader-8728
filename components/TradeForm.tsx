import React, { useState, useEffect, useRef } from 'react';
import { TradeType, Timeframe, Proposal } from '../types';
import { TrendingUp, TrendingDown, Target, ShieldAlert, ChevronDown, Settings, Loader2 } from 'lucide-react';
import { getCurrencyConfig } from '../constants';

interface TradeFormProps {
  underlying_symbol: string;
  onTrade: (params: any) => void;
  proposals: Record<string, Proposal>;
  subscribeProposal: (params: any) => void;
  clearProposals: () => void;
  clearError: () => void;
  isTrading: boolean;
  balance: number;
  error: string | null;
  isAuthenticated: boolean;
  onLogin: () => void;
  onShowLoginModal: () => void;
  barrier: string;
  onBarrierChange: (barrier: string) => void;
  lastPrice: number;
  tradeType: TradeType;
  onTradeTypeChange: (type: TradeType) => void;
  proposalTrigger?: number;
  currency?: string;
  isConnected?: boolean;
}

const TradeForm: React.FC<TradeFormProps> = ({ 
  underlying_symbol, 
  onTrade, 
  proposals, 
  subscribeProposal, 
  clearProposals,
  clearError,
  isTrading,
  balance,
  error,
  isAuthenticated,
  onLogin,
  onShowLoginModal,
  barrier,
  onBarrierChange,
  lastPrice,
  tradeType,
  onTradeTypeChange,
  proposalTrigger = 0,
  currency = 'USD',
  isConnected = false
}) => {
  const [stake, setStake] = useState(10);
  const [duration, setDuration] = useState(2);
  const [durationUnit, setDurationUnit] = useState<'t' | 's' | 'm' | 'h' | 'd'>('m');
  const config = getCurrencyConfig(currency);

  // Auto-close error message after 6 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // Subscribe to live proposals with "forget-then-subscribe" logic
  // Deriv automatically deducts the dashboard markup from the payout for this App ID
  useEffect(() => {
    // Reset last ID ref when inputs change to allow fresh trades
    lastIdRef.current = null;

    // Subscribe even when not authenticated to show public payout preview
    if (!isConnected) return;
    
    const getTypes = () => {
      if (tradeType === 'CALL') return ['CALL', 'PUT'];
      if (tradeType === 'HIGHER') return ['HIGHER', 'LOWER'];
      if (tradeType === 'TOUCH') return ['ONETOUCH', 'NOTOUCH'];
      return [tradeType];
    };

    const fetchProposals = () => {
      const types = getTypes();
      types.forEach(type => {
        const params: any = {
          symbol: underlying_symbol,
          contract_type: type,
          amount: stake,
          duration,
          duration_unit: durationUnit,
        };

        if (['HIGHER', 'LOWER', 'TOUCH', 'NOTOUCH', 'ONETOUCH'].includes(type) && barrier) {
          params.barrier = barrier;
        }

        subscribeProposal(params);
      });
    };

    // If it's a trigger from a trade, do it faster
    const isManualTrigger = proposalTrigger > 0;
    const delay = isManualTrigger ? 50 : 200;

    const timer = setTimeout(fetchProposals, delay);
    return () => clearTimeout(timer);
  }, [underlying_symbol, tradeType, stake, duration, durationUnit, barrier, proposalTrigger, isConnected, isAuthenticated]);

  const [buyingTypes, setBuyingTypes] = useState<Set<string>>(new Set());
  const lastIdRef = useRef<string | null>(null);

  const handleTrade = (type: string) => {
    if (!isAuthenticated) {
      onShowLoginModal();
      return;
    }
    clearError();
    const proposal = proposals[type];
    
    // Prevent multiple clicks on the same proposal ID or while still sending previous one
    if (!proposal?.id || proposal.id === lastIdRef.current || buyingTypes.has(type)) {
      return;
    }

    lastIdRef.current = proposal.id;
    setBuyingTypes(prev => {
      const next = new Set(prev);
      next.add(type);
      return next;
    });
    
    onTrade({
      buy: proposal.id,
      price: parseFloat(proposal.ask_price.toString()),
      passthrough: { manual: true, type }
    });
  };

  // Clear buying state when isTrading becomes false
  useEffect(() => {
    if (!isTrading) {
      setBuyingTypes(new Set());
    }
  }, [isTrading]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(val);
  };

  // Note: The payout displayed here is fetched directly from Deriv. 
  // Any markup (commission) configured in the Deriv Developer Dashboard for this App ID 
  // is automatically applied by the Deriv API to the payout and ask_price returned.
  
  const getProfitSummary = (proposal: Proposal | undefined) => {
    if (!proposal || !proposal.payout || !proposal.ask_price) return null;
    try {
      const payout = parseFloat(proposal.payout.toString());
      const askPrice = parseFloat(proposal.ask_price.toString());
      if (askPrice === 0) return null;
      
      const netProfit = payout - askPrice;
      const percentage = ((netProfit / askPrice) * 100).toFixed(0);
      
      return {
        amount: formatCurrency(netProfit),
        percentage: `${percentage}%`
      };
    } catch (e) {
      return null;
    }
  };

  const calculatePayout = (proposal: Proposal | undefined) => {
    if (!proposal || !proposal.payout || !proposal.ask_price) return '--';
    try {
      const payout = parseFloat(proposal.payout.toString());
      const askPrice = parseFloat(proposal.ask_price.toString());
      if (askPrice === 0) return '--';
      
      const netProfit = payout - askPrice;
      const percentage = ((netProfit / askPrice) * 100).toFixed(2);
      
      return `${formatCurrency(netProfit)} (+${percentage}%)`;
    } catch (e) {
      return '--';
    }
  };

  const getReturnPercentage = (proposal: Proposal | undefined) => {
    if (!proposal || !proposal.payout || !proposal.ask_price) return null;
    try {
      const payout = parseFloat(proposal.payout.toString());
      const askPrice = parseFloat(proposal.ask_price.toString());
      if (askPrice === 0) return null;

      const netProfit = payout - askPrice;
      return ((netProfit / askPrice) * 100).toFixed(0);
    } catch (e) {
      return null;
    }
  };

  const getButtonData = (side: 'up' | 'down') => {
    if (tradeType === 'CALL') {
      const type = side === 'up' ? 'CALL' : 'PUT';
      return {
        type,
        label: side === 'up' ? 'Rise' : 'Fall',
        proposal: proposals[type]
      };
    }
    if (tradeType === 'HIGHER') {
      const type = side === 'up' ? 'HIGHER' : 'LOWER';
      return {
        type,
        label: side === 'up' ? 'Higher' : 'Lower',
        proposal: proposals[type]
      };
    }
    if (tradeType === 'TOUCH') {
      const type = side === 'up' ? 'ONETOUCH' : 'NOTOUCH';
      return {
        type,
        label: side === 'up' ? 'Touch' : 'No Touch',
        proposal: proposals[type]
      };
    }
    return { type: tradeType, label: tradeType, proposal: proposals[tradeType] };
  };

  const upData = getButtonData('up');
  const downData = getButtonData('down');

  return (
    <div className="bg-[#141922] border-t border-white/5 p-[28px] space-y-4 z-30">
      {/* Trading Error Display (Moved Above Form) */}
      {error && (
        <div 
          id="table-error-msg" 
          className="bg-[#cc2e3d]/15 text-[#cc2e3d] border border-[#cc2e3d] p-2.5 rounded-lg text-[12px] text-center font-bold animate-in fade-in slide-in-from-top-1 duration-300"
        >
          {error}
        </div>
      )}

      {/* Trade Type Selector */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {[
          { id: 'CALL', label: 'Rise/Fall', icon: <TrendingUp className="w-3 h-3" /> },
          { id: 'HIGHER', label: 'Higher/Lower', icon: <TrendingUp className="w-3 h-3" /> },
          { id: 'TOUCH', label: 'Touch/No Touch', icon: <Target className="w-3 h-3" /> },
        ].map(type => (
          <button
            key={type.id}
            onClick={() => onTradeTypeChange(type.id as TradeType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap border transition-all ${
              tradeType === type.id
                ? 'bg-red-600 border-red-600 text-white' 
                : 'bg-white/5 border-white/5 text-gray-500'
            }`}
          >
            {type.icon}
            {type.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {/* Stake Input */}
        <div className="bg-white/5 rounded-xl border border-white/5 p-1.5">
          <span className="block text-[7px] font-black text-gray-500 uppercase mb-0.5 tracking-wider">Stake ({currency})</span>
          <input 
            type="number" 
            min={config.min}
            step={config.step}
            value={stake} 
            onChange={(e) => setStake(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-full bg-transparent text-xs font-mono font-black text-white outline-none" 
          />
        </div>

        {/* Duration Input */}
        <div className="bg-white/5 rounded-xl border border-white/5 p-1.5 flex justify-between items-center">
          <div className="flex-1">
            <span className="block text-[7px] font-black text-gray-500 uppercase mb-0.5 tracking-wider">Duration</span>
            <input 
              type="number" 
              min="1"
              value={duration} 
              onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-transparent text-xs font-mono font-black text-white outline-none" 
            />
          </div>
          <select 
            value={durationUnit}
            onChange={(e) => setDurationUnit(e.target.value as any)}
            className="bg-transparent text-[8px] font-black text-red-500 uppercase outline-none cursor-pointer ml-1"
          >
            <option value="t">Ticks</option>
            <option value="s">Sec</option>
            <option value="m">Min</option>
            <option value="h">Hours</option>
            <option value="d">Days</option>
          </select>
        </div>

        {/* Barrier Input (Conditional) */}
        {['HIGHER', 'LOWER', 'TOUCH', 'NOTOUCH', 'ONETOUCH'].includes(tradeType) && (
          <div className="col-span-2 bg-white/5 rounded-xl border border-white/5 p-1.5">
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[7px] font-bold text-gray-500 uppercase">
                Barrier {barrier.match(/^[+-]/) ? 'Offset' : 'Level'}
              </span>
              <span className="text-[7px] font-mono font-bold text-gray-400">
                Spot: {lastPrice.toFixed(4)}
              </span>
            </div>
            <div className="relative flex items-center">
              <input 
                type="text" 
                value={barrier} 
                onChange={(e) => onBarrierChange(e.target.value)}
                className="w-full bg-transparent text-xs font-mono font-black text-white outline-none placeholder-gray-700" 
                placeholder="+0.00 or 1234.56"
              />
              {/* Calculated Level Display */}
              {barrier.match(/^[+-]/) && lastPrice > 0 && !isNaN(parseFloat(barrier)) && (
                <div className="text-[8px] font-mono font-bold text-gray-500 ml-2 whitespace-nowrap">
                  = {(lastPrice + parseFloat(barrier)).toFixed(4)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Trade Buttons */}
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-1">
          {/* Payout Information Above Button */}
          <div className="flex justify-between items-center px-1">
            <span className="text-[9px] font-bold text-green-500/80">Payout</span>
            {!isAuthenticated ? (
              upData.proposal?.payout ? (
                <span className="text-[10px] font-mono font-black text-green-400">
                  {formatCurrency(parseFloat(upData.proposal.payout.toString()))}
                </span>
              ) : (
                <span className="text-[10px] font-mono font-black text-gray-600">--</span>
              )
            ) : getProfitSummary(upData.proposal) ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono font-black text-green-400">{getProfitSummary(upData.proposal)?.amount}</span>
              </div>
            ) : (
              <span className="text-[10px] font-mono font-black text-gray-600">--</span>
            )}
          </div>
          
          <button 
            disabled={!upData.proposal || buyingTypes.has(upData.type)}
            onClick={() => handleTrade(upData.type)} 
            className="h-14 bg-[#059669]/90 hover:bg-[#059669] active:scale-[0.98] transition-all rounded-xl flex items-center justify-center px-3 shadow-lg shadow-green-900/20 disabled:opacity-50 border border-white/5 relative overflow-hidden group"
          >
            <div className="flex items-center gap-2">
              {buyingTypes.has(upData.type) ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <TrendingUp className="w-5 h-5 text-white stroke-[3px]" />
              )}
              <span className="text-[13px] font-black text-white tracking-widest uppercase truncate">
                {upData.label}
              </span>
            </div>
          </button>
        </div>

        <div className="flex-1 flex flex-col gap-1">
          {/* Payout Information Above Button */}
          <div className="flex justify-between items-center px-1">
            <span className="text-[9px] font-bold text-red-500/80">Payout</span>
            {!isAuthenticated ? (
              downData.proposal?.payout ? (
                <span className="text-[10px] font-mono font-black text-red-400">
                  {formatCurrency(parseFloat(downData.proposal.payout.toString()))}
                </span>
              ) : (
                <span className="text-[10px] font-mono font-black text-gray-600">--</span>
              )
            ) : getProfitSummary(downData.proposal) ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono font-black text-red-400">{getProfitSummary(downData.proposal)?.amount}</span>
              </div>
            ) : (
              <span className="text-[10px] font-mono font-black text-gray-600">--</span>
            )}
          </div>

          <button 
            disabled={!downData.proposal || buyingTypes.has(downData.type)}
            onClick={() => handleTrade(downData.type)} 
            className="h-14 bg-[#e11d48]/90 hover:bg-[#e11d48] active:scale-[0.98] transition-all rounded-xl flex items-center justify-center px-3 shadow-lg shadow-red-900/20 disabled:opacity-50 border border-white/5 relative overflow-hidden group"
          >
            <div className="flex items-center gap-2">
              {buyingTypes.has(downData.type) ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <TrendingDown className="w-5 h-5 text-white stroke-[3px]" />
              )}
              <span className="text-[13px] font-black text-white tracking-widest uppercase truncate">
                {downData.label}
              </span>
            </div>
          </button>
        </div>
      </div>

    </div>
  );
};

export default React.memo(TradeForm);
