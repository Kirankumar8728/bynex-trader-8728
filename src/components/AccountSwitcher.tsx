import React, { useState, useEffect } from 'react';

interface Account {
  id: string;
  token: string;
}

interface Props {
  accounts: Account[];
}

const AccountSwitcher = ({ accounts }: Props) => {
  const [showMore, setShowMore] = useState(false);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('activeAccount');
    if (saved) {
      setActiveAccount(JSON.parse(saved));
    } else if (accounts.length > 0) {
      setActiveAccount(accounts[0]);
    }
  }, [accounts]);

  const handleSwitch = (account: Account) => {
    console.log(`Switching to account: ${account.id}`);
    localStorage.setItem('activeAccount', JSON.stringify(account));
    setActiveAccount(account);
  };

  const activeAssets = [
    { name: 'USD Real', balance: '1,234.56' },
    { name: 'Demo Account', balance: '10,000.00' },
  ];
  const moreAssets = [
    { name: 'BTC Wallet', balance: '0.05' },
    { name: 'USDT Wallet', balance: '500.00' },
  ];

  return (
    <div className="bg-[#1a1d24] p-6 rounded-xl shadow-sm text-white">
      <h2 className="text-xl font-semibold mb-6">ACCOUNT SETTINGS</h2>
      
      <h3 className="text-sm font-medium text-neutral-400 mb-2">ACCOUNTS</h3>
      {accounts.length === 0 ? (
        <p className="text-sm text-red-400 mb-4">No accounts found.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {accounts.map((account) => (
            <button 
              key={account.id}
              onClick={() => handleSwitch(account)}
              className={`w-full text-left p-3 rounded-lg ${activeAccount?.id === account.id ? 'bg-indigo-600' : 'bg-[#262932] hover:bg-[#323640]'}`}
            >
              {account.id} {activeAccount?.id === account.id && ' (Active)'}
            </button>
          ))}
        </div>
      )}

      <button className="w-full p-3 mb-8 border border-indigo-500 rounded-lg text-indigo-300 hover:bg-[#262932] flex items-center justify-center gap-2 font-medium">
        <span className="text-lg">+</span> Add Asset
      </button>

      <div className="mb-6">
        <h3 className="text-sm font-medium text-neutral-400 mb-2">Active Assets</h3>
        <div className="space-y-2">
          {activeAssets.map(asset => (
            <div key={asset.name} className="flex justify-between p-3 bg-[#262932] rounded-lg">
              <span>{asset.name}</span>
              <span className="font-mono font-medium">{asset.balance}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <button 
          onClick={() => setShowMore(!showMore)}
          className="text-sm font-medium text-indigo-400 hover:text-indigo-300 mb-2"
        >
          {showMore ? 'Hide More Assets' : 'Show More Assets'}
        </button>
        {showMore && (
          <div className="space-y-2 mt-2">
            {moreAssets.map(asset => (
              <div key={asset.name} className="flex justify-between p-3 bg-[#262932] rounded-lg">
                <span>{asset.name}</span>
                <span className="font-mono font-medium">{asset.balance}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountSwitcher;
