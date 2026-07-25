import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, ClipboardList, Package, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Category', icon: LayoutGrid, path: '/categories' },
    { label: 'Orders', icon: ClipboardList, path: '/orders' },
    { label: 'Parcel', icon: Package, path: '/parcel' },
    { label: 'Profile', icon: User, path: '/profile' },
];

const BottomNav = () => {
    const location = useLocation();

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[500] bg-white border-t border-gray-100 flex items-center justify-around h-[70px] md:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.06)] px-4 pb-[env(safe-area-inset-bottom)] overflow-hidden">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        className="flex-1 flex flex-col items-center justify-center h-full relative group"
                    >
                        {isActive && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-primary rounded-b-full" />
                        )}

                        <item.icon
                            size={24}
                            strokeWidth={isActive ? 2.5 : 2}
                            className={cn(
                                "transition-colors duration-200",
                                isActive ? "text-primary" : "text-gray-400"
                            )}
                        />

                        <span
                            className={cn(
                                "text-[10px] font-bold tracking-tight mt-1 transition-colors duration-200",
                                isActive ? "text-primary" : "text-gray-400"
                            )}
                        >
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </div>
    );
};

export default BottomNav;
