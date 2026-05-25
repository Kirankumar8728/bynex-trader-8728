import React, { useState, useMemo, useEffect } from 'react';
import { Market } from '../types';
import { Search, X, ChevronRight, Star, TrendingUp, Globe, Zap, Activity, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

interface MarketSelectorProps {
  markets: Market[];
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  onClose: () => void;
}

const MarketSelector: React.FC<MarketSelectorProps> = ({ markets, selectedSymbol, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Extract unique categories and sort them
  const categories = useMemo(() => {
    const cats = (markets || []).reduce((acc, m) => {
      if (!m.market) return acc;
      if (!acc.find(c => c.id === m.market)) {
        let name = m.market_display_name || m.market.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (m.market === 'synthetic_index') name = 'Synthetic Indices';
        acc.push({ id: m.market, name });
      }
      return acc;
    }, [] as { id: string, name: string }[]);
    
    // Sort categories: Synthetic first, then Forex, then Indices, then Commodities
    const order = ['synthetic_index', 'forex', 'indices', 'commodities'];
    cats.sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    return [{ id: 'all', name: 'All Markets' }, ...cats];
  }, [markets]);

  // Filter markets based on search and category
  const filteredMarkets = useMemo(() => {
    const filtered = (markets || []).filter(m => {
      const name = m.underlying_symbol_name || '';
      const symbol = m.underlying_symbol || '';
      const matchesSearch = 
        name.toLowerCase().includes(search.toLowerCase()) ||
        symbol.toLowerCase().includes(search.toLowerCase());
      
      const matchesCategory = activeCategory === 'all' || m.market === activeCategory;
      
      return matchesSearch && matchesCategory;
    });

    // Sort symbols: Volatility Indices first, then by category order, then alphabetically
    const order = ['synthetic_index', 'forex', 'indices', 'commodities'];
    return filtered.sort((a, b) => {
      const idxA = order.indexOf(a.market || '');
      const idxB = order.indexOf(b.market || '');
      
      if (idxA !== -1 && idxB !== -1 && idxA !== idxB) return idxA - idxB;
      if (idxA !== -1 && idxB === -1) return -1;
      if (idxB !== -1 && idxA === -1) return 1;
      
      return (a.underlying_symbol_name || '').localeCompare(b.underlying_symbol_name || '');
    });
  }, [markets, search, activeCategory]);

  const getCategoryIcon = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'synthetic_index': return <Zap className="w-4 h-4" />;
      case 'forex': return <Globe className="w-4 h-4" />;
      case 'indices': return <TrendingUp className="w-4 h-4" />;
      case 'commodities': return <Activity className="w-4 h-4" />;
      default: return <Star className="w-4 h-4" />;
    }
  };

  // Grouped markets for the list view
  const groupedMarkets = useMemo(() => {
    const groups = filteredMarkets.reduce((acc, m) => {
      const submarketKey = m.submarket || 'other';
      if (!acc[submarketKey]) acc[submarketKey] = [];
      acc[submarketKey].push(m);
      return acc;
    }, {} as Record<string, typeof filteredMarkets>);

    // Sort the groups based on common submarkets first
    const order = ['random_index', 'crash_index', 'step_index', 'jump_index', 'major_pairs', 'minor_pairs'];
    return Object.entries(groups).sort(([a], [b]) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [filteredMarkets]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-4 sm:inset-10 md:inset-20 md:mx-auto md:max-w-xl bg-[#0b0e14] z-[200] flex flex-col overflow-hidden rounded-3xl border border-white/10 shadow-2xl"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0b0e14]/80 backdrop-blur-md sticky top-0 z-10">
        <h2 className="text-lg font-black tracking-tight">Select Market</h2>
        <button 
          onClick={onClose} 
          className="p-2 hover:bg-white/5 rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="w-6 h-6 text-gray-400" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3 bg-[#0b0e14]">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-red-500 transition-colors" />
          <input 
            autoFocus
            type="text" 
            placeholder="Search by name or symbol..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-11 pr-12 text-sm font-bold outline-none focus:border-red-500/50 focus:bg-white/[0.07] transition-all placeholder:text-gray-600"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="px-4 pb-2 overflow-x-auto no-scrollbar flex gap-2 bg-[#0b0e14]">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${
              activeCategory === cat.id 
                ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/20' 
                : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
            }`}
          >
            {getCategoryIcon(cat.id)}
            {cat.name}
          </button>
        ))}
      </div>

      {/* Market List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-8 pb-32">
        {groupedMarkets.length > 0 ? (
          groupedMarkets.map(([category, marketsInCategory]) => (
              <div
                key={category}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 px-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-white/5 text-gray-500">
                    {getCategoryIcon(marketsInCategory[0]?.market || 'other')}
                  </div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {marketsInCategory[0]?.submarket_display_name || category.replace(/_/g, ' ')}
                  </h3>
                  <div className="flex-1 h-px bg-white/5 ml-2" />
                </div>
                {marketsInCategory.map((m, idx) => (
                  <motion.button
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={m.underlying_symbol || `market-${idx}`}
                    onClick={() => { onSelect(m.underlying_symbol); onClose(); }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border group ${
                      selectedSymbol === m.underlying_symbol 
                        ? 'bg-red-600/10 border-red-500/30 text-white' 
                        : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.07] hover:border-white/10 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                        selectedSymbol === m.underlying_symbol ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-400'
                      }`}>
                        {(m.underlying_symbol || '').substring(0, 2).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black tracking-tight">
                            {m.underlying_symbol_name || 
                             m.underlying_symbol?.replace('R_', 'Volatility Index ').replace('_', ' (1s)') || 
                             'Unknown Asset'}
                          </p>
                          {m.market === 'synthetic_index' && (
                            <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-500 text-[8px] font-black uppercase tracking-tighter flex items-center gap-1">
                              <Clock className="w-2 h-2" />
                              24/7
                            </span>
                          )}
                          {selectedSymbol === m.underlying_symbol && (
                            <span className="px-1.5 py-0.5 rounded bg-red-600 text-[8px] font-black uppercase tracking-tighter">Active</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={`text-[10px] font-bold uppercase tracking-wider ${
                            selectedSymbol === m.underlying_symbol ? 'text-red-400' : 'text-gray-500'
                          }`}>{m.underlying_symbol || 'N/A'}</p>
                          <span className="w-1 h-1 rounded-full bg-gray-700" />
                          <p className="text-[10px] font-medium text-gray-600">
                            {m.submarket_display_name || (m.submarket ? m.submarket.replace(/_/g, ' ') : '')}
                          </p>
                          <span className="w-1 h-1 rounded-full bg-gray-700" />
                          <p className="text-[10px] font-medium text-gray-700 italic">
                            {m.market_display_name || (m.market ? m.market.replace(/_/g, ' ') : '')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${
                          selectedSymbol === m.underlying_symbol ? 'text-red-500' : 'text-gray-700'
                        }`} />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
          ))
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-700" />
            </div>
            <h3 className="text-lg font-black text-gray-400">No markets found</h3>
            <p className="text-sm text-gray-600 mt-1 max-w-[200px]">Try searching for a different symbol or category</p>
            <button 
              onClick={() => { setSearch(''); setActiveCategory('all'); }}
              className="mt-6 px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black text-gray-400 transition-colors"
            >
              Clear Filters
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default React.memo(MarketSelector);
