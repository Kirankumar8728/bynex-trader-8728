import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { AppView, Timeframe, TradeType, WithdrawalRequest } from './types';
import { getCurrencyConfig } from './constants';
import { auth } from './firebase';
import Navigation from './components/Navigation';
import MarketSelector from './components/MarketSelector';
import TradeForm from './components/TradeForm';
import TradingToolbar from './components/TradingToolbar';
import { useDeriv } from './hooks/useDeriv';
import { OAUTH_CLIENT_ID, NEW_APP_ID, exchangeCodeForToken } from './src/services/derivApiService';

const TradingChart = lazy(() => import('./components/TradingChart'));
import { 
  ChevronDown, 
  User, 
  LogOut, 
  ExternalLink, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  RefreshCw,
  Eraser,
  CreditCard,
  Smartphone,
  Globe,
  Bitcoin,
  History as HistoryIcon,
  Wallet,
  Users,
  LifeBuoy,
  Lock,
  Sun,
  Moon,
  X,
  BookOpen,
  ShieldAlert,
  MessageCircle,
  FileText,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

import ErrorBoundary from './components/ErrorBoundary';

const TIMEFRAMES: Timeframe[] = ['1t', '1m', '2m', '3m', '5m', '10m', '15m', '30m', '2h', '4h', '8h', '24h'];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.TRADE);
  
  const Footer = () => (
    <div className="py-2 px-4 text-center opacity-50">
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[7px] font-black uppercase tracking-widest text-gray-500 mb-1">
        <button onClick={() => setCurrentView(AppView.DISCLAIMER)} className="hover:text-white transition-colors">Responsible Trading</button>
        <button onClick={() => setCurrentView(AppView.PRIVACY)} className="hover:text-white transition-colors">Privacy Policy</button>
        <button onClick={() => setCurrentView(AppView.TERMS)} className="hover:text-white transition-colors">Terms & Conditions</button>
        <button onClick={() => setCurrentView(AppView.CONTACT)} className="hover:text-white transition-colors">Contact</button>
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-white leading-none">Bynex Trader</p>
      <p className="text-[7px] font-bold text-gray-500 max-w-[180px] mx-auto leading-tight mt-0.5">
        Trading involves significant risk. Bynex Trader is a third-party interface for Deriv services.
      </p>
    </div>
  );

  // ============================================================================
  // Deriv OAuth 2.0 PKCE Callback Handler
  // Process the '?code=...&state=...' redirect from Deriv
  // ============================================================================
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const errorParam = urlParams.get('error');

    if (errorParam || (code && state)) {
      const processCallback = async () => {
        try {
          const { parseOAuthCallback } = await import('./src/services/derivApiService');
          const { handleOAuthCallback } = await import('./src/services/authService');
          
          const { code: validatedCode, state: validatedState } = parseOAuthCallback();
          const { token, expiresAt, returnTo } = await handleOAuthCallback(validatedCode, validatedState);
          
          window.dispatchEvent(new CustomEvent('OAUTH_SUCCESS_REDIRECT', {
              detail: { token, expiresAt }
          }));
          window.history.replaceState({}, '', returnTo);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error during authentication';
          setCustomAlert(errorMessage);
          
          const currentUrl = new URL(window.location.href);
          const returnParams = new URLSearchParams(currentUrl.search);
          returnParams.delete('code');
          returnParams.delete('state');
          returnParams.delete('error');
          returnParams.delete('error_description');
          
          const sanitizedSearch = returnParams.toString() ? `?${returnParams.toString()}` : '';
          window.history.replaceState({}, '', currentUrl.pathname + sanitizedSearch);
        }
      };

      processCallback();
    }
  }, []);

  useEffect(() => {
    const handleRedirectSuccess = (event: Event) => {
         const customEvent = event as CustomEvent;
         import('./src/services/authService').then(mod => {
           mod.setInMemoryToken(customEvent.detail.token, customEvent.detail.expiresAt);
           window.dispatchEvent(new Event('AUTH_STATE_CHANGED'));
         });
    };
    window.addEventListener('OAUTH_SUCCESS_REDIRECT', handleRedirectSuccess);

    return () => {
      window.removeEventListener('OAUTH_SUCCESS_REDIRECT', handleRedirectSuccess);
    };
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get('startapp');
    if (referralCode) {
      localStorage.setItem('referral_code', referralCode);
    }
  }, []);

  const [selectedSymbol, setSelectedSymbol] = useState(() => localStorage.getItem('desi_selected_symbol') || '1HZ100V');

  useEffect(() => {
    localStorage.setItem('desi_selected_symbol', selectedSymbol);
  }, [selectedSymbol]);
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [tradeType, setTradeType] = useState<TradeType>('CALL');
  const [userBarrier, setUserBarrier] = useState<string>('+0.20');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [copied, setCopied] = useState(false);
  const [referralBalance, setReferralBalance] = useState(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawMethod, setWithdrawMethod] = useState('upi');
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [showWithdrawVerify, setShowWithdrawVerify] = useState(false);
  const [withdrawVerifyCode, setWithdrawVerifyCode] = useState('');
  const [isSendingVerify, setIsSendingVerify] = useState(false);
  const [demoTradeCount, setDemoTradeCount] = useState(0);
  const [showDemoWarning, setShowDemoWarning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [customAlert, setCustomAlert] = useState<string | null>(null);
  const [withdrawForm, setWithdrawForm] = useState({
    name: '',
    phone: '',
    upi: '',
    bankAcc: '',
    bankIfsc: '',
    bankRemarks: '',
    cryptoAddr: '',
    cryptoNetwork: '',
    paypalEmail: '',
    amount: ''
  });
  
  // Admin State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [supportClickCount, setSupportClickCount] = useState(0);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved as 'light' | 'dark';
    if ((window.Telegram as any)?.WebApp?.colorScheme) return (window.Telegram as any).WebApp.colorScheme;
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { 
    isConnected, 
    isReconnecting,
    isTrading, 
    account, 
    availableAccounts,
    lastTick, 
    markets,
    proposals,
    history,
    isHistoryLoading,
    openPositions,
    accountStatus,
    sellErrors,
    error,
    send, 
    login, 
    signup,
    logout, 
    switchAccount,
    subscribeProposal,
    subscribeTicks,
    unsubscribeTicks,
    getHistory,
    sellContract,
    clearProposals,
    proposalTrigger,
    clearError,
    resetBalance,
    setOnTradeExecuted,
    setOnTradeClosed
  } = useDeriv();

  useEffect(() => {
    console.log('Account Status:', accountStatus);
  }, [accountStatus]);

  const filteredOpenPositions = useMemo(() => {
    return Object.values(openPositions || {}).filter((p: Record<string, unknown>) => p.underlying === selectedSymbol);
  }, [openPositions, selectedSymbol]);

  const openPositionsList = useMemo(() => {
    return Object.values(openPositions || {}).filter((p: Record<string, unknown>) => p && p.contract_id && !p.is_sold);
  }, [openPositions]);

  const getMarketName = useCallback((symbol: string, shortcode?: string) => {
    if (shortcode) {
      // Try to find market by checking if shortcode contains the symbol
      const marketByShortcode = markets.find(m => shortcode.includes(`_${m.underlying_symbol}_`));
      if (marketByShortcode) return marketByShortcode.underlying_symbol_name;
    }
    const market = markets.find(m => m.underlying_symbol === symbol);
    return market ? market.underlying_symbol_name : symbol;
  }, [markets]);

  const getTradeTypeDisplay = useCallback((type: string, shortcode?: string) => {
    if (shortcode && (type === 'CALL' || type === 'PUT')) {
      // If the shortcode has a non-zero barrier (e.g., S10P, S-5P), it's Higher/Lower
      // S0P means it's a standard Rise/Fall trade
      const barrierMatch = shortcode.match(/_S(-?\d+(\.\d+)?)P_/);
      if (barrierMatch && barrierMatch[1] !== '0') {
        return type === 'CALL' ? 'Higher' : 'Lower';
      }
    }
    if (type === 'CALL') return 'Rise';
    if (type === 'PUT') return 'Fall';
    if (type === 'HIGHER') return 'Higher';
    if (type === 'LOWER') return 'Lower';
    if (type === 'TOUCH' || type === 'ONETOUCH') return 'Touch';
    if (type === 'NOTOUCH') return 'No Touch';
    return type?.replace('_', ' ');
  }, []);

  const manualTradeIds = useRef<Set<number>>(new Set());

  const handleTradeExecuted = useCallback((trade: any) => {
    if (account && trade.contract_id) {
      if (trade.isManual) {
        manualTradeIds.current.add(Number(trade.contract_id));
      }
      
      if (account.is_virtual) {
        // Track demo trades and show warning every 2 trades
        setDemoTradeCount(prev => {
          const newCount = prev + 1;
          if (newCount % 2 === 0) {
            setShowDemoWarning(true);
          }
          return newCount;
        });
      }
    }
  }, [account]);

  const handleTradeClosed = useCallback(async (contract: Record<string, unknown>) => {
    if (account && !account.is_virtual && contract.contract_id && contract.profit) {
      // Only track commission if trade was initiated manually via button
      if (!manualTradeIds.current.has(Number(contract.contract_id))) {
        if (import.meta.env.DEV) {
          console.log(`[REFER] Skipping non-manual trade: ${contract.contract_id}`);
        }
        return;
      }

      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/process-trade', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            userId: account.loginid,
            contractId: contract.contract_id,
            profit: parseFloat(String(contract.profit)),
            appId: NEW_APP_ID.toString(),
            referrerId: localStorage.getItem('desi_ref') || localStorage.getItem('referral_code')
          })
        });
        const data = await res.json();
        if (data.success) {
          // Remove from manual set after successful processing
          manualTradeIds.current.delete(Number(contract.contract_id));
          
          // Fetch updated balance from server after successful trade recording
          const balRes = await fetch(`/api/referral-balance/${account.loginid}`);
          const balData = await balRes.json();
          setReferralBalance(balData.balance || 0);
        }
      } catch (err) {
        console.error("Failed to record trade:", err);
      }
    }
  }, [account]);

  const [hasSentWelcome, setHasSentWelcome] = useState(false);

  useEffect(() => {
    if (account && !hasSentWelcome) {
      // Send welcome message
      fetch('/api/send-welcome-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.loginid })
      }).then(() => setHasSentWelcome(true)).catch(err => console.error("Failed to send welcome message:", err));
    }
  }, [account, hasSentWelcome]);

  useEffect(() => {
    if (setOnTradeExecuted) {
      setOnTradeExecuted(handleTradeExecuted);
    }
    if (setOnTradeClosed) {
      setOnTradeClosed(handleTradeClosed);
    }
  }, [setOnTradeExecuted, setOnTradeClosed, handleTradeExecuted, handleTradeClosed]);

  useEffect(() => {
    if (account?.is_virtual) {
      setReferralBalance(0);
    }
  }, [account?.is_virtual]);

  useEffect(() => {
    if (account?.loginid) {
      fetch(`/api/referral-balance/${account.loginid}`)
        .then(res => res.json())
        .then(data => setReferralBalance(data.balance || 0))
        .catch(err => console.error("Failed to fetch balance:", err));
    }
  }, [account?.loginid]);

  // Capture Telegram ID immediately on app load
  useEffect(() => {
    if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
      const user = window.Telegram.WebApp.initDataUnsafe.user;
      fetch('/api/user-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: user.id,
          telegramUsername: user.username,
          userId: account?.loginid || null // Send loginid if they have one, otherwise null
        })
      }).catch(err => console.error("Failed to link Telegram ID:", err));
    }
  }, [account?.loginid]);

  useEffect(() => {
    const fetchWithdrawals = async (retries = 3, delay = 2000) => {
      try {
        if (import.meta.env.DEV) {
          console.log("[CASHIER] Fetching withdrawals...");
        }
        const apiUrl = `${window.location.origin}/api/w-requests?t=${Date.now()}`;
        const res = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          let errorInfo = '';
          if (contentType && contentType.includes('application/json')) {
            const errData = await res.json();
            errorInfo = errData.error || errData.message || '';
          } else {
            errorInfo = await res.text();
          }
          throw new Error(`Server returned ${res.status}: ${errorInfo || res.statusText}`);
        }
        
        const data = await res.json();
        if (Array.isArray(data)) {
          setWithdrawalRequests(data);
        } else {
          if (import.meta.env.DEV) {
            console.error("[CASHIER] Withdrawals API did not return an array:", data);
          }
          setWithdrawalRequests([]);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isNetworkError = errorMsg === 'Failed to fetch' || errorMsg.includes('NetworkError');
        if (retries > 0 && isNetworkError) {
          console.warn(`[CASHIER] Network error fetching withdrawals, retrying in ${delay}ms... (${retries} attempts left)`);
          setTimeout(() => fetchWithdrawals(retries - 1, delay * 2), delay);
        } else {
          if (import.meta.env.DEV) {
            console.error("[CASHIER] Failed to fetch withdrawals:", errorMsg);
          }
          // Only show custom alert if it's not a background refresh
          if (retries > 1) {
             setCustomAlert(`Could not load withdrawal history. Please check your connection.`);
          }
          setWithdrawalRequests([]);
        }
      }
    };
    
    // Initial fetch with delay to ensure server and auth are ready
    const initialTimer = setTimeout(() => fetchWithdrawals(3, 1000), 1500);
    
    // Refresh periodically (every 2 minutes for background)
    const interval = setInterval(() => fetchWithdrawals(1, 0), 120000); 
    
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const saveWithdrawalRequest = async (req: WithdrawalRequest) => {
    try {
      const res = await fetch('/api/w-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      const data = await res.json();
      if (data.success) {
        setWithdrawalRequests(prev => [{ ...req, id: data.id }, ...prev]);
        setReferralBalance(prev => prev - req.amount); // Deduct locally immediately
      } else {
        alert(data.error || "Failed to submit withdrawal");
      }
    } catch (err) {
      console.error("Failed to save withdrawal:", err);
      alert("Failed to submit withdrawal");
    }
  };

  const updateRequestStatus = async (id: string, status: 'paid' | 'rejected', reason?: string) => {
    const request = withdrawalRequests.find(r => r.id === id);
    if (!request) return;

    try {
      const res = await fetch(`/api/w-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, rejectionReason: reason })
      });
      const data = await res.json();
      if (data.success) {
        if (status === 'rejected' && request.userId === account?.loginid) {
          setReferralBalance(prev => prev + request.amount);
        }
        setWithdrawalRequests(prev => prev.map(r => r.id === id ? { ...r, status, rejectionReason: reason } : r));
      } else {
        alert(data.error || "Failed to update status");
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  useEffect(() => {
    clearProposals();
  }, [selectedSymbol, clearProposals]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    
    // Check for Telegram start_param (referral ID)
    const tgStartParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;

    if (tgStartParam) {
      localStorage.setItem('desi_ref', tgStartParam);
    } else if (ref) {
      localStorage.setItem('desi_ref', ref);
    }
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }

    // Refresh contract IDs on mount
    clearProposals();
  }, []);

  useEffect(() => {
    // Removed mass subscription to all markets to prevent rate limit errors.
    // The MarketSelector will just display the symbol names without live prices,
    // or we can implement a paginated/limited subscription later if needed.
  }, [isConnected, showMarketSelector, currentView, markets, send]);

  useEffect(() => {
    if (isConnected) {
      subscribeTicks(selectedSymbol);
    }
    return () => {
      if (isConnected) {
        unsubscribeTicks();
      }
    };
  }, [isConnected, selectedSymbol, subscribeTicks, unsubscribeTicks]);

  const currentMarket = useMemo(() => 
    markets.find(m => m.underlying_symbol === selectedSymbol) || { 
      underlying_symbol_name: 'Volatility 100 Index', 
      underlying_symbol: '1HZ100V',
      market: 'synthetic_index',
      submarket: 'random_index'
    }
  , [markets, selectedSymbol]);

  const activeBarrier = useMemo(() => {
    // For Rise/Fall, we don't show a barrier line before trade
    if (!['HIGHER', 'LOWER', 'TOUCH', 'NOTOUCH', 'ONETOUCH'].includes(tradeType)) {
      // Only show barrier for open positions if it's a barrier trade
      const firstOpen = Object.values(openPositions || {})[0];
      if (firstOpen && firstOpen.shortcode) {
        const barrierMatch = firstOpen.shortcode.match(/_S(-?\d+(\.\d+)?)P_/);
        if (barrierMatch && barrierMatch[1] !== '0') {
          return firstOpen.barrier;
        }
      }
      return undefined;
    }

    // Use the barrier from the first open position if available, or proposal
    const firstOpen = Object.values(openPositions || {})[0];
    if (firstOpen?.barrier) return firstOpen.barrier;
    
    // For Higher/Lower and Touch/No Touch, the barrier is the same for both directions
    const p = Object.values(proposals)[0];
    return p?.barrier;
  }, [proposals, openPositions, tradeType]);

  const realAccount = availableAccounts.find(acc => !acc.is_virtual && acc.currency === 'USD') || availableAccounts.find(acc => !acc.is_virtual);
  const referralLink = realAccount ? `https://t.me/bynextraderreferbot/refer?startapp=${realAccount.loginid}` : 'Real Account Required';

  const copyReferralLink = () => {
    if (!realAccount) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [showAssistant, setShowAssistant] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (currentView === AppView.HISTORY) {
      getHistory();
      interval = setInterval(getHistory, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentView, getHistory]);

  const renderContent = () => {
    const formatTimeLeft = (seconds: number) => {
      if (seconds <= 0) return '0 Seconds';
      const d = Math.floor(seconds / (24 * 3600));
      const h = Math.floor((seconds % (24 * 3600)) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);

      const parts = [];
      if (d > 0) parts.push(`${d} Day${d > 1 ? 's' : ''}`);
      if (h > 0) parts.push(`${h} Hour${h > 1 ? 's' : ''}`);
      if (m > 0) parts.push(`${m} Min${m > 1 ? 's' : ''}`);
      if (s > 0 || parts.length === 0) parts.push(`${s} Sec${s > 1 ? 's' : ''}`);

      return parts.join(' ');
    };

    switch (currentView) {
      case AppView.TRADE:
        return (
          <div className="relative h-full flex flex-col bg-[#0b0e14] flex-1 overflow-y-auto pb-28">
            {/* Market Header */}
            <div className="sticky top-2 left-2 right-2 flex items-center justify-between z-50 pointer-events-none mx-2">
              <div className="pointer-events-auto">
                <button 
                  onClick={() => setShowMarketSelector(true)}
                  className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/5 hover:bg-black/60 transition-all"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-[9px] font-black text-red-500 uppercase tracking-widest leading-none mb-0.5">
                      {currentMarket.market.replace('_', ' ')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white">{currentMarket.underlying_symbol_name}</span>
                      <ChevronDown className="w-3 h-3 text-red-500" />
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex flex-col items-end bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/5 pointer-events-auto">
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none mb-0.5">Last Price</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-black text-white tabular-nums">
                    {lastTick?.underlying_symbol === selectedSymbol ? lastTick?.quote.toFixed(4) : '...'}
                  </span>
                  {lastTick?.underlying_symbol === selectedSymbol && lastTick?.change !== 0 && (
                    <span className={`text-[9px] font-bold ${lastTick.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {lastTick.change > 0 ? '+' : ''}{lastTick.change.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full h-[40vh] min-h-[300px] relative flex-shrink-0">
              <ErrorBoundary>
                <Suspense fallback={<div className="flex h-full w-full items-center justify-center text-muted-foreground bg-surface rounded-lg">Loading Chart Engine...</div>}>
                  <TradingChart 
                    underlying_symbol={selectedSymbol} 
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    barrier={activeBarrier ?? (['HIGHER', 'LOWER', 'TOUCH', 'NOTOUCH', 'ONETOUCH'].includes(tradeType) ? userBarrier : undefined)}
                    openPositions={filteredOpenPositions}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>

            <div className="w-full z-10 flex-shrink-0 pb-4">
              <TradeForm 
                underlying_symbol={selectedSymbol}
                onTrade={send}
                proposals={proposals}
                subscribeProposal={subscribeProposal}
                clearProposals={clearProposals}
                clearError={clearError}
                isTrading={isTrading}
                balance={account?.balance || 0}
                error={error}
                isAuthenticated={!!account}
                onLogin={login}
                onShowLoginModal={() => setShowLoginModal(true)}
                barrier={userBarrier}
                onBarrierChange={setUserBarrier}
                lastPrice={lastTick?.underlying_symbol === selectedSymbol ? lastTick?.quote : 0}
                tradeType={tradeType}
                onTradeTypeChange={setTradeType}
                proposalTrigger={proposalTrigger}
                currency={account?.currency}
                isConnected={isConnected}
              />
              <div className="mt-3 text-center px-4">
                <p className="text-[8px] text-gray-500 leading-tight">
                  <span className="font-bold">Risk Warning:</span> Trading involves significant risk and can result in the loss of your invested capital. Please ensure you fully understand the risks involved before trading.
                </p>
              </div>
            </div>
          </div>
        );

      case AppView.HISTORY:
        return (
          <div className="p-4 space-y-4 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-black italic uppercase">Trade History</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={getHistory} 
                  disabled={isHistoryLoading}
                  className={`text-[10px] font-bold uppercase flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    isHistoryLoading ? 'bg-white/5 text-gray-500' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  }`}
                >
                  {isHistoryLoading ? (
                    <>
                      <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <HistoryIcon className="w-3 h-3" />
                      Refresh
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Open Positions Section */}
            {openPositionsList.length > 0 && (
              <div className="space-y-3 mb-6">
                <h3 className="text-sm font-black text-white uppercase px-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Open Positions ({openPositionsList.length})
                </h3>
                {openPositionsList.map((pos: any) => (
                  <div key={pos.contract_id} className="bg-white/10 border border-white/10 p-4 rounded-2xl flex items-center justify-between relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500" />
                    <div className="flex items-center gap-4 pl-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${Number(pos.profit) >= 0 ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                        {pos.contract_type === 'CALL' || pos.contract_type === 'HIGHER' || pos.contract_type === 'TOUCH' || pos.contract_type === 'ONETOUCH' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-black">{getMarketName(pos.underlying, pos.shortcode)}</p>
                        <div className="flex flex-col">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">
                            {getTradeTypeDisplay(pos.contract_type, pos.shortcode)} • {pos.purchase_time ? format(pos.purchase_time * 1000, 'HH:mm:ss') : 'N/A'}
                          </p>
                          <p className="text-[8px] font-mono text-gray-600 uppercase mt-0.5">ID: {pos.contract_id}</p>
                          {sellErrors[pos.contract_id] && (
                            <p className="text-[8px] text-red-500 font-bold mt-1 animate-pulse">
                              {sellErrors[pos.contract_id]}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className={`text-sm font-black ${Number(pos.profit) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {Number(pos.profit) >= 0 ? '+' : ''}{Number(pos.profit || 0).toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)} {account?.currency}
                      </p>
                      <p className="text-[10px] font-bold text-yellow-500 uppercase">
                        {pos.date_expiry ? `${formatTimeLeft(Math.max(0, Math.floor(pos.date_expiry - now / 1000)))} left` : 'RUNNING'}
                      </p>
                      <button 
                        disabled={pos.is_sell_allowed === 0}
                        onClick={() => sellContract(pos.contract_id)}
                        className="px-2 py-1 bg-red-600/20 border border-red-600/30 rounded-lg text-[8px] font-black uppercase text-red-500 hover:bg-red-600 hover:text-white transition-all disabled:bg-white/5 disabled:border-white/5 disabled:text-gray-600 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                      >
                        {pos.is_sell_allowed === 0 ? 'Locked' : 'Sell'}
                      </button>
                    </div>
                  </div>
                ))}
                <div className="h-px bg-white/5 my-4" />
              </div>
            )}

            {/* Trade History */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-gray-500 uppercase px-2">Trade History</h3>
              {(history || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 opacity-20">
                  <HistoryIcon className="w-12 h-12 mb-2" />
                  <p className="font-black uppercase text-xs">No history found</p>
                </div>
              ) : (
                (history || []).map((t, i) => (
                  <div key={i} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${Number(t.profit || 0) > 0 ? 'bg-green-500/10 text-green-500' : Number(t.profit || 0) < 0 ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-400'}`}>
                        {t.type === 'CALL' || t.type === 'HIGHER' || t.type === 'TOUCH' || t.type === 'ONETOUCH' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-black">{getMarketName(t.underlying_symbol, t.shortcode)}</p>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold text-gray-500 uppercase">{t.entry_time ? format(t.entry_time * 1000, 'MMM dd, HH:mm') : 'N/A'}</p>
                            <span className="w-1 h-1 bg-white/10 rounded-full" />
                            <p className="text-[10px] font-bold text-gray-500 uppercase">{getTradeTypeDisplay(t.type, t.shortcode)}</p>
                            {t.entry_time && t.exit_time && (
                              <>
                                <span className="w-1 h-1 bg-white/10 rounded-full" />
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Dur: {formatTimeLeft(t.exit_time - t.entry_time)}</p>
                              </>
                            )}
                          </div>
                          <p className="text-[8px] font-mono text-gray-600 uppercase mt-0.5">ID: {t.contract_id}</p>
                          {sellErrors[t.contract_id] && (
                            <p className="text-[8px] text-red-500 font-bold mt-1 animate-pulse">
                              {sellErrors[t.contract_id]}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className={`text-sm font-black ${Number(t.profit || 0) > 0 ? 'text-green-500' : Number(t.profit || 0) < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {Number(t.profit || 0) > 0 ? `+${Number(t.profit || 0).toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)}` : Number(t.profit || 0) < 0 ? `-${Math.abs(Number(t.profit || 0)).toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)}` : '0.00'} {account?.currency}
                      </p>
                      <p className={`text-[10px] font-bold uppercase ${Number(t.profit || 0) > 0 ? 'text-green-500/50' : Number(t.profit || 0) < 0 ? 'text-red-500/50' : 'text-gray-500/50'}`}>
                        {Number(t.profit || 0) > 0 ? 'Profit' : Number(t.profit || 0) < 0 ? 'Loss' : 'Draw'}
                      </p>
                      {t.status === 'open' && (
                        <button 
                          disabled={openPositions[t.contract_id] && openPositions[t.contract_id].is_sell_allowed === 0}
                          onClick={() => sellContract(t.contract_id)}
                          className="px-2 py-1 bg-red-600/20 border border-red-600/30 rounded-lg text-[8px] font-black uppercase text-red-500 hover:bg-red-600 hover:text-white transition-all disabled:bg-white/5 disabled:border-white/5 disabled:text-gray-600 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                        >
                          {(openPositions[t.contract_id] && openPositions[t.contract_id].is_sell_allowed === 0) ? 'Locked' : 'Sell'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <Footer />
          </div>
        );

      case AppView.CASHIER:
        return (
          <div className="p-6 space-y-6 text-center relative z-10">
            <div className="flex flex-col items-center mb-4">
              <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center mb-4">
                <Wallet className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-black italic uppercase">Cashier Hub</h2>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Secure Financial Portal</p>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => send({ cashier: 'deposit' })} 
                className="p-6 bg-green-500/5 border border-green-500/10 rounded-[2rem] text-left hover:bg-green-500/10 transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-black text-green-500 uppercase italic">Deposit Funds</h3>
                  <ArrowUpRight className="w-5 h-5 text-green-500 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed">Instantly fund your account using cards, e-wallets, or crypto via Deriv.</p>
              </button>

              <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-[2rem] text-left space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-red-500 uppercase italic">Withdraw Funds</h3>
                  <ArrowDownRight className="w-5 h-5 text-red-500" />
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed">Securely transfer your trading balance to your preferred method via Deriv.</p>
                
                {!showWithdrawVerify ? (
                  <button 
                    onClick={() => {
                      if (account && account.is_virtual) {
                        setCustomAlert("Demo accounts cannot withdraw funds. Please switch to a real account.");
                        return;
                      }
                      if (account && !account.is_virtual && account.balance <= 0) {
                        setCustomAlert("Your real account balance is 0. Make a deposit and try again.");
                        return;
                      }
                      setIsSendingVerify(true);
                      send({ verify_email: account?.email, type: 'payment_withdraw' });
                      setTimeout(() => {
                        setIsSendingVerify(false);
                        setShowWithdrawVerify(true);
                      }, 1500);
                    }}
                    disabled={isSendingVerify || !account}
                    className="w-full py-3 bg-red-600 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-red-600/20 disabled:opacity-50"
                  >
                    {isSendingVerify ? 'Sending Email...' : 'Send Verification Email'}
                  </button>
                ) : (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                    <p className="text-[8px] font-bold text-gray-400 uppercase">Enter the code sent to your email</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={withdrawVerifyCode}
                        onChange={(e) => setWithdrawVerifyCode(e.target.value)}
                        placeholder="Verification Code"
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs font-mono font-bold outline-none focus:border-red-500/50"
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          if (account && account.is_virtual) {
                            setCustomAlert("Demo accounts cannot withdraw funds. Please switch to a real account.");
                            return;
                          }
                          if (account && !account.is_virtual && account.balance <= 0) {
                            setCustomAlert("Your real account balance is 0. Make a deposit and try again.");
                            return;
                          }
                          if (withdrawVerifyCode.trim()) {
                            send({ cashier: 'withdraw', verification_code: withdrawVerifyCode.trim() });
                          }
                        }}
                        disabled={!withdrawVerifyCode.trim()}
                        className="px-4 py-2 bg-red-600 rounded-xl font-black text-[10px] uppercase disabled:opacity-50"
                      >
                        Go
                      </button>
                    </div>
                    <button 
                      onClick={() => setShowWithdrawVerify(false)}
                      className="text-[8px] font-bold text-gray-500 uppercase hover:text-white"
                    >
                      Resend Email
                    </button>
                  </div>
                )}
              </div>

              <button 
                onClick={() => window.open('https://dp2p.deriv.com/', '_blank')} 
                className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-[2rem] text-left hover:bg-blue-500/10 transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-black text-blue-500 uppercase italic">Deriv P2P</h3>
                  <Globe className="w-5 h-5 text-blue-500 group-hover:rotate-12 transition-transform" />
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed">Exchange local currency with other traders in your region via Deriv P2P.</p>
              </button>
            </div>
          </div>
        );

      case AppView.WITHDRAW:
        return (
          <div className="p-6 space-y-6 relative z-10">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={() => setCurrentView(AppView.REFER)} className="p-2 bg-white/5 rounded-full">
                <ArrowDownRight className="w-5 h-5 rotate-135" />
              </button>
              <h2 className="text-xl font-black italic uppercase">Withdraw Profit</h2>
            </div>

            <div className="bg-white/5 border border-white/5 p-6 rounded-[2rem] space-y-6">
              <div className="space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                  <p className="text-[10px] font-black text-red-500 uppercase leading-relaxed">
                    This form is for manual withdrawal of your referral commissions. Requests are processed within 24 hours by the administrator.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Withdrawal Amount ({account?.currency || 'USD'})</label>
                    <input 
                      type="number" 
                      step={getCurrencyConfig(account?.currency || 'USD').step}
                      value={withdrawForm.amount}
                      onChange={(e) => setWithdrawForm({...withdrawForm, amount: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                      placeholder={`Min ${account?.currency || 'USD'} ${parseFloat(getCurrencyConfig(account?.currency || 'USD').min).toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)}`} 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Full Name</label>
                    <input 
                      type="text" 
                      value={withdrawForm.name}
                      onChange={(e) => setWithdrawForm({...withdrawForm, name: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                      placeholder="Your Name" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Phone Number</label>
                    <input 
                      type="tel" 
                      value={withdrawForm.phone}
                      onChange={(e) => setWithdrawForm({...withdrawForm, phone: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                      placeholder="+1..." 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'upi', label: 'UPI / PhonePe', icon: <Smartphone className="w-4 h-4" /> },
                      { id: 'bank', label: 'Bank Transfer', icon: <CreditCard className="w-4 h-4" /> },
                      { id: 'crypto', label: 'Crypto', icon: <Bitcoin className="w-4 h-4" /> },
                      { id: 'paypal', label: 'PayPal', icon: <Globe className="w-4 h-4" /> },
                    ].map(m => (
                      <button 
                        key={m.id} 
                        onClick={() => setWithdrawMethod(m.id)}
                        className={`flex items-center gap-2 p-3 border rounded-xl text-[10px] font-black uppercase transition-all ${
                          withdrawMethod === m.id ? 'bg-red-600 border-red-600 text-white' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'
                        }`}
                      >
                        {m.icon}
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Fields */}
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {withdrawMethod === 'upi' && (
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">UPI ID / PhonePe Number</label>
                      <input 
                        type="text" 
                        value={withdrawForm.upi}
                        onChange={(e) => setWithdrawForm({...withdrawForm, upi: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                        placeholder="example@upi" 
                      />
                    </div>
                  )}

                  {withdrawMethod === 'bank' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Account Number</label>
                        <input 
                          type="text" 
                          value={withdrawForm.bankAcc}
                          onChange={(e) => setWithdrawForm({...withdrawForm, bankAcc: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                          placeholder="Bank Account Number" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">IFSC Code</label>
                        <input 
                          type="text" 
                          value={withdrawForm.bankIfsc}
                          onChange={(e) => setWithdrawForm({...withdrawForm, bankIfsc: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                          placeholder="Bank IFSC Code" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Remarks (Optional)</label>
                        <input 
                          type="text" 
                          value={withdrawForm.bankRemarks}
                          onChange={(e) => setWithdrawForm({...withdrawForm, bankRemarks: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                          placeholder="Any specific instructions" 
                        />
                      </div>
                    </div>
                  )}

                  {withdrawMethod === 'crypto' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Crypto Address</label>
                        <input 
                          type="text" 
                          value={withdrawForm.cryptoAddr}
                          onChange={(e) => setWithdrawForm({...withdrawForm, cryptoAddr: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                          placeholder="Wallet Address (USDT)" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Network</label>
                        <select 
                          value={withdrawForm.cryptoNetwork}
                          onChange={(e) => setWithdrawForm({...withdrawForm, cryptoNetwork: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50"
                        >
                          <option value="">Select Network</option>
                          <option value="trc20">TRC20 (Tron)</option>
                          <option value="erc20">ERC20 (Ethereum)</option>
                          <option value="bep20">BEP20 (BSC)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {withdrawMethod === 'paypal' && (
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">PayPal Email ID</label>
                      <input 
                        type="email" 
                        value={withdrawForm.paypalEmail}
                        onChange={(e) => setWithdrawForm({...withdrawForm, paypalEmail: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50" 
                        placeholder="example@paypal.com" 
                      />
                    </div>
                  )}
                </div>
              </div>
              <button 
                disabled={isWithdrawing || referralBalance < 10 || !withdrawForm.amount || parseFloat(withdrawForm.amount) < 10 || parseFloat(withdrawForm.amount) > referralBalance}
                onClick={async () => {
                  setIsWithdrawing(true);
                  // Simulate API call
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  if (window.Telegram?.WebApp) {
                    if (window.Telegram.WebApp.isVersionAtLeast('6.2')) {
                      window.Telegram.WebApp.showAlert('Withdrawal request submitted successfully! Our team will process it within 24 hours.');
                    } else {
                      setCustomAlert('Withdrawal request submitted successfully! Our team will process it within 24 hours.');
                    }
                  }
                  setReferralBalance(prev => prev - parseFloat(withdrawForm.amount));
                  
                  // Save Request
                  const newRequest: WithdrawalRequest = {
                    id: Math.random().toString(36).substr(2, 9),
                    userId: account?.loginid || 'guest',
                    amount: parseFloat(withdrawForm.amount),
                    method: withdrawMethod,
                    details: withdrawMethod === 'upi' ? withdrawForm.upi : 
                             withdrawMethod === 'bank' ? `${withdrawForm.bankAcc} (${withdrawForm.bankIfsc})` :
                             withdrawMethod === 'crypto' ? `${withdrawForm.cryptoAddr} (${withdrawForm.cryptoNetwork})` :
                             withdrawForm.paypalEmail,
                    status: 'pending',
                    timestamp: Date.now()
                  };
                  saveWithdrawalRequest(newRequest);
                  
                  setIsWithdrawing(false);
                  setCurrentView(AppView.REFER);
                }}
                className="w-full py-4 bg-red-600 rounded-2xl font-black text-sm uppercase shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isWithdrawing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  !withdrawForm.amount ? 'Enter Amount' :
                  parseFloat(withdrawForm.amount) < 10 ? 'Min $10 Required' :
                  parseFloat(withdrawForm.amount) > referralBalance ? 'Insufficient Balance' :
                  'Submit Request'
                )}
              </button>
            </div>
          </div>
        );

      case AppView.ADMIN:
        if (!isAdminLoggedIn) {
          return (
            <div className="p-6 flex flex-col items-center justify-center h-full">
              <div className="w-full max-w-sm bg-[#141922] border border-white/10 rounded-3xl p-8 space-y-6 text-center">
                <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center mx-auto">
                  <Lock className="w-8 h-8 text-red-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black italic uppercase">Admin Access</h2>
                  <p className="text-xs font-bold text-gray-500 uppercase mt-2">Enter password to continue</p>
                </div>
                
                <div className="space-y-4">
                  <input 
                    type="password" 
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setAdminError('');
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-red-500/50 text-center tracking-widest" 
                    placeholder="••••••" 
                  />
                  {adminError && <p className="text-[10px] font-bold text-red-500 uppercase">{adminError}</p>}
                  
                  <button 
                    onClick={() => {
                      if (adminPassword === 'Kiran87289502165802') {
                        setIsAdminLoggedIn(true);
                        setAdminPassword('');
                      } else {
                        setAdminError('Invalid Password');
                      }
                    }}
                    className="w-full py-4 bg-red-600 rounded-2xl font-black text-sm uppercase shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors"
                  >
                    Login
                  </button>
                  
                  <button 
                    onClick={() => setCurrentView(AppView.REFER)}
                    className="text-[10px] font-bold text-gray-500 uppercase hover:text-white"
                  >
                    Back to App
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="p-6 space-y-6 h-full overflow-y-auto pb-24">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentView(AppView.REFER)} className="p-2 bg-white/5 rounded-full">
                  <ArrowDownRight className="w-5 h-5 rotate-135" />
                </button>
                <h2 className="text-xl font-black italic uppercase">Admin Dashboard</h2>
              </div>
              <button 
                onClick={() => setIsAdminLoggedIn(false)}
                className="p-2 bg-red-500/10 rounded-full text-red-500 hover:bg-red-500/20"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Pending</p>
                <p className="text-2xl font-black text-yellow-500">
                  {(withdrawalRequests || []).filter(r => r.status === 'pending').length}
                </p>
              </div>
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Paid Total</p>
                <p className="text-2xl font-black text-green-500">
                  {(Array.isArray(withdrawalRequests) ? withdrawalRequests : []).filter(r => r.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0).toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)} {account?.currency || 'USD'}
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-sm font-black text-gray-500 uppercase px-2">Recent Requests</h3>
              
              {(withdrawalRequests || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                  <Wallet className="w-16 h-16 mb-4" />
                  <p className="font-black uppercase text-xs">No requests found</p>
                </div>
              ) : (
                (Array.isArray(withdrawalRequests) ? withdrawalRequests : []).map(req => (
                  <div key={req.id} className={`bg-white/5 border border-white/5 p-4 rounded-2xl space-y-3 ${req.status !== 'pending' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-white uppercase">{req.userId}</p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase">{format(req.timestamp, 'MMM dd, HH:mm')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-white">{req.amount.toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)} {account?.currency || 'USD'}</p>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                          req.status === 'paid' ? 'bg-green-500/20 text-green-500' :
                          'bg-red-500/20 text-red-500'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Method</span>
                        <span className="text-[10px] font-bold text-white uppercase">{req.method}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Details</span>
                        <span className="text-[10px] font-mono text-white break-all text-right max-w-[70%]">{req.details}</span>
                      </div>
                    </div>

                    {req.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button 
                          onClick={() => {
                            const reason = prompt('Enter rejection reason:');
                            if (reason) {
                              updateRequestStatus(req.id, 'rejected', reason);
                            }
                          }}
                          className="py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-black text-red-500 uppercase hover:bg-red-500/20"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => updateRequestStatus(req.id, 'paid')}
                          className="py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-[10px] font-black text-green-500 uppercase hover:bg-green-500/20"
                        >
                          Mark Paid
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case AppView.REFER:
        return (
          <div className="p-6 space-y-6 relative z-10">
            <div className="text-center space-y-4 mb-8">
              <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-3xl font-black italic uppercase leading-none" onClick={() => {
                if (supportClickCount >= 5) {
                  setCurrentView(AppView.ADMIN);
                  setSupportClickCount(0);
                } else {
                  setSupportClickCount(prev => prev + 1);
                }
              }}>Refer & Earn</h2>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Build your trading network</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl text-center">
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Your Earnings</p>
                <p className="text-2xl font-black text-red-500">{referralBalance.toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)} {account?.currency || 'USD'}</p>
              </div>
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl text-center">
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Total Referrals</p>
                <p className="text-2xl font-black text-white">0</p>
              </div>
            </div>

            {localStorage.getItem('desi_ref') && (
              <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-[10px] font-black text-green-500 uppercase">Active Referrer</p>
                  <p className="text-xs font-bold text-white uppercase">{localStorage.getItem('desi_ref')}</p>
                </div>
              </div>
            )}

            <div className="bg-white/5 border border-white/5 p-6 rounded-[2rem] space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-black uppercase italic">Referral Earnings</h3>
                <button 
                  disabled={referralBalance < 10}
                  onClick={() => setCurrentView(AppView.WITHDRAW)}
                  className="px-4 py-2 bg-red-600 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:grayscale"
                >
                  Withdraw Profit
                </button>
              </div>
              <h3 className="text-sm font-black uppercase italic">Your Referral Link</h3>
              <div className="flex items-center gap-2 bg-black/40 p-3 rounded-xl border border-white/5">
                <div 
                  className={`flex-1 bg-transparent text-[10px] font-mono font-bold outline-none break-all ${!realAccount ? 'text-gray-600' : 'text-gray-400'}`}
                >
                  {referralLink}
                </div>
                <button 
                  onClick={copyReferralLink} 
                  disabled={!realAccount}
                  className="p-2 bg-red-600 rounded-lg disabled:opacity-50 shrink-0"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                </button>
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed">
                {!realAccount ? 'Open a Real Account to get your referral link.' : 'Share this link with your friends. When they trade on a real account, you earn 1% of their trade volume instantly.'}
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-black uppercase italic px-2">Payout History</h3>
              {(Array.isArray(withdrawalRequests) ? withdrawalRequests : []).filter(r => r.userId === (account?.loginid || 'guest')).length === 0 ? (
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                  <p className="text-[10px] font-bold text-gray-500 uppercase">No payout history found</p>
                </div>
              ) : (
                (Array.isArray(withdrawalRequests) ? withdrawalRequests : []).filter(r => r.userId === (account?.loginid || 'guest')).map(req => (
                  <div key={req.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-white">{req.amount.toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)} {account?.currency || 'USD'}</p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase">{format(req.timestamp, 'MMM dd, HH:mm')}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                          req.status === 'paid' ? 'bg-green-500/20 text-green-500' :
                          'bg-red-500/20 text-red-500'
                        }`}>
                          {req.status === 'paid' ? 'PAID' : req.status}
                        </span>
                      </div>
                    </div>
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-xl">
                        <p className="text-[10px] font-bold text-red-500 uppercase">Reason: {req.rejectionReason}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-black uppercase italic px-2">How it works</h3>
              {[
                { step: '01', title: 'Invite Friends', desc: 'Share your unique link via Telegram or Social Media.' },
                { step: '02', title: 'They Trade', desc: 'Your referrals sign up and start trading on Bynex Trader.' },
                { step: '03', title: 'Earn Rewards', desc: 'Get 1% commission on every trade they make.' },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-lg font-black text-red-500 italic">{s.step}</span>
                  <div>
                    <p className="text-xs font-black uppercase text-white mb-1">{s.title}</p>
                    <p className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Footer />
          </div>
        );

      case AppView.MARKETS:
        return (
          <div className="p-6 space-y-6 h-full overflow-y-auto pb-24">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-black italic uppercase">Active Markets</h2>
              <Globe className="w-5 h-5 text-red-500" />
            </div>

            <div className="grid grid-cols-1 gap-3">
              {(markets || []).map((m, idx) => (
                <button
                  key={m.underlying_symbol || `market-list-${idx}`}
                  onClick={() => {
                    setSelectedSymbol(m.underlying_symbol);
                    setCurrentView(AppView.TRADE);
                  }}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between group ${
                    selectedSymbol === m.underlying_symbol 
                      ? 'bg-red-600/10 border-red-600/50' 
                      : 'bg-white/5 border-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      selectedSymbol === m.underlying_symbol ? 'bg-red-600 text-white' : 'bg-white/10 text-gray-400'
                    }`}>
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-white uppercase">{m.underlying_symbol_name}</p>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">{m.market.replace('_', ' ')} • {m.submarket.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-red-500 uppercase opacity-0 group-hover:opacity-100 transition-opacity">Select</p>
                  </div>
                </button>
              ))}
            </div>
            <Footer />
          </div>
        );

      case AppView.PROFILE:
        return (
          <div className="p-6 space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-2xl font-black italic uppercase">Profile</h2>
            </div>

            {!account ? (
              <div className="space-y-3">
                <button onClick={signup} className="w-full py-4 bg-red-600 rounded-2xl font-black text-sm uppercase shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors">Register</button>
                <button onClick={login} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-sm uppercase hover:bg-white/10 transition-colors">Login</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-gray-500 uppercase">Email</p>
                  <p className="text-sm font-black text-white">{account.email}</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-gray-500 uppercase">Login ID</p>
                  <p className="text-sm font-black text-white">{account.loginid}</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase">KYC Status</p>
                    <p className={`text-sm font-black ${
                      (account.is_virtual && (accountStatus?.authentication?.identity?.status === 'none' || accountStatus?.authentication?.identity?.status === 'verified')) || 
                      accountStatus?.authentication?.identity?.status === 'verified' 
                        ? 'text-green-500' 
                        : 'text-red-500'
                    }`}>
                      {account.is_virtual 
                        ? (accountStatus?.authentication?.identity?.status === 'none' || accountStatus?.authentication?.identity?.status === 'verified' ? 'Verified (Demo)' : (accountStatus?.authentication?.identity?.status || 'Unverified'))
                        : (accountStatus?.authentication?.identity?.status || 'Unverified')}
                    </p>
                  </div>
                  {(!account.is_virtual && accountStatus?.authentication?.identity?.status !== 'verified') && (
                    <button 
                      onClick={() => window.open('https://app.deriv.com/account/proof-of-identity', '_blank')}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-[10px] font-black uppercase tracking-wider text-white transition-colors"
                    >
                      Complete KYC
                    </button>
                  )}
                </div>
              </div>
            )}

            {account && (
              <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem]">
                <h3 className="text-sm font-black uppercase mb-4">Refer and Earn</h3>
                <p className="text-xs text-gray-400 mb-4">Earn 1% commission on every real trade made by your referrals.</p>
                <div className="text-2xl font-black text-white">{referralBalance.toFixed(getCurrencyConfig(account?.currency || 'USD').decimals)} {account?.currency || 'USD'}</div>
              </div>
            )}

            <button onClick={() => setCurrentView(AppView.CONTACT)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group">
              <span className="text-sm font-black uppercase">Contact Us</span>
              <MessageCircle className="w-5 h-5 text-gray-500 group-hover:text-white" />
            </button>

            <button onClick={() => setShowGuideModal(true)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group mt-2">
              <span className="text-sm font-black uppercase">How to Guide</span>
              <BookOpen className="w-5 h-5 text-gray-500 group-hover:text-white" />
            </button>
            
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setCurrentView(AppView.DISCLAIMER)} className="p-3 bg-white/5 border border-white/10 rounded-xl text-center hover:bg-white/10 transition-colors">
                <ShieldAlert className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                <span className="text-[8px] font-black uppercase block">Risk</span>
              </button>
              <button onClick={() => setCurrentView(AppView.PRIVACY)} className="p-3 bg-white/5 border border-white/10 rounded-xl text-center hover:bg-white/10 transition-colors">
                <Lock className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                <span className="text-[8px] font-black uppercase block">Privacy</span>
              </button>
              <button onClick={() => setCurrentView(AppView.TERMS)} className="p-3 bg-white/5 border border-white/10 rounded-xl text-center hover:bg-white/10 transition-colors">
                <FileText className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                <span className="text-[8px] font-black uppercase block">Terms</span>
              </button>
            </div>
            <Footer />
          </div>
        );

      case AppView.PRIVACY:
        return (
          <div className="p-6 space-y-6 h-full overflow-y-auto">
            <button onClick={() => setCurrentView(AppView.PROFILE)} className="p-2 bg-white/5 rounded-full mb-4">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black italic uppercase">Privacy Policy</h2>
            <div className="text-sm text-gray-400 space-y-6">
              <p>This Privacy Policy outlines how Bynex Trader ("we", "our", or "the Platform") manages, protects, and utilizes your data when you use our trading interface.</p>
              
              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs flex items-center gap-2">
                  <ShieldCheck className="w-3 h-3 text-green-500" />
                  1. OAuth 2.0 & Authentication Security
                </h3>
                <p>Bynex Trader utilizes the industry-standard OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange). We <strong>NEVER</strong> see, request, or store your Deriv account password. Your credentials are entered exclusively on Deriv's official authentication servers.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs flex items-center gap-2">
                  <Lock className="w-3 h-3 text-blue-500" />
                  2. Token Management
                </h3>
                <p>Upon successful authentication, the Platform receives short-lived access tokens and refresh tokens. These tokens are used solely to execute market operations on your behalf via the Deriv API. Tokens are stored securely and are only valid for the duration of your session or until revoked by you through your Deriv account settings.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs flex items-center gap-2">
                  <FileText className="w-3 h-3 text-gray-400" />
                  3. Account Data Handling
                </h3>
                <p>To provide an integrated trading experience, we retrieve and temporarily display basic account information, including:
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Account balances and currency types.</li>
                    <li>Open positions and portfolio performance.</li>
                    <li>Historical trade data for performance analysis.</li>
                  </ul>
                This data is accessed in real-time through the Deriv API and is not shared with unauthorized third parties.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs">4. Data Integrity</h3>
                <p>We implement robust technical and organizational measures to safeguard your trading session from unauthorized access. Users are encouraged to enable Two-Factor Authentication (2FA) on their primary Deriv accounts for maximum security.</p>
              </section>
            </div>
            <Footer />
          </div>
        );

      case AppView.TERMS:
        return (
          <div className="p-6 space-y-6 h-full overflow-y-auto">
            <button onClick={() => setCurrentView(AppView.PROFILE)} className="p-2 bg-white/5 rounded-full mb-4">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black italic uppercase">Terms & Conditions</h2>
            <div className="text-sm text-gray-400 space-y-6">
              <p>Welcome to Bynex Trader. By accessing or using this application, you agree to be bound by the following Terms & Conditions.</p>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs">1. Third-Party Interface Disclosure</h3>
                <p>Bynex Trader is an independent third-party trading interface built using the official Deriv API. It is <strong>NOT</strong> an official Deriv application, nor is it owned or operated by Deriv. We provide a custom interface to access Deriv's financial services.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs">2. Adherence to Deriv Terms</h3>
                <p>By using this platform, you explicitly acknowledge that you must also strictly adhere to <strong>Deriv's official Terms and Conditions</strong> and legal framework. Any violation of Deriv's policies may lead to the suspension of your account both on our platform and by Deriv.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs text-yellow-500">3. Commission & Markup Disclosure</h3>
                <p>Bynex Trader operates on a commercial model where the Platform earns a <strong>markup commission</strong> on executed contracts. This markup is integrated into the contract pricing or payout ratios and may affect your final profitability. By executing a trade, you provide your informed consent to this fee structure.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs text-red-500">4. Limitation of Liability</h3>
                <p>The developers and operators of Bynex Trader shall not be held liable for any financial losses, damages, or claims arising from trading activities. Trading outcomes depend on market conditions and your individual strategy. We do not provide financial advice or guarantee platform uptime.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs">5. Risk Acceptance</h3>
                <p>You acknowledge that financial trading is highly speculative and carries a substantial risk of loss. You represent that you have the necessary financial knowledge and resources to engage in such activities.</p>
              </section>
            </div>
            <Footer />
          </div>
        );

      case AppView.DISCLAIMER:
        return (
          <div className="p-6 space-y-6 h-full overflow-y-auto">
            <button onClick={() => setCurrentView(AppView.PROFILE)} className="p-2 bg-white/5 rounded-full mb-4">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black italic uppercase text-red-500">Secure & Responsible Trading</h2>
            <div className="text-sm text-gray-400 space-y-6">
              <div className="p-4 bg-red-600/10 border border-red-600/20 rounded-2xl">
                <p className="text-red-500 font-bold uppercase text-xs mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  HIGH-RISK INVESTMENT WARNING
                </p>
                <p className="text-xs leading-relaxed">
                  Trading in financial markets, especially derivatives and contracts for difference (CFDs), carries an extremely high level of risk. Most retail investor accounts lose money when trading these products.
                </p>
              </div>
              
              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs">1. The Dangers of Leverage</h3>
                <p>Leverage can work both for and against you. While it can amplify potential returns, it also exponentially increases the risk of rapid capital loss. Even small market movements can result in the loss of your total investment or more if not managed correctly.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs">2. Capital Protection Guidelines</h3>
                <p>We strongly advocate for responsible trading. Never trade with money that you cannot afford to lose, such as funds intended for rent, food, or essential living expenses. Always use risk management tools like stop-loss orders where available.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs">3. Market Volatility</h3>
                <p>Markets can be highly volatile. Prices can fluctuate wildly within seconds. Ensure you fully understand the mechanics of the contracts you are executing before committing real funds.</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-white font-bold uppercase text-xs">4. Continuous Education</h3>
                <p>Successful trading requires ongoing education and disciplined emotional control. Utilize demo accounts to practice your strategies before transitioning to real-money trading.</p>
              </section>
            </div>
            <Footer />
          </div>
        );

      case AppView.CONTACT:
        return (
          <div className="p-6 space-y-6 h-full overflow-y-auto">
            <button onClick={() => setCurrentView(AppView.PROFILE)} className="p-2 bg-white/5 rounded-full mb-4">
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-2xl font-black italic uppercase">Contact Us</h2>
              <p className="text-xs font-bold text-gray-500 uppercase mt-2">We're here to help you</p>
            </div>

            <div className="space-y-4">
              <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] text-center">
                <h3 className="text-sm font-black uppercase mb-2">Telegram Support</h3>
                <p className="text-xs text-gray-400 mb-6">Get instant help from our support team via Telegram.</p>
                <button 
                  onClick={() => window.open('https://t.me/bynextradersupportbot', '_blank')}
                  className="w-full py-4 bg-red-600 rounded-2xl font-black text-sm uppercase shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors flex items-center justify-center gap-2"
                >
                  <Smartphone className="w-5 h-5" />
                  Open Telegram Bot
                </button>
              </div>

              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                  <Globe className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase">Telegram Support</p>
                  <p className="text-sm font-black text-white">@bynextradersupportbot</p>
                </div>
              </div>
            </div>
            <Footer />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0b0e14] text-white overflow-hidden font-sans">
      <header className="min-h-[3.5rem] pt-[env(safe-area-inset-top)] bg-[#141922] border-b border-white/10 px-4 flex items-center justify-between z-50 flex-shrink-0">
        <div className="flex flex-col">
          <h1 className="text-base font-black italic tracking-tighter text-red-500 leading-none">BYNEX TRADER</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-green-500 animate-pulse' : 
              isReconnecting ? 'bg-yellow-500 animate-bounce' : 
              'bg-red-500'
            }`} />
            <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
              {isConnected ? 'Master Terminal' : isReconnecting ? 'Reconnecting...' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!account && (
            <button 
              onClick={() => setShowLoginModal(true)}
              className="hidden sm:block px-4 py-2 bg-red-600 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-600/20 hover:bg-red-500 transition-all"
            >
              Login
            </button>
          )}
          <div onClick={() => setShowAccountMenu(true)} className="flex flex-col items-end cursor-pointer group bg-white/5 px-2 py-1 rounded-lg border border-white/5 hover:border-red-500/30 transition-all">
            <span className="text-xs font-mono font-black tabular-nums group-hover:text-red-500 transition-colors">
              {account ? `${Number(account.balance).toFixed(getCurrencyConfig(account.currency).decimals)} ${account.currency}` : '0.00 USD'}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">
                {account ? (account.is_virtual ? 'Demo Mode' : 'Real Account') : 'Guest Mode'}
              </span>
              <ChevronDown className="w-2 h-2 text-gray-500" />
            </div>
          </div>
          <button onClick={() => setShowAccountMenu(true)} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-red-500/50 transition-all shadow-inner">
            <User className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </header>

      <main className={`flex-1 relative ${currentView === AppView.TRADE ? 'overflow-hidden flex flex-col' : 'overflow-y-auto pb-28'}`}>
        {renderContent()}
        {currentView !== AppView.TRADE && (
          <div className="py-6 pb-12 text-center opacity-60">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Powered by Deriv</p>
            <p className="text-[8px] font-bold uppercase tracking-widest mt-1 text-white/40">Secure Trading • 18+ • Responsible Trading</p>
          </div>
        )}
      </main>

      <Navigation currentView={currentView} onViewChange={setCurrentView} />

      <AnimatePresence>
        {customAlert && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#141922] border border-white/10 p-6 rounded-3xl max-w-sm w-full text-center space-y-4 shadow-2xl"
            >
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <ShieldAlert className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-black uppercase">Bynex Trader</h3>
              <p className="text-sm font-bold text-gray-400">{customAlert}</p>
              <button 
                onClick={() => setCustomAlert(null)}
                className="w-full py-3 bg-red-600 rounded-xl font-black text-xs uppercase shadow-lg shadow-red-600/20"
              >
                OK
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMarketSelector && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMarketSelector(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150]"
            />
            <MarketSelector 
              key="market-selector"
              markets={markets} 
              selectedSymbol={selectedSymbol} 
              onSelect={setSelectedSymbol} 
              onClose={() => setShowMarketSelector(false)} 
            />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDemoWarning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4"
            onClick={() => setShowDemoWarning(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-[#141922] rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-orange-500" />
              
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-2">
                  <TrendingUp className="w-8 h-8 text-red-500" />
                </div>
                
                <h3 className="text-2xl font-black italic uppercase tracking-tight">
                  Ready for Real Trading?
                </h3>
                
                <p className="text-gray-400 text-sm leading-relaxed">
                  You've been practicing on your demo account. Switch to a real account to start earning actual profits!
                </p>
                
                <div className="w-full space-y-3 mt-6">
                  <button 
                    onClick={() => {
                      setShowDemoWarning(false);
                      setShowAccountMenu(true);
                    }}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
                  >
                    Switch to Real Account
                  </button>
                  <button 
                    onClick={() => setShowDemoWarning(false)}
                    className="w-full py-4 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
                  >
                    Continue Practice
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showAccountMenu && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-end sm:items-center sm:justify-center" onClick={() => setShowAccountMenu(false)}>
          <div className="w-full sm:w-96 bg-[#141922] rounded-t-[2.5rem] sm:rounded-3xl p-6 flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 border border-white/10 max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto sm:hidden mb-6 flex-shrink-0" />
            
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h3 className="text-xl font-black italic uppercase">Account Settings</h3>
              <button onClick={() => setShowAccountMenu(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2 pb-4">
              {account && (
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                  <p className="text-[10px] font-black text-gray-500 uppercase">Accounts</p>
                  {(() => {
                    const accounts = JSON.parse(localStorage.getItem('deriv_accounts') || '[]');
                    const sortedAccounts = [...accounts].sort((a, b) => {
                      const aIsReal = !a.id.startsWith('VR');
                      const bIsReal = !b.id.startsWith('VR');
                      const aIsUSD = a.currency === 'USD';
                      const bIsUSD = b.currency === 'USD';
                      
                      // Real USD first
                      if (aIsReal && aIsUSD && !(bIsReal && bIsUSD)) return -1;
                      if (!(aIsReal && aIsUSD) && bIsReal && bIsUSD) return 1;
                      
                      // Demo next
                      const aIsDemo = a.id.startsWith('VR');
                      const bIsDemo = b.id.startsWith('VR');
                      if (aIsDemo && !bIsDemo) return -1;
                      if (!aIsDemo && bIsDemo) return 1;
                      
                      return 0;
                    });
                    const displayedAccounts = sortedAccounts; // Show all accounts

                    const isVerified = accountStatus?.authentication?.identity?.status === 'verified' && 
                                       accountStatus?.authentication?.document?.status === 'verified';

                    return (
                      <>
                        {displayedAccounts.map((acc: any) => {
                          const liveAcc = availableAccounts.find(a => a.loginid === acc.id);
                          return (
                            <div key={acc.id} className="space-y-2">
                              <button 
                                onClick={() => switchAccount(acc.id)}
                                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${account?.loginid === acc.id ? 'bg-red-600/20 border-red-600' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${acc.id.startsWith('VR') ? 'bg-yellow-500/10 text-yellow-500' : 'bg-green-500/10 text-green-500'}`}>
                                    {acc.id.startsWith('VR') ? <Clock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                                  </div>
                                  <div className="text-left">
                                    <p className="text-sm font-black text-white">{acc.id}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{acc.id.startsWith('VR') ? 'Demo Account' : 'Real Account'}</p>
                                  </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-black text-white">{liveAcc?.balance !== undefined ? liveAcc.balance : 'Loading...'} {acc.currency}</p>
                                  </div>
                                  {account?.loginid === acc.id && <p className="text-[8px] font-black text-red-500 uppercase">Active</p>}
                                </div>
                              </button>
                              {acc.id.startsWith('VR') && (
                                  <button 
                                      onClick={() => resetBalance()}
                                      className="w-full p-2 rounded-xl border border-yellow-500/50 bg-yellow-500/10 flex items-center justify-center hover:bg-yellow-500/20 transition-colors"
                                  >
                                      <p className="text-xs font-bold text-yellow-500 uppercase">Reset Balance</p>
                                  </button>
                              )}
                            </div>
                          );
                        })}
                        {sortedAccounts.length > 2 && (
                          <button 
                            onClick={() => setShowAllAccounts(!showAllAccounts)}
                            className="w-full p-3 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-gray-400 uppercase hover:bg-white/10 hover:text-white transition-colors mt-2"
                          >
                            {showAllAccounts ? 'Show Less' : 'Show More Assets'}
                          </button>
                        )}
                        <button 
                            onClick={() => window.open('https://app.deriv.com/account/add-deriv-account', '_blank')}
                            className="w-full p-3 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-gray-400 uppercase hover:bg-white/10 hover:text-white transition-colors mt-2"
                        >
                            Add Other Assets
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                <p className="text-sm font-black text-white">Theme</p>
                <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                    {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-500" />}
                </button>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                <p className="text-[10px] font-black text-gray-500 uppercase">Legal</p>
                <button onClick={() => { setCurrentView(AppView.PRIVACY); setShowAccountMenu(false); }} className="w-full text-left text-sm font-bold text-gray-300 hover:text-white transition-colors">Privacy Policy</button>
                <button onClick={() => { setCurrentView(AppView.TERMS); setShowAccountMenu(false); }} className="w-full text-left text-sm font-bold text-gray-300 hover:text-white transition-colors">Terms & Conditions</button>
                <div className="pt-6 text-center opacity-20">
                  <p className="text-[8px] font-black uppercase tracking-[0.2em]">Powered by Deriv</p>
                  <p className="text-[7px] font-bold uppercase tracking-widest mt-1">Secure Trading • 18+</p>
                </div>
              </div>

              {!account && (
                <div className="space-y-3">
                  <button onClick={signup} className="w-full py-4 bg-red-600 rounded-2xl font-black text-sm uppercase shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors">Register</button>
                  <button onClick={login} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-sm uppercase hover:bg-white/10 transition-colors">Login</button>
                </div>
              )}

              {account && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => { setCurrentView(AppView.CASHIER); setShowAccountMenu(false); }} className="py-4 bg-green-600 rounded-2xl font-black text-xs uppercase hover:bg-green-500 transition-colors">Cashier</button>
                    <button onClick={logout} className="py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-xs uppercase text-red-500 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6" onClick={() => setShowLoginModal(false)}>
          <div className="bg-[#141922] rounded-3xl p-8 space-y-4 animate-in zoom-in-95 w-full max-w-sm border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-black italic uppercase">Welcome</h3>
              <p className="text-xs font-bold text-gray-500 uppercase mt-2">Login or create an account to start trading.</p>
            </div>
            
            <div className="space-y-3 pt-4">
              <button onClick={login} className="w-full py-4 bg-red-600 rounded-2xl font-black text-sm uppercase shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors">
                Login
              </button>
              <button onClick={signup} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-sm uppercase hover:bg-white/10 transition-colors">
                Register
              </button>
            </div>
            
            <button onClick={() => setShowLoginModal(false)} className="w-full text-[10px] font-black text-gray-500 uppercase hover:text-white transition-colors py-2">
              Cancel
            </button>
          </div>
        </div>
      )}
      {showGuideModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={() => setShowGuideModal(false)}>
          <div className="bg-[#141922] rounded-3xl p-6 w-full max-w-md border border-white/10 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black italic uppercase">How to Guide</h3>
              <button onClick={() => setShowGuideModal(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6 text-sm text-gray-300">
              <section>
                <h4 className="text-white font-bold uppercase mb-2">1. Getting Started</h4>
                <p>Welcome to Bynex Trader! To start trading, you need to log in with your Deriv account. If you don't have one, you can create a free account using the "Register" button in the profile menu.</p>
              </section>

              <section>
                <h4 className="text-white font-bold uppercase mb-2">2. Selecting a Market</h4>
                <p>Click on the market selector at the top left of the chart (e.g., "Volatility 100 Index"). This opens the asset list where you can choose from Synthetic Indices, Forex, Cryptocurrencies, and more.</p>
              </section>

              <section>
                <h4 className="text-white font-bold uppercase mb-2">3. Using the Chart</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Timeframe:</strong> Change the candle duration (1m, 5m, 1h, etc.) using the clock icon on the left.</li>
                  <li><strong>Indicators:</strong> Add technical indicators like RSI, MACD, or Moving Averages using the chart icon.</li>
                  <li><strong>Drawing Tools:</strong> Use the pencil icon to draw trendlines, horizontal lines, and other shapes.</li>
                </ul>
              </section>

              <section>
                <h4 className="text-white font-bold uppercase mb-2">4. Placing a Trade</h4>
                <p>At the bottom of the screen, you'll find the trading panel. Set your <strong>Stake</strong> (amount to risk) and <strong>Duration</strong> (how long the trade lasts). Then, choose your prediction:</p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>Rise:</strong> You predict the price will be strictly higher than the entry price at expiry.</li>
                  <li><strong>Fall:</strong> You predict the price will be strictly lower than the entry price at expiry.</li>
                </ul>
              </section>
              
              <section>
                <h4 className="text-white font-bold uppercase mb-2">5. KYC & Verification</h4>
                <p>To trade with real money and withdraw your earnings, you must complete KYC (Proof of Identity and Proof of Address) on the official Deriv platform. You can check your status in the Profile tab.</p>
              </section>
            </div>
            
            <button onClick={() => setShowGuideModal(false)} className="w-full mt-6 py-4 bg-red-600 rounded-2xl font-black text-sm uppercase shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// X removed
/*
const X: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
*/

export default App;