import React from 'react';

interface SidebarProps {
    selectedTab: 'scenarios' | 'history';
    onTabChange: (tab: 'scenarios' | 'history') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ selectedTab, onTabChange }) => {
    return (
        <div className="w-64 bg-card border-r border-border flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Navigation</h2>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex-1 p-4">
                <div className="space-y-2">
                    {/* Scenarios Tab */}
                    <button
                        onClick={() => onTabChange('scenarios')}
                        className={`w-full text-left px-4 py-3 rounded-lg font-semibold transition-colors focus:outline-none ${selectedTab === 'scenarios'
                                ? 'bg-reality-orange text-white'
                                : 'text-foreground hover:bg-reality-gray hover:text-white'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <span role="img" aria-label="scenarios" className="text-xl">
                                📋
                            </span>
                            <span>Scenarios</span>
                        </div>
                    </button>

                    {/* History Tab */}
                    <button
                        onClick={() => onTabChange('history')}
                        className={`w-full text-left px-4 py-3 rounded-lg font-semibold transition-colors focus:outline-none ${selectedTab === 'history'
                                ? 'bg-reality-orange text-white'
                                : 'text-foreground hover:bg-reality-gray hover:text-white'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <span role="img" aria-label="history" className="text-xl">
                                📊
                            </span>
                            <span>History</span>
                        </div>
                    </button>
                </div>
            </nav>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-border">
                <div className="text-sm text-reality-gray text-center">
                    911 Reality Training
                </div>
            </div>
        </div>
    );
};

export default Sidebar; 