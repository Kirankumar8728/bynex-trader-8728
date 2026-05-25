import React from 'react';
import { AppView } from '../types';
import { Home, History, Wallet, Users, ArrowUpRight, LifeBuoy, TrendingUp, User } from 'lucide-react';

interface NavigationProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange }) => {
  const navItems = [
    { id: AppView.TRADE, label: 'Trade', icon: <TrendingUp className="w-5 h-5" /> },
    { id: AppView.HISTORY, label: 'History', icon: <History className="w-5 h-5" /> },
    { id: AppView.CASHIER, label: 'Cashier', icon: <Wallet className="w-5 h-5" /> },
    { id: AppView.REFER, label: 'Refer', icon: <Users className="w-5 h-5" /> },
    { id: AppView.PROFILE, label: 'Profile', icon: <User className="w-5 h-5" /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#141922]/95 backdrop-blur-md border-t border-white/5 px-2 py-2 flex flex-col items-center z-50 pb-[env(safe-area-inset-bottom,12px)]">
      <div className="flex justify-around items-center w-full">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`flex flex-col items-center gap-1 transition-all ${
              currentView === item.id ? 'text-red-500 scale-110' : 'text-gray-500'
            }`}
          >
            {item.icon}
            <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Navigation;