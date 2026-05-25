import { useState, useEffect, useRef, useCallback } from 'react';
import { DERIV_WS_URL } from '../constants';
import { DerivAccount, Market, Proposal, TradeHistory, TradeType, Timeframe } from '../types';
import { db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from '../src/lib/pkce';
import {
  OAUTH_CLIENT_ID,
  getRedirectUri,
  getOtpUrl,
  getAccountsInfo,
  generateAuthUrl,
  resetDemoBalanceRest,
} from '../src/services/derivApiService';
import { getInMemoryToken, clearInMemoryToken } from '../src/services/authService';

// ============================================================================
// Utility / Helpers
// ============================================================================
const getReconnectDelay = (attempt: number) => {
  const minDelay = 1000;
  const maxDelay = 30000;
  const delay = Math.min(maxDelay, minDelay * Math.pow(2, attempt));
  const jitter = Math.random() * 1000;
  return delay + jitter;
};

// ============================================================================
// Main Hook
// ============================================================================
export const useDeriv = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [account, setAccount] = useState<DerivAccount | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [lastTick, setLastTick] = useState<any>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [history, setHistory] = useState<TradeHistory[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [openPositions, setOpenPositions] = useState<Record<number, any>>({});
  const [proposalTrigger, setProposalTrigger] = useState(0);
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [sellErrors, setSellErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const onTradeExecutedRef = useRef<((trade: any) => void) | null>(null);
  const onTradeClosedRef = useRef<((trade: any) => void) | null>(null);

  const setOnTradeExecuted = useCallback((cb: ((trade: any) => void) | null) => {
    onTradeExecutedRef.current = cb;
  }, []);

  const setOnTradeClosed = useCallback((cb: ((trade: any) => void) | null) => {
    onTradeClosedRef.current = cb;
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const publicWs = useRef<WebSocket | null>(null);
  const authWs = useRef<WebSocket | null>(null);
  const proposalIds = useRef<Record<string, string>>({});
  const lastProposalParams = useRef<Record<string, any>>({});
  const pendingProposals = useRef<Set<string>>(new Set());
  const pendingForget = useRef<Set<string>>(new Set());
  const publicReconnectTimeout = useRef<any>(null);
  const authReconnectTimeout = useRef<any>(null);
  const pingIntervalPublic = useRef<any>(null);
  const pingIntervalAuth = useRef<any>(null);
  const connectAuthRef = useRef<any>(null);
  const proposalWs = useRef<Record<string, WebSocket | null>>({});

  const clearProposals = useCallback(() => {
    // Phase 11: Cleanup
    // Use forget_all to safely close all proposal streams on both connections
    if (authWs.current?.readyState === WebSocket.OPEN) {
      authWs.current.send(JSON.stringify({ forget_all: 'proposal' }));
    }
    if (publicWs.current?.readyState === WebSocket.OPEN) {
      publicWs.current.send(JSON.stringify({ forget_all: 'proposal' }));
    }

    setProposals({});
    proposalIds.current = {};
    proposalWs.current = {};
    lastProposalParams.current = {};
    pendingProposals.current.clear();
    pendingForget.current.clear();
    setProposalTrigger(prev => prev + 1);
  }, []);

// ============================================================================
// PUBLIC WEBSOCKET CONNECTION
// Handles real-time market data (ticks, symbols, proposals)
// ============================================================================
  const connectPublic = useCallback((attempt = 0) => {
    if (publicWs.current?.readyState === WebSocket.OPEN || publicWs.current?.readyState === WebSocket.CONNECTING) return;

    // Commission Tracking: The app_id is not required in the URL for the new public endpoint
    const socket = new WebSocket(DERIV_WS_URL);
    publicWs.current = socket;

    socket.onopen = () => {
      if (import.meta.env.DEV) {
        console.log('Deriv Public WebSocket Connected');
      }
      setIsConnected(true);
      setIsReconnecting(false);
      
      // Keep connection alive: 30s as per docs
      if (pingIntervalPublic.current) clearInterval(pingIntervalPublic.current);
      pingIntervalPublic.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ ping: 1 }));
        }
      }, 30000);

      // Fetch markets immediately with a req_id
      socket.send(JSON.stringify({ active_symbols: 'brief', req_id: 1 }));

      // Restore active proposals hosted on this specific WebSocket
      Object.entries(lastProposalParams.current).forEach(([type, params]) => {
        if (!authWs.current || authWs.current.readyState !== WebSocket.OPEN) {
          pendingProposals.current.add(type);
          socket.send(JSON.stringify({
            proposal: 1,
            subscribe: 1,
            basis: 'stake',
            currency: 'USD',
            ...params,
            req_id: type === 'CALL' || type === 'HIGHER' || type === 'TOUCH' || type === 'ONETOUCH' ? 100 : 200
          }));
        }
      });
    };

    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.error) {
        console.error('[DEBUG PUBLIC] Error:', data.error);
        if (data.msg_type === 'proposal') {
          const pType = data.echo_req?.contract_type;
          if (pType) pendingProposals.current.delete(pType);
          setError(data.error.message || 'Error fetching proposal');
        }
        return;
      }
      
      if (data.msg_type === 'active_symbols') {
        setMarkets(data.active_symbols.map((m: any) => ({
          underlying_symbol: m.symbol || m.underlying_symbol,
          underlying_symbol_name: m.display_name || m.underlying_symbol_name,
          market: m.market,
          market_display_name: m.market === 'synthetic_index' ? 'Synthetic Indices' : m.market_display_name,
          submarket: m.submarket,
          submarket_display_name: m.submarket_display_name
        })));
      } else if (data.msg_type === 'tick') {
        setLastTick((prev: any) => {
          const newTick = {
            underlying_symbol: data.tick.underlying_symbol || data.tick.symbol,
            quote: data.tick.quote,
            epoch: data.tick.epoch,
            change: 0
          };
          if (prev && prev.underlying_symbol === newTick.underlying_symbol) {
            newTick.change = newTick.quote - prev.quote;
          }
          return newTick;
        });
      } else if (data.msg_type === 'proposal') {
        if (import.meta.env.DEV) {
          console.log('[DEBUG PUBLIC] Proposal Received:', data);
        }
        const pType = data.echo_req?.contract_type;
        if (!pType) return;
        pendingProposals.current.delete(pType);
        const p = data.proposal;
        proposalIds.current[pType] = p.id;
        setProposals(prev => ({
          ...prev,
          [pType]: {
            ask_price: p.ask_price,
            payout: p.payout,
            display_value: p.display_value,
            id: p.id,
            spot: p.spot,
            barrier: p.barrier
          }
        }));
      } else if (data.msg_type === 'forget') {
        if (data.forget && typeof data.forget === 'string') {
          pendingForget.current.delete(data.forget);
        }
      }
    };

    socket.onerror = (error) => {
      console.error('Deriv Public WebSocket Error:', error);
    };

    socket.onclose = (event) => {
      if (import.meta.env.DEV) {
        console.log(`Deriv Public WebSocket Closed (Code: ${event.code}, Reason: ${event.reason || 'None'}). Reconnecting...`);
      }
      if (pingIntervalPublic.current) clearInterval(pingIntervalPublic.current);
      setError('Connection dropped. Reconnecting to Deriv...');
      
      const delay = getReconnectDelay(attempt);
      publicReconnectTimeout.current = setTimeout(() => connectPublic(attempt + 1), delay);
    };
  }, []);

