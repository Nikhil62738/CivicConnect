import React, { useState, useEffect, useRef } from 'react';

export default function NotificationBell({ complaintId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const dropdownRef = useRef(null);

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    const fetchNotifications = async () => {
       try {
           const token = localStorage.getItem('token');
           if (!token) return;
           const res = await fetch('http://localhost:5000/api/user/notifications', { 
               headers: { 'Authorization': `Bearer ${token}` } 
           });
           const data = await res.json();
            if (data.notifications) {
                const dismissedIds = JSON.parse(localStorage.getItem('dismissedNotifications') || '[]');
                const filtered = data.notifications.filter(n => !dismissedIds.includes(n.id));

                setNotifications(prev => {
                    // Trigger unread ping ONLY if filtered new items appear
                    if (filtered.length > prev.length && !isOpen) {
                        setHasUnread(true);
                    }
                    return filtered;
                });
            }
       } catch (e) {
           console.error("Failed to poll notifications", e);
       }
    };
    
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setHasUnread(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={toggleDropdown}
        className="relative text-slate-400 hover:text-white transition-colors duration-200 outline-none group flex items-center justify-center p-2 rounded-lg hover:bg-slate-800"
        title="Notifications"
      >
        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
        
        {hasUnread && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-slate-900"></span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-800/95 backdrop-blur-xl border border-slate-700 shadow-2xl rounded-xl overflow-hidden z-[100] animate-in slide-in-from-top-2 origin-top-right">
          <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
            <h3 className="font-bold text-white tracking-widest uppercase text-xs">Notifications</h3>
            {notifications.length > 0 && <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">{notifications.length} New</span>}
          </div>
          
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                <svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                You have no new notifications
              </div>
            ) : (
              <div className="flex flex-col">
                {notifications.map(n => (
                  <div key={n.id} className="p-4 border-b border-slate-700/50 hover:bg-slate-700/50 transition-colors cursor-pointer group">
                    <p className="text-sm text-slate-300 group-hover:text-white transition-colors">{n.message}</p>
                    <p className="text-[10px] text-primary mt-2 font-bold uppercase tracking-widest">{n.date}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {notifications.length > 0 && (
            <div className="p-3 bg-slate-900/50 text-center border-t border-slate-700">
              <button 
                className="text-xs text-slate-400 hover:text-white transition-colors"
                onClick={() => {
                  const allIds = notifications.map(n => n.id);
                  const existingDismissed = JSON.parse(localStorage.getItem('dismissedNotifications') || '[]');
                  const newDismissed = Array.from(new Set([...existingDismissed, ...allIds]));
                  localStorage.setItem('dismissedNotifications', JSON.stringify(newDismissed));
                  setNotifications([]);
                  setHasUnread(false);
                }}
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
