import { DocCategory } from './types';

export const DERIV_DOC_CATEGORIES: DocCategory[] = [
  {
    title: "Core API & Auth",
    links: [
      { name: "Getting Started", url: "https://developers.deriv.com/docs/getting-started", description: "The foundation of building on Deriv." },
      { name: "Authentication", url: "https://developers.deriv.com/docs/authentication", description: "API Tokens and OAuth2 setup." },
      { name: "API Explorer", url: "https://api.deriv.com/api-explorer", description: "Test WebSocket calls in real-time." },
      { name: "OAuth Guide", url: "https://developers.deriv.com/docs/oauth", description: "Official OAuth2 implementation flow." }
    ]
  },
  {
    title: "Advanced Trading",
    links: [
      { name: "Accumulator Options", url: "https://developers.deriv.com/docs/trade-using-accumalators", description: "Master growth-based trading." },
      { name: "Vanilla Options", url: "https://developers.deriv.com/docs/vanilla-options", description: "Path-independent option payouts." },
      { name: "Digit Strategies", url: "https://developers.deriv.com/docs/digit-matchesdiffers", description: "Matches/Differs, Even/Odd, Over/Under logic." },
      { name: "Multipliers", url: "https://developers.deriv.com/docs/multipliers", description: "Leveraged trading without risk of margin call." }
    ]
  },
  {
    title: "Platform & Utility",
    links: [
      { name: "MT5 API", url: "https://developers.deriv.com/docs/mt5", description: "Automate your MetaTrader 5 accounts." },
      { name: "P2P API", url: "https://developers.deriv.com/docs/p2p", description: "Integrate peer-to-peer payment data." },
      { name: "Error Codes", url: "https://developers.deriv.com/docs/error-codes", description: "Troubleshoot common API responses." },
      { name: "Changelog", url: "https://developers.deriv.com/changelog", description: "Stay updated with API versioning." }
    ]
  }
];

export const TIMEFRAME_GRANULARITY: Record<string, number> = {
  '1t': 0,
  '1m': 60,
  '2m': 120,
  '3m': 180,
  '5m': 300,
  '10m': 600,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '8h': 28800,
  '24h': 86400,
};

export const DERIV_WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public?app_id=32FjINZV8sXfdKQcVvnZf";

export const CURRENCY_CONFIG: Record<string, { step: string; min: string; decimals: number }> = {
  'USD': { step: '0.01', min: '0.1', decimals: 2 },
  'EUR': { step: '0.01', min: '0.1', decimals: 2 },
  'GBP': { step: '0.01', min: '0.1', decimals: 2 },
  'AUD': { step: '0.01', min: '0.1', decimals: 2 },
  'BTC': { step: '0.00000001', min: '0.00000001', decimals: 8 },
  'ETH': { step: '0.00000001', min: '0.00000001', decimals: 8 },
  'LTC': { step: '0.00000001', min: '0.00000001', decimals: 8 },
  'USDT': { step: '0.01', min: '0.1', decimals: 2 },
  'USDC': { step: '0.01', min: '0.1', decimals: 2 },
};

export const getCurrencyConfig = (curr: string) => {
  return CURRENCY_CONFIG[curr?.toUpperCase()] || CURRENCY_CONFIG['USD'];
};