// ============================================================================
// AUTHENTICATED WEBSOCKET CONNECTION (PKCE + OTP)
// Connects using a one-time password obtained from REST API
// ============================================================================
  const connectAuth = useCallback(async (token: string, accountId: string, attempt: number = 0) => {
    connectAuthRef.current = connectAuth;
    if (authWs.current?.readyState === WebSocket.OPEN || authWs.current?.readyState === WebSocket.CONNECTING) return;

    try {
      if (import.meta.env.DEV) {
        console.log(`[DERIV] Obtaining OTP for account: ${accountId}`);
      }
      const authUrl = await getOtpUrl(accountId, token);
      if (import.meta.env.DEV) {
        console.log(`[DERIV] Connecting to authenticated WebSocket: ${authUrl.split('?')[0]}...`);
      }
      
      const socket = new WebSocket(authUrl);
      authWs.current = socket;

      socket.onopen = () => {
        if (import.meta.env.DEV) {
          console.log('Deriv Authenticated WebSocket Connected via OTP');
        }
        setError(null);
        setIsConnected(true);
        setIsReconnecting(false);
        
        // Keep connection alive: 30s as per docs
        if (pingIntervalAuth.current) clearInterval(pingIntervalAuth.current);
        pingIntervalAuth.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000);

        // Initial setup for authenticated connection as per new docs flow
        socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        socket.send(JSON.stringify({ transaction: 1, subscribe: 1 }));
        socket.send(JSON.stringify({ profit_table: 1, limit: 50, description: 1 }));
        socket.send(JSON.stringify({ statement: 1, limit: 50, description: 1 }));
        socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));

        // Restore active proposals hosted on this specific WebSocket
        Object.entries(lastProposalParams.current).forEach(([type, params]) => {
          pendingProposals.current.add(type);
          socket.send(JSON.stringify({
            proposal: 1,
            subscribe: 1,
            basis: 'stake',
            currency: 'USD',
            ...params,
            req_id: type === 'CALL' || type === 'HIGHER' || type === 'TOUCH' || type === 'ONETOUCH' ? 100 : 200
          }));
        });
      };

      socket.onerror = (error) => {
        console.error('Deriv Auth WebSocket Error:', error);
      };

      socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (import.meta.env.DEV) {
          console.log('[DEBUG AUTH] Received:', data.msg_type, data);
        }
        
        if (data.error) {
          setError(data.error.message);
          if (data.msg_type === 'buy') setIsTrading(false);
          if (data.msg_type === 'proposal') {
            const pType = data.echo_req?.contract_type;
            if (pType) pendingProposals.current.delete(pType);
          }
          return;
        }

        switch (data.msg_type) {
          case 'balance':
            if (data.balance.accounts) {
              const accountsMap = data.balance.accounts;
              setAccount(prev => prev && accountsMap[prev.loginid] ? { ...prev, balance: accountsMap[prev.loginid].balance } : prev);
              setAvailableAccounts(prev => prev.map(acc => 
                accountsMap[acc.loginid] ? { ...acc, balance: accountsMap[acc.loginid].balance } : acc
              ));
            } else {
              setAccount(prev => prev ? ({ ...prev, balance: data.balance.balance, currency: data.balance.currency }) : null);
              setAvailableAccounts(prev => prev.map(acc => acc.loginid === data.balance.loginid ? { ...acc, balance: data.balance.balance } : acc));
            }
            break;
          case 'transaction':
            // Check for real money deposit
            if (data.transaction && data.transaction.action === 'deposit') {
              setSuccess('Deposit Successful! Balance updated.');
            }
            // Live update for trade history
            authWs.current?.send(JSON.stringify({ profit_table: 1, limit: 50, description: 1 }));
            authWs.current?.send(JSON.stringify({ balance: 1 }));
            break;
          case 'get_account_status':
            setAccountStatus(data.get_account_status);
            break;
          case 'buy':
            setIsTrading(false);
            if (onTradeExecutedRef.current) {
              const isManual = data.echo_req?.passthrough?.manual;
              onTradeExecutedRef.current({ ...data.buy, isManual });
            }
            break;
          case 'proposal_open_contract':
            const contract = data.proposal_open_contract;
            if (!contract || !contract.contract_id) break;

            if (contract.is_sold) {
              if (onTradeClosedRef.current) onTradeClosedRef.current(contract);
              
              // Update history immediately with local data for faster feedback
              setHistory(prev => {
                const contractId = Number(contract.contract_id);
                // If it's already in history, don't duplicate
                if (prev.some(h => Number(h.contract_id) === contractId)) return prev;
                
                const profitLoss = parseFloat(contract.profit || contract.profit_loss || '0');
                const sellPrice = parseFloat(contract.sell_price || '0');
                const buyPrice = parseFloat(contract.buy_price || '0');
                
                // User wants Gross Payout (+Total) for wins, Net Loss (-Stake) for losses
                const displayProfit = profitLoss > 0 ? sellPrice : (profitLoss < 0 ? profitLoss : (sellPrice > 0 ? sellPrice : -buyPrice));
                
                const newHistoryItem: TradeHistory = {
                  contract_id: contractId,
                  underlying_symbol: contract.underlying,
                  buy_price: buyPrice,
                  sell_price: sellPrice,
                  status: (profitLoss > 0 ? 'won' : (profitLoss < 0 ? 'lost' : 'draw')) as 'won' | 'lost' | 'draw',
                  type: contract.contract_type,
                  entry_time: contract.date_start,
                  exit_time: contract.date_expiry || contract.sell_time,
                  profit: displayProfit,
                  shortcode: contract.shortcode
                };
                
                return [newHistoryItem, ...prev].slice(0, 50);
              });

              setOpenPositions(prev => {
                const next = { ...prev };
                delete next[contract.contract_id];
                return next;
              });
              // Refresh history and balance when a trade closes
              if (authWs.current?.readyState === WebSocket.OPEN) {
                authWs.current.send(JSON.stringify({ balance: 1 }));
                authWs.current.send(JSON.stringify({ profit_table: 1, limit: 50, description: 1 }));
              }
            } else {
              setOpenPositions(prev => ({ ...prev, [contract.contract_id]: contract }));
            }
            break;
          case 'profit_table':
            setIsHistoryLoading(false);
            if (data.profit_table?.transactions) {
              const profitData = data.profit_table.transactions.map((t: Record<string, unknown>) => {
                const profitLoss = parseFloat(String(t.profit_loss || '0'));
                const sellPrice = parseFloat(String(t.sell_price || '0'));
                const buyPrice = parseFloat(String(t.buy_price || '0'));
                
                // User wants Gross Payout (+Total) for wins, Net Loss (-Stake) for losses
                const displayProfit = profitLoss > 0 ? sellPrice : (profitLoss < 0 ? profitLoss : (sellPrice > 0 ? sellPrice : -buyPrice));

                return {
                  contract_id: Number(t.contract_id),
                  underlying_symbol: t.display_name,
                  buy_price: buyPrice,
                  sell_price: sellPrice,
                  status: profitLoss > 0 ? 'won' : (profitLoss < 0 ? 'lost' : 'draw'),
                  type: t.contract_type,
                  entry_time: t.purchase_time,
                  exit_time: t.sell_time,
                  profit: displayProfit,
                  shortcode: t.shortcode
                };
              });
              setHistory(profitData);
            }
            break;
          case 'statement':
            if (!data.statement?.transactions) break;
            
            // Only update history from statement if we don't have better data
            // Filter to only include completed trade transactions (sell/payout) or adjustments
            const statementData = data.statement.transactions
              .filter((t: Record<string, unknown>) => t.contract_id && t.action_type === 'sell') // Only include sell (payout) entries
              .map((t: Record<string, unknown>) => {
                const amount = parseFloat(String(t.amount || '0'));
                return {
                  contract_id: Number(t.contract_id),
                  underlying_symbol: t.display_name,
                  buy_price: 0, // Statement doesn't easily link buy/sell in one row
                  sell_price: amount,
                  status: amount > 0 ? 'won' : 'sold',
                  type: t.action_type,
                  entry_time: t.transaction_time,
                  profit: amount,
                  shortcode: t.shortcode
                };
              });
            
            setHistory(prev => {
              // Prefer profit_table data if it's already populated with real trades
              if (prev.length > 0 && prev.some(item => item.sell_price !== undefined && item.sell_price > 0)) {
                return prev;
              }
              // Only overwrite if current history is empty or looks like placeholder
              if (prev.length === 0) return statementData;
              return prev;
            });
            break;
          case 'topup_virtual':
            setError(null);
            setSuccess("Demo balance successfully reset!");
            setTimeout(() => setSuccess(null), 3000);
            authWs.current?.send(JSON.stringify({ balance: 1 }));
            break;
          case 'cashier':
            if (data.cashier) window.open(data.cashier, '_blank');
            break;
          case 'proposal':
            if (import.meta.env.DEV) {
              console.log('[DEBUG AUTH] Proposal Received:', data);
            }
            const pType = data.echo_req?.contract_type;
            if (!pType) break;
            pendingProposals.current.delete(pType);
            const p = data.proposal;
            proposalIds.current[pType] = p.id;
            setProposals(prev => ({
              ...prev,
              [pType]: {
                ask_price: p.ask_price,
                payout: p.payout,
                display_value: p.display_value,
                id: p.id,
                spot: p.spot,
                barrier: p.barrier
              }
            }));
            break;
        }
      };

      socket.onclose = (event) => {
        if (import.meta.env.DEV) {
          console.log(`Deriv Auth WebSocket Closed (Code: ${event.code}, Reason: ${event.reason || 'None'}).`);
        }
        if (pingIntervalAuth.current) clearInterval(pingIntervalAuth.current);
        setIsReconnecting(true);
        setError('Secure connection lost. Reconnecting...');
        
        const memToken = getInMemoryToken();
        const token = memToken.accessToken;
        const expiresAt = memToken.expiresAt;
        const activeAcc = localStorage.getItem('deriv_active_account');
        
        if (token && activeAcc) {
          if (expiresAt && Date.now() > expiresAt) {
            import('../src/services/authService').then(mod => mod.performLogout());
            setAccount(null);
            setAvailableAccounts([]);
            return;
          }
          const delay = getReconnectDelay(attempt);
          authReconnectTimeout.current = setTimeout(() => connectAuthRef.current(token, activeAcc, attempt + 1), delay);
        }
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Authentication Connection Failed: ' + errorMessage);
      
      const delay = getReconnectDelay(attempt);
      authReconnectTimeout.current = setTimeout(() => connectAuthRef.current(token, accountId, attempt + 1), delay);
    }
  }, [getReconnectDelay]);

  const initAuth = useCallback(async () => {
    let memToken = getInMemoryToken();
    
    // Attempt session recovery if no token in memory
    if (!memToken.accessToken) {
      const { recoverSession } = await import('../src/services/authService');
      const recovered = await recoverSession();
      if (recovered) {
        memToken = getInMemoryToken();
      }
    }

    const accessToken = memToken.accessToken;
    const expiresAt = memToken.expiresAt;
    
    // Check token expiry before using it
    if (expiresAt && Date.now() > expiresAt) {
      const { performLogout } = await import('../src/services/authService');
      await performLogout();
      setAccount(null);
      setAvailableAccounts([]);
      return;
    }
    
    if (accessToken) {
      try {
        const accountsList = await getAccountsInfo(accessToken);
        setAvailableAccounts(accountsList);
        
        let activeAccountId = localStorage.getItem('deriv_active_account');
        let activeAccount = accountsList.find((a) => a.loginid === activeAccountId);
        
        if (!activeAccount && accountsList.length > 0) {
          activeAccount = accountsList[0];
          activeAccountId = String(activeAccount.loginid);
          localStorage.setItem('deriv_active_account', activeAccountId!);
        }

        if (activeAccount) {
          setAccount({
            loginid: String(activeAccount.loginid),
            balance: Number(activeAccount.balance),
            currency: String(activeAccount.currency),
            email: String(activeAccount.email),
            is_virtual: Boolean(activeAccount.is_virtual),
          });
          connectAuth(accessToken, activeAccountId!);
        }
      } catch (err: unknown) {
        const { performLogout } = await import('../src/services/authService');
        await performLogout();
        setAccount(null);
        setAvailableAccounts([]);
        setError('Session expired or invalid. Please login again.');
      }
    }
  }, [connectAuth]);

  useEffect(() => {
    connectPublic();
    initAuth();
    
    return () => {
      if (pingIntervalPublic.current) clearInterval(pingIntervalPublic.current);
      if (pingIntervalAuth.current) clearInterval(pingIntervalAuth.current);
      if (publicReconnectTimeout.current) clearTimeout(publicReconnectTimeout.current);
      if (authReconnectTimeout.current) clearTimeout(authReconnectTimeout.current);
      
      // Close only if in a safe state to avoid "closed before established" warning
      // but still null out handlers to prevent memory leaks/state updates
      if (publicWs.current) {
        publicWs.current.onopen = null;
        publicWs.current.onmessage = null;
        publicWs.current.onerror = null;
        publicWs.current.onclose = null;
        if (publicWs.current.readyState === WebSocket.OPEN || publicWs.current.readyState === WebSocket.CONNECTING) {
          publicWs.current.close();
        }
        publicWs.current = null;
      }
      
      if (authWs.current) {
        authWs.current.onopen = null;
        authWs.current.onmessage = null;
        authWs.current.onerror = null;
        authWs.current.onclose = null;
        if (authWs.current.readyState === WebSocket.OPEN || authWs.current.readyState === WebSocket.CONNECTING) {
          authWs.current.close();
        }
        authWs.current = null;
      }
    };
  }, [connectPublic, initAuth]);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      console.log('[DEBUG] Sending payload:', payload);
    }
    
    // Route to appropriate WebSocket
    // General market data (ticks, active_symbols) always goes to publicWs
    // Authenticated data (buy, sell, balance, history) AND personalized proposals go to authWs if available
    const requestType = String(payload.msg_type || Object.keys(payload)[0]);
    const isAlwaysPublic = ['ticks', 'active_symbols'].includes(requestType);
    const isForget = ['forget', 'forget_all'].includes(requestType);

    const authRequiredTypes = ['buy', 'portfolio', 'balance', 'sell', 'proposal'];
    if (authRequiredTypes.includes(requestType)) {
      const isAuthorized = authWs.current?.readyState === WebSocket.OPEN;
      if (!isAuthorized && getInMemoryToken().accessToken) {
        // Only throw if the user is supposed to be logged in but WS isn't ready
        throw new Error('WebSocket not authorized');
      }
    }

    let targetWs: WebSocket | null;
    if (isAlwaysPublic) {
      targetWs = publicWs.current;
    } else if (isForget) {
      // Send forget to whichever WS is open — auth first (proposals go there when logged in), fallback to public
      targetWs = authWs.current?.readyState === WebSocket.OPEN
        ? authWs.current
        : publicWs.current;
    } else {
      // Authenticated requests (buy, sell, proposal, balance etc.)
      targetWs = authWs.current?.readyState === WebSocket.OPEN
        ? authWs.current
        : publicWs.current;
    }

    if (targetWs?.readyState === WebSocket.OPEN) {
      if (payload.buy) {
        setIsTrading(true);
        // Clear this specific proposal from state immediately to prevent re-use
        // until a new one arrives from the WebSocket.
        const type = (payload.passthrough as Record<string, unknown>)?.type as string;
        if (type) {
          setProposals(prev => {
            const next = { ...prev };
            delete next[type];
            return next;
          });
          delete proposalIds.current[type];
          // Increment trigger to force TradeForm to re-subscribe immediately
          setProposalTrigger(prev => prev + 1);
        }
      }
      targetWs.send(JSON.stringify(payload));
    }
  }, []);

  const tickSubscriptionId = useRef<string | null>(null);

  const subscribeTicks = useCallback((symbol: string) => {
    if (!symbol) return;
    if (tickSubscriptionId.current) {
      publicWs.current?.send(JSON.stringify({ forget: tickSubscriptionId.current }));
      tickSubscriptionId.current = null;
    }
    publicWs.current?.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
  }, []);

  const unsubscribeTicks = useCallback(() => {
    publicWs.current?.send(JSON.stringify({ forget_all: 'ticks' }));
    tickSubscriptionId.current = null;
  }, []);

  const login = useCallback(async () => {
    try {
      const { initiateOAuthFlow } = await import('../src/services/authService');
      await initiateOAuthFlow('login');
    } catch (err: any) {
      setError('Could not initialize login. Please check your browser security settings.');
    }
  }, []);

  const signup = useCallback(async () => {
    try {
      const { initiateOAuthFlow } = await import('../src/services/authService');
      await initiateOAuthFlow('signup');
    } catch (err: any) {
      setError('Could not initialize signup. Please check your browser security settings.');
    }
  }, []);

  const logout = useCallback(() => {
    clearInMemoryToken();
    localStorage.removeItem('deriv_active_account');
    setAccount(null);
    window.location.reload();
  }, []);

  const switchAccount = useCallback(async (loginid: string) => {
    const token = getInMemoryToken().accessToken;
    if (token) {
        localStorage.setItem('deriv_active_account', loginid);
        if (authWs.current) authWs.current.close();
        connectAuth(token, loginid);
    } else {
        login();
    }
  }, [connectAuth, login]);

  const subscribeProposal = useCallback((params: {
    underlying_symbol?: string;
    symbol?: string;
    contract_type: TradeType;
    amount: number;
    duration: number;
    duration_unit: string;
    barrier?: string;
    req_id?: number;
  }, force: boolean = false) => {
    const symbol = params.symbol || params.underlying_symbol;
    if (!symbol) return;
    
    const type = params.contract_type;

    // Determine target WS before doing any checks
    const targetWs = authWs.current?.readyState === WebSocket.OPEN ? authWs.current : publicWs.current;
    if (!targetWs) return;

    // Guard: Prevent double-subscribing while a request is already in flight for this type
    if (pendingProposals.current.has(type)) {
      return;
    }
    
    // Check if params AND WebSocket are the same to prevent duplicate subscriptions
    const currentParamsStr = JSON.stringify(params);
    const existingParams = lastProposalParams.current[type];
    const isSameParams = existingParams && currentParamsStr === JSON.stringify(existingParams);
    const isSameWs = proposalWs.current[type] === targetWs;

    if (!force && isSameParams && isSameWs) {
      // If we already have an active subscription on the correct WS, just keep it
      if (proposalIds.current[type]) {
        if (import.meta.env.DEV) {
          console.log(`[DERIV] Already have active subscription for ${type}, skipping.`);
        }
        return;
      }
    }
    
    // If we're here, it means we need a new/different subscription.
    // Guard: Prevent double-subscribing while a request is already in flight for this type
    if (pendingProposals.current.has(type)) {
      if (import.meta.env.DEV) {
        console.log(`[DERIV] Subscription for ${type} already pending, skipping.`);
      }
      return;
    }

    // 1. Unsubscribe from the old stream if it exists on ANY socket
    if (proposalIds.current[type]) {
      const oldId = proposalIds.current[type];
      const oldWs = proposalWs.current[type];
      
      if (import.meta.env.DEV) {
        console.log(`[DERIV] Forgetting old subscription ${oldId} for ${type}`);
      }
      // Send forget specifically to the WS that owned the subscription
      if (oldWs && oldWs.readyState === WebSocket.OPEN) {
        oldWs.send(JSON.stringify({ forget: oldId }));
      } else {
        send({ forget: oldId });
      }
      
      delete proposalIds.current[type];
      delete proposalWs.current[type];
    }
    
    lastProposalParams.current[type] = params;
    proposalWs.current[type] = targetWs;
    pendingProposals.current.add(type);

    const req_id = params.req_id || (type === 'CALL' || type === 'HIGHER' || type === 'TOUCH' || type === 'ONETOUCH' ? 100 : 200);
    
    // 2. Clear current error before new request
    setError(null);
    
    // 3. Initiate new Live Proposal Subscription
    const payload: any = {
      proposal: 1,
      subscribe: 1, // Crucial: initiates real-time stream
      basis: 'stake',
      currency: account?.currency || 'USD',
      ...params,
      req_id
    };

    // Smart symbol handling based on endpoint
    if (targetWs?.url.includes('api.derivws.com')) {
      payload.underlying_symbol = symbol;
      delete payload.symbol;
    } else {
      payload.symbol = symbol;
      delete payload.underlying_symbol;
    }
    
    if (import.meta.env.DEV) {
      console.log(`[DERIV] Subscribing to live payout for ${payload.contract_type} on ${payload.underlying_symbol || payload.symbol} via ${targetWs?.url || 'unknown'}`);
    }
    
    if (force) {
      // If forced, send immediately
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify(payload));
      }
    } else {
      // Small delay ONLY if we just sent a forget request (handled by the forget check above)
      // but if we explicitly cleared it (like in buy), we can skip the delay.
      // For simplicity, let's just send it if it's open.
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify(payload));
      }
    }
  }, [account?.currency, send]);

  const getHistory = useCallback(() => {
    if (authWs.current?.readyState === WebSocket.OPEN) {
      setIsHistoryLoading(true);
      authWs.current.send(JSON.stringify({ profit_table: 1, limit: 50, description: 1 }));
      authWs.current.send(JSON.stringify({ statement: 1, limit: 50, description: 1 }));
    }
  }, []);

  const getDepositHistory = useCallback(() => {
    if (authWs.current?.readyState === WebSocket.OPEN) {
      authWs.current.send(JSON.stringify({ statement: 1, action_type: 'deposit', description: 1 }));
    }
  }, []);

  const sellContract = useCallback((contractId: number, price: number = 0) => {
    send({ sell: contractId, price });
  }, [send]);

  const resetBalance = useCallback(async () => {
    if (!account || !account.is_virtual) {
      setError('Cannot topup real account via this method');
      return;
    }
    const token = getInMemoryToken().accessToken;
    if (!token) return;

    try {
      if (import.meta.env.DEV) {
        console.log('[DEBUG] Requesting virtual topup via REST');
      }
      await resetDemoBalanceRest(account.loginid, token);
      setSuccess('Demo balance reset successfully');
      
      // Update balance by re-fetching
      if (authWs.current?.readyState === WebSocket.OPEN) {
        authWs.current.send(JSON.stringify({ balance: 1, account: 'all' }));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reset demo balance');
    }
  }, [account]);

  return { 
    isConnected, 
    isReconnecting,
    isTrading, 
    account, 
    availableAccounts,
    lastTick, 
    markets,
    proposals,
    history,
    openPositions,
    accountStatus,
    sellErrors,
    error,
    success,
    send, 
    login, 
    signup,
    logout, 
    switchAccount,
    subscribeProposal,
    subscribeTicks,
    unsubscribeTicks,
    getHistory,
    getDepositHistory,
    isHistoryLoading,
    clearProposals,
    proposalTrigger,
    clearError,
    sellContract,
    resetBalance,
    setOnTradeExecuted,
    setOnTradeClosed
  };
};