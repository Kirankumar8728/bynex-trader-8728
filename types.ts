
import React from 'react';

export enum AppView {
  TRADE = 'TRADE',
  HISTORY = 'HISTORY',
  CASHIER = 'CASHIER',
  P2P = 'P2P',
  WITHDRAW = 'WITHDRAW',
  REFER = 'REFER',
  PROFILE = 'PROFILE',
  MARKETS = 'MARKETS',
  DASHBOARD = 'DASHBOARD',
  ADMIN = 'ADMIN',
  PRIVACY = 'PRIVACY',
  TERMS = 'TERMS',
  DISCLAIMER = 'DISCLAIMER',
  CONTACT = 'CONTACT'
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  method: string;
  details: string;
  status: 'pending' | 'paid' | 'rejected';
  timestamp: number;
  rejectionReason?: string;
}

export type TradeType = 'CALL' | 'PUT' | 'HIGHER' | 'LOWER' | 'TOUCH' | 'NOTOUCH' | 'ONETOUCH';

export type Timeframe = '1t' | '1m' | '2m' | '3m' | '5m' | '10m' | '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '24h';

export interface Market {
  underlying_symbol: string;
  underlying_symbol_name: string;
  market: string;
  market_display_name?: string;
  submarket: string;
  submarket_display_name?: string;
}

export interface Proposal {
  ask_price: number | string;
  payout: number | string;
  display_value?: string;
  id: string;
  spot?: number | string;
  barrier?: string;
}

export interface DerivAccount {
  balance: number;
  currency: string;
  loginid: string;
  email: string;
  is_virtual: boolean;
}

export interface DerivTick {
  underlying_symbol: string;
  quote: number;
  epoch: number;
  change?: number;
}

export interface TradeHistory {
  contract_id: number;
  underlying_symbol: string;
  buy_price: number;
  sell_price?: number;
  status: 'open' | 'won' | 'lost' | 'sold' | 'draw';
  type: string;
  entry_tick?: number;
  exit_tick?: number;
  entry_time: number;
  exit_time?: number;
  profit?: number;
  app_id?: number;
  shortcode?: string;
  longcode?: string;
}

export interface DocLink {
  name: string;
  url: string;
  description: string;
}

export interface DocCategory {
  title: string;
  links: DocLink[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  view: AppView;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        showAlert: (message: string) => void;
        isVersionAtLeast: (version: string) => boolean;
        initDataUnsafe: {
          start_param?: string;
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
          };
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        };
      };
    };
  }
}
