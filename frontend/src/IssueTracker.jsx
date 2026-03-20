import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

// Haversine formula to calculate distance between two points
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function IssueTracker() {
  const [issues, setIssues] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [commentInputs, setCommentInputs] = useState({});
  const [filter, setFilter] = useState('all'); // all, mine
  const [user, setUser] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [cityRanking, setCityRanking] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    setUser(storedUser);
    
    // Get user location for geo-fencing
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
        },
        (error) => console.error('Error getting location:', error)
      );
    }

    // Fetch issues - use public endpoint if no token
    const url = token ? 'http://localhost:5000/api/issues' : 'http://localhost:5000/api/public/issues';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    fetch(url, { headers })
      .then(res => res.json())
      .then(data => {
        if (data.issues) setIssues(data.issues);
      })
      .catch(console.error);

    // Fetch leaderboard
    fetch('http://localhost:5000/api/leaderboard')
      .then(res => res.json())
      .then(data => {
        if (data.leaderboard) setLeaderboard(data.leaderboard);
      })
      .catch(console.error);

    // Fetch city ranking
    fetch('http://localhost:5000/api/city-ranking')
      .then(res => res.json())
      .then(data => setCityRanking(data))
      .catch(console.error);

    // Socket.IO for real-time updates
    const socket = io('http://localhost:5000');

    socket.on('issueCreated', (newIssue) => {
      setIssues(prev => [newIssue, ...prev]);
    });

    socket.on('issueUpdated', (updatedIssue) => {
      setIssues(prev => prev.map(issue => issue.id === updatedIssue.id ? updatedIssue : issue));
    });

    socket.on('issueDeleted', (deletedData) => {
      const deletedId = deletedData?.id ?? deletedData;
      setIssues(prev => prev.filter(issue => issue.id !== deletedId));
    });

    socket.on('commentAdded', (commentData) => {
      // For simplicity, refetch issues or update comments
      // In a real app, maintain comments state
      console.log('New comment:', commentData);
    });

    socket.on('newIssueNearby', (issueData) => {
      if (userLocation) {
        const distance = getDistance(userLocation.lat, userLocation.lng, issueData.lat, issueData.lng);
        if (distance < 5) { // within 5km
          alert(`New issue reported near you: ${issueData.title} (${issueData.category})`);
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleUpvote = async (id) => {
    setIssues(issues.map(i => i.id === id ? { ...i, upvotes: i.upvotes + 1 } : i));
    try {
      const token = localStorage.getItem('token');
      await fetch(`http://localhost:5000/api/issues/${id}/vote`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch(e) {}
  };

  const handleComment = async (id, e) => {
    e.preventDefault();
    const text = commentInputs[id];
    if (!text?.trim()) return;

    setIssues(issues.map(i => i.id === id ? { ...i, comments: [...(i.comments || []), { author: 'Citizen Reporter', content: text, created_at: new Date() }] } : i));
    setCommentInputs({ ...commentInputs, [id]: '' });

    try {
      const token = localStorage.getItem('token');
      await fetch(`http://localhost:5000/api/issues/${id}/comments`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
        body: JSON.stringify({ content: text })
      });
    } catch(e) {}
  };

  const handleVerify = async (id, type) => {
     try {
       const token = localStorage.getItem('token');
       const res = await fetch(`http://localhost:5000/api/issues/${id}/verify`, { 
         method: 'POST', 
         headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
         body: JSON.stringify({ type })
       });
       const data = await res.json();
       if (data.error) alert(data.error);
       else {
         if (data.points > 0) {
           alert(`Verification Successful! You earned ${data.points} points.`);
         } else {
           alert(data.message || 'Verification recorded.');
         }
       }
     } catch(e) {
       alert("Error during verification.");
     }
  };

  const getStatusBadge = (issue) => {
    const s = issue.status || 'Pending';
    const isOverdue = s !== 'Resolved' && issue.deadline_at && new Date(issue.deadline_at) < new Date();
    
    if (s === 'Resolved') return <span className="bg-emerald-500/20 text-emerald-400 font-bold px-3 py-1 rounded">✅ Resolved</span>;
    
    return (
      <div className="flex flex-col items-end gap-1">
        {s === 'In Progress' ? (
          <span className="bg-blue-500/20 text-blue-400 font-bold px-3 py-1 rounded">⏳ In Progress</span>
        ) : (
          <span className="bg-amber-500/20 text-amber-500 font-bold px-3 py-1 rounded">💡 Pending</span>
        )}
        <div className="flex gap-1">
          {isOverdue && (
             <span className="bg-red-500 text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded animate-pulse">⚠️ Delayed</span>
          )}
          {issue.is_escalated === 1 && (
             <span className="bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-lg border border-indigo-400">⚖️ Escalated</span>
          )}
        </div>
      </div>
    );
  };

  const filteredIssues = issues;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row gap-8">
      {/* Main Issue List */}
      <div className="flex-1 animate-in slide-in-from-left duration-500">
        <div className="flex justify-between items-end mb-8 border-b border-slate-700 pb-4">
          <div>
            <h2 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Civic Ledger</h2>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Real-time Community Infrastructure Tracking</p>
          </div>
        </div>

        <div className="flex flex-col gap-6 pb-12">
          {filteredIssues.map(issue => (
            <div key={issue.id} className={`glass-card p-6 flex flex-col gap-4 group relative ${issue.is_emergency ? 'ring-2 ring-red-500/50' : 'border-slate-800'}`}>
              
              {issue.is_emergency === 1 && (
                <div className="absolute top-[-12px] left-4 bg-red-600 text-white text-[10px] font-black uppercase tracking-[3px] px-3 py-1 rounded-full shadow-lg z-10 animate-pulse">
                  🚨 Emergency Report
                </div>
              )}

              <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                <span className="text-xs font-mono text-slate-500">ID: {issue.complaint_id}</span>
                {getStatusBadge(issue)}
              </div>

              <div className="grid md:grid-cols-[1fr_200px] gap-4">
                <div>
                  <h3 className="text-2xl font-black text-white group-hover:text-primary transition-colors">{issue.title}</h3>
                  <p className="text-slate-400 text-sm mt-1 leading-relaxed">{issue.description}</p>
                  
                  {issue.admin_remarks && (
                    <div className="mt-4 bg-primary/5 border-l-4 border-primary p-3 rounded-r-lg">
                      <p className="text-[10px] font-black text-primary uppercase mb-1 tracking-widest">🏛️ Government Response</p>
                      <p className="text-xs text-slate-300 italic">"{issue.admin_remarks}"</p>
                    </div>
                  )}
                </div>
                {(issue.media_url || issue.resolution_media_url) && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest text-center">Visual Proof</div>
                    <div className={`grid ${issue.resolution_media_url ? 'grid-cols-2' : 'grid-cols-1'} gap-1 rounded-lg overflow-hidden border border-slate-700`}>
                      {issue.media_url && (
                        <div className="relative group/img cursor-zoom-in">
                          <img src={issue.media_url} alt="Reported" className="w-full h-24 object-cover" />
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[8px] text-white text-center py-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity uppercase font-bold">Reported</div>
                        </div>
                      )}
                      {issue.resolution_media_url && (
                        <div className="relative group/img cursor-zoom-in">
                          <img src={issue.resolution_media_url} alt="Resolved" className="w-full h-24 object-cover ring-2 ring-emerald-500/30 ring-inset" />
                          <div className="absolute inset-x-0 bottom-0 bg-emerald-600/80 text-[8px] text-white text-center py-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity uppercase font-bold">Resolved</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-700/50">
                <div className="flex gap-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">{issue.category}</span>
                  <span className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border ${issue.priority === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>{issue.priority} Priority</span>
                </div>
                
                <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-700/50 w-full">
                   {user && user.id !== issue.user_id && (
                     <div className="flex gap-2">
                        <button 
                          onClick={() => handleVerify(issue.id, 'exists')}
                          className="text-[9px] font-black uppercase tracking-widest bg-slate-800 text-amber-500 hover:bg-amber-500 hover:text-black px-4 py-2 rounded-lg border border-amber-500/20 transition-all flex items-center gap-2"
                        >
                          📍 Still Here? (+5 pts)
                        </button>
                        <button 
                          onClick={() => handleVerify(issue.id, issue.status === 'Resolved' ? 'not_resolved' : 'resolved')}
                          className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                            issue.status === 'Resolved' 
                              ? 'bg-slate-800 text-red-400 hover:bg-red-500 hover:text-white border-red-500/20' 
                              : 'bg-slate-800 text-emerald-400 hover:bg-emerald-500 hover:text-black border-emerald-500/20'
                          }`}
                        >
                          {issue.status === 'Resolved' ? '🚫 Dispute Resolution' : '✅ Fixed? (+10 pts)'}
                        </button>
                     </div>
                   )}
                   <div className="flex-1 flex justify-end">
                    <button 
                      onClick={() => user ? handleUpvote(issue.id) : alert('Please login to upvote')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all border ${user ? 'text-slate-300 hover:text-emerald-400 bg-slate-800 hover:bg-slate-700 border-slate-700 active:scale-95' : 'text-slate-600 bg-slate-900 border-slate-800 cursor-not-allowed'}`}
                    >
                      🚀 <span>{issue.upvotes || 0} Votes</span>
                    </button>
                   </div>
                </div>
              </div>

              {/* Discussion Section */}
              <div className="mt-2 bg-slate-950 p-4 rounded-xl shadow-inner border border-slate-900">
                <div className="space-y-3 mb-4 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
                  {(issue.comments || []).map((c, idx) => (
                    <div key={idx} className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-black text-primary uppercase mb-1">{c.author_name || c.author || 'Citizen'}</p>
                        <p className="text-xs text-slate-300">{c.content || c.text}</p>
                      </div>
                      <span className="text-[9px] text-slate-600">{new Date(issue.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {(!issue.comments || issue.comments.length === 0) && <p className="text-[10px] text-slate-600 italic text-center py-2">No discussion yet</p>}
                </div>

                {user ? (
                  <form onSubmit={e => handleComment(issue.id, e)} className="flex gap-2">
                    <input 
                      type="text" 
                      value={commentInputs[issue.id] || ''} 
                      onChange={e => setCommentInputs({...commentInputs, [issue.id]: e.target.value})} 
                      placeholder="Contribute info..." 
                      className="flex-1 bg-slate-900 border-slate-800 text-xs py-2 rounded-lg px-4 text-white placeholder-slate-600 focus:ring-1 focus:ring-primary outline-none transition-all" 
                    />
                    <button className="bg-primary hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-lg transition-transform active:scale-95" type="submit">Send</button>
                  </form>
                ) : (
                  <div className="text-center py-2 bg-slate-900/30 rounded-lg border border-slate-800/50">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Sign in to join the discussion</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar: Leaderboard & Stats */}
      <div className="w-full md:w-72 flex flex-col gap-6 animate-in slide-in-from-right duration-500 pt-16">
        {cityRanking && (
          <div className="glass-card p-6 border-emerald-500/20 bg-gradient-to-br from-slate-900 to-emerald-950/20">
            <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">
              🏙️ City Ranking
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300">Cleanliness</span>
                <span className="text-lg font-black text-emerald-400">{cityRanking.cleanliness}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300">Avg Response Time</span>
                <span className="text-lg font-black text-blue-400">{cityRanking.avgResponseTimeHours}h</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300">Overall Score</span>
                <span className="text-lg font-black text-primary">{cityRanking.overallScore}/100</span>
              </div>
              <div className="text-center mt-4">
                <span className="text-xs text-slate-500">Rank #{cityRanking.rank}</span>
              </div>
            </div>
          </div>
        )}

        <div className="glass-card p-6 border-indigo-500/20 bg-gradient-to-br from-slate-900 to-indigo-950/20">
          <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">
            🏆 Leaderboard
          </h3>
          <div className="space-y-4">
            {leaderboard.map((user, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${idx === 0 ? 'bg-amber-500 text-black' : idx === 1 ? 'bg-slate-300 text-black' : idx === 2 ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                    {idx + 1}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200">{user.name}</span>
                    <span className="text-[8px] font-black uppercase text-primary/70 tracking-tighter">{user.badge || 'Citizen'}</span>
                  </div>
                </div>
                <span className="text-[10px] font-black text-primary px-2 py-1 bg-primary/10 rounded">{user.points} pts</span>
              </div>
            ))}
            {leaderboard.length === 0 && <p className="text-xs text-slate-500 text-center italic">No contenders yet</p>}
          </div>
          <div className="mt-6 pt-4 border-t border-white/5 text-center">
            <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-tighter">Your contribution matters</p>
            <div className="text-[9px] text-slate-400 leading-tight">Resolve issues to climb the city's civic leaderboard and earn prestige.</div>
          </div>
        </div>

        <div className="glass-card p-6 border-amber-500/20">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-[3px] mb-4">Community KPI</h4>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-slate-400 font-bold">Resolution Rate</span>
            <span className="text-xs text-emerald-400 font-black">78%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 w-[78%]"></div>
          </div>
          <p className="text-[9px] text-slate-500 mt-3 italic line-clamp-2 italic leading-relaxed font-medium">Monitoring the success of civic collaboration across the metropolitan area.</p>
        </div>
      </div>
    </div>
  );
}
