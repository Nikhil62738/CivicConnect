import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import { maharashtraDistricts, districtCoords } from './constants';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function DistrictMapFocus({ filterDistrict, isDistrictAdmin }) {
  const map = useMap();
  
  useEffect(() => {
    if (isDistrictAdmin && filterDistrict !== 'All' && districtCoords[filterDistrict]) {
      const [lat, lng] = districtCoords[filterDistrict];
      map.flyTo([lat, lng], 11, { animate: true, duration: 1.5 });
    }
  }, [filterDistrict, isDistrictAdmin, map]);
  
  return null;
}

export default function AdminDashboard({ user }) {
  const [issues, setIssues] = useState([]);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, map, manage
  const [filterCat, setFilterCat] = useState('All');
  const [filterPri, setFilterPri] = useState('All');
  const [filterDept, setFilterDept] = useState('All');
  const [filterDistrict, setFilterDistrict] = useState('All');
  const [filterTaluka, setFilterTaluka] = useState('All');
  const [filterTime, setFilterTime] = useState('Monthly'); // Today, Weekly, Monthly, All
  const [searchTerm, setSearchTerm] = useState('');
  const [mapView, setMapView] = useState('city'); // issues, city

  const isDistrictAdmin = user?.department && user.email !== 'gov@city.org';
  const isMasterAdmin = user?.email === 'gov@city.org';

  // Maharashtra districts and their talukas
  const maharashtraDistricts = {
    'Ahmednagar': ['Ahmednagar', 'Akole', 'Jamkhed', 'Karjat', 'Kopargaon', 'Nevasa', 'Parner', 'Pathardi', 'Rahata', 'Rahuri', 'Sangamner', 'Shevgaon', 'Shrigonda', 'Shrirampur'],
    'Akola': ['Akola', 'Akot', 'Balapur', 'Barshitakli', 'Murtijapur', 'Patur', 'Telhara'],
    'Amravati': ['Achawal', 'Amravati', 'Anjangaon Surji', 'Bhatkuli', 'Chandur Bazar', 'Chandur Railway', 'Chikhaldara', 'Daryapur', 'Dhamangaon Railway', 'Dharni', 'Morshi', 'Nandgaon Khandeshwar', 'Teosa', 'Warud'],
    'Aurangabad': ['Aurangabad', 'Gangapur', 'Kannad', 'Khuldabad', 'Paithan', 'Phulambri', 'Sillod', 'Soegaon', 'Vaijapur'],
    'Beed': ['Ambejogai', 'Ashti', 'Bid', 'Dharur', 'Georai', 'Kaij', 'Manjlegaon', 'Parli', 'Patoda', 'Shirur', 'Wadwani'],
    'Bhandara': ['Bhandara', 'Lakhandur', 'Lakhani', 'Mohadi', 'Pauni', 'Sakoli', 'Tumsar'],
    'Buldhana': ['Buldhana', 'Chikhli', 'Deulgaon Raja', 'Jalgaon Jamod', 'Khamgaon', 'Lonar', 'Malkapur', 'Mehkar', 'Motala', 'Nandura', 'Sangrampur', 'Shegaon', 'Sindkhed Raja'],
    'Chandrapur': ['Ballarpur', 'Bhadravati', 'Brahmapuri', 'Chandrapur', 'Chimur', 'Gondpipri', 'Jiwati', 'Korpana', 'Mul', 'Nagbhid', 'Pombhurna', 'Rajura', 'Sawali', 'Sindewahi', 'Warora'],
    'Dhule': ['Dhule', 'Malegaon', 'Sakri', 'Shirpur', 'Sindkhede'],
    'Gadchiroli': ['Aheri', 'Armori', 'Bhamragad', 'Chamorshi', 'Desaiganj', 'Dhanora', 'Etapalli', 'Gadchiroli', 'Kurkheda', 'Mulchera', 'Sironcha', 'Wadsa'],
    'Gondia': ['Amgaon', 'Arjuni Morgaon', 'Deori', 'Gondia', 'Goregaon', 'Sadak Arjuni', 'Salekasa', 'Tirora'],
    'Hingoli': ['Aundha', 'Basmath', 'Hingoli', 'Kalamnuri', 'Sengaon'],
    'Jalgaon': ['Amalner', 'Bhadgaon', 'Bhusawal', 'Bodwad', 'Chalisgaon', 'Chopda', 'Dharangaon', 'Erandol', 'Jalgaon', 'Jamner', 'Muktainagar', 'Pachora', 'Parola', 'Raver', 'Yawal'],
    'Jalna': ['Ambad', 'Badnapur', 'Bhokardan', 'Ghansawangi', 'Jafferabad', 'Jalna', 'Mantha', 'Partur'],
    'Kolhapur': ['Ajra', 'Bavda', 'Bhudargad', 'Chandgad', 'Gadhinglaj', 'Hatkanangale', 'Kagal', 'Karvir', 'Kolhapur', 'Panhala', 'Radhanagari', 'Shahuwadi', 'Shirol'],
    'Latur': ['Ahmadpur', 'Ausa', 'Chakur', 'Deoni', 'Jalkot', 'Latur', 'Nilanga', 'Renapur', 'Shirur Anantpal', 'Udgir'],
    'Mumbai City': ['Area not divided into Talukas'],
    'Mumbai Suburban': ['Andheri', 'Borivali', 'Kurla'],
    'Nagpur': ['Bhiwapur', 'Hingna', 'Kalameshwar', 'Kamthi', 'Kuhi', 'Mauda', 'Nagpur Rural', 'Nagpur Urban', 'Narkhed', 'Parseoni', 'Ramtek', 'Savner', 'Umred'],
    'Nanded': ['Ardhapur', 'Bhokar', 'Biloli', 'Deglur', 'Dharmabad', 'Hadgaon', 'Himayatnagar', 'Kandhar', 'Kinwat', 'Loha', 'Mahur', 'Mudkhed', 'Mukhed', 'Naigaon', 'Nanded', 'Umri'],
    'Nandurbar': ['Akkalkuwa', 'Akrani', 'Nandurbar', 'Navapur', 'Shahade', 'Talode'],
    'Nashik': ['Baglan', 'Chandvad', 'Deola', 'Dindori', 'Igatpuri', 'Kalwan', 'Malegaon', 'Nandgaon', 'Nashik', 'Niphad', 'Peint', 'Sinnar', 'Sula', 'Surgeana', 'Trimbakeshwar', 'Yevla'],
    'Osmanabad': ['Bhum', 'Kalamb', 'Lohara', 'Osmanabad', 'Paranda', 'Tuljapur', 'Umarga', 'Washi'],
    'Palghar': ['Dahanu', 'Jawhar', 'Mokhada', 'Palghar', 'Talasari', 'Vasai', 'Vikramgad'],
    'Parbhani': ['Gangakhed', 'Jintur', 'Manwath', 'Palam', 'Parbhani', 'Pathri', 'Purna', 'Sailu', 'Sonpeth'],
    'Pune': ['Ambegaon', 'Baramati', 'Bhor', 'Daund', 'Haveli', 'Indapur', 'Junnar', 'Khed', 'Mawal', 'Mulshi', 'Pune City', 'Purandhar', 'Shirur', 'Velhe'],
    'Raigad': ['Alibag', 'Karjat', 'Khalapur', 'Mahad', 'Mangaon', 'Mhasla', 'Murud', 'Panvel', 'Pen', 'Poladpur', 'Roha', 'Shrivardhan', 'Sudhagad', 'Tala', 'Uran'],
    'Ratnagiri': ['Chiplun', 'Dapoli', 'Guhagar', 'Khed', 'Lanja', 'Mandangad', 'Rajapur', 'Ratnagiri', 'Sangameshwar'],
    'Sangli': ['Atpadi', 'Jat', 'Kadegaon', 'Kavathe Mahankal', 'Khanapur', 'Miraj', 'Palus', 'Sangli', 'Shirala', 'Tasgaon', 'Walwa'],
    'Satara': ['Jaoli', 'Karad', 'Khandala', 'Khatav', 'Koregaon', 'Mahabaleshwar', 'Man', 'Patan', 'Phaltan', 'Satara', 'Wai'],
    'Sindhudurg': ['Devgad', 'Dodamarg', 'Kankavli', 'Kudal', 'Malwan', 'Sawantwadi', 'Vaibhavwadi', 'Vengurla'],
    'Solapur': ['Akkalkot', 'Barshi', 'Karmala', 'Madha', 'Malshiras', 'Mangalvedhe', 'Mohol', 'Pandharpur', 'Sangole', 'Solapur North', 'Solapur South'],
    'Thane': ['Ambarnath', 'Bhiwandi', 'Kalyan', 'Murbad', 'Shahapur', 'Thane', 'Ulhasnagar'],
    'Wardha': ['Arvi', 'Ashti', 'Deoli', 'Hinganghat', 'Karanja', 'Samudrapur', 'Seloo', 'Wardha'],
    'Washim': ['Karanja', 'Malegaon', 'Mangrulpir', 'Manora', 'Risod', 'Washim'],
    'Yavatmal': ['Arni', 'Babulgaon', 'Darwha', 'Digras', 'Ghatanji', 'Kalamb', 'Kelapur', 'Lohara', 'Mahagaon', 'Maregaon', 'Ner', 'Pusad', 'Ralegaon', 'Umarkhed', 'Wani', 'Yavatmal', 'Zari Jamni']
  };

  // Get available options for filters
  const availableDistricts = Object.keys(maharashtraDistricts).sort();
  const availableTalukas = filterDistrict === 'All' || isDistrictAdmin
    ? Object.values(maharashtraDistricts).flat().sort()
    : (maharashtraDistricts[filterDistrict] || []).sort();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [performances, setPerformances] = useState([]);
  const [predictions, setPredictions] = useState([]);

  const [expandedIssue, setExpandedIssue] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [saving, setSaving] = useState(false);

  const [adminUsers, setAdminUsers] = useState([]);
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '', department: '' });
  const [addingAdmin, setAddingAdmin] = useState(false);

  const fetchIssues = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/admin/issues', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        setIsAuthorized(false);
        return;
      }
      const data = await res.json();
      if (data.issues) setIssues(data.issues);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      const [perfRes, predRes] = await Promise.all([
        fetch('http://localhost:5000/api/admin/department-performance', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('http://localhost:5000/api/admin/issue-predictions', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      const perfData = await perfRes.json();
      const predData = await predRes.json();
      if (perfData.ranking) setPerformances(perfData.ranking);
      if (predData.predictions) setPredictions(predData.predictions);
    } catch (e) {
      console.error("Analytics fetch failed", e);
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.users) setAdminUsers(data.users);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (user?.department && user.email !== 'gov@city.org') {
      setFilterDistrict(user.department);
    }
    fetchIssues();
    fetchAnalytics();
    fetchAdminUsers();
  }, [user]);

  const handleUpdateIssue = async (id) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/issues/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editFormData)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to update record.");
      }

      await fetchIssues(); // Refresh list to grab tracked timestamps
      setExpandedIssue(null);
      alert("✅ System Update Successful");
    } catch (e) {
      console.error(e);
      alert(`❌ Update Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setIsRefreshing(true);
    await fetchIssues();
    await fetchAdminUsers();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setAddingAdmin(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(adminForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create admin');
      alert(`Admin account created for ${adminForm.email}`);
      setAdminForm({ name: '', email: '', password: '', department: '' });
      await fetchAdminUsers();
    } catch (e) {
      alert(e.message);
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm('Are you sure you want to remove this admin session?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deletion failed');
      await fetchAdminUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  // Trend and Filtered Analysis Logic
  const filteredByTime = useMemo(() => {
    const now = new Date();
    return issues.filter(i => {
      const created = new Date(i.created_at);
      if (filterTime === 'Today') return created.toDateString() === now.toDateString();
      if (filterTime === 'Weekly') return (now - created) <= (7 * 24 * 60 * 60 * 1000);
      if (filterTime === 'Monthly') return (now - created) <= (30 * 24 * 60 * 60 * 1000);
      return true;
    });
  }, [issues, filterTime]);

  const cityData = useMemo(() => {
    const stats = {};
    filteredByTime.forEach(i => {
      const city = i.city || 'Other';
      if (!stats[city]) stats[city] = { name: city, Pending: 0, "In Progress": 0, Resolved: 0, total: 0 };
      const status = i.status || 'Pending';
      stats[city][status] = (stats[city][status] || 0) + 1;
      stats[city].total++;
    });
    return Object.values(stats).sort((a, b) => b.total - a.total).slice(0, 5); // Top 5
  }, [filteredByTime]);

  const computeImprovement = (city) => {
    // Current period vs Previous period for this city
    const now = new Date();
    const periodMs = filterTime === 'Today' ? (24 * 60 * 60 * 1000) : (filterTime === 'Weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000);

    const currIssues = issues.filter(i => {
      const created = new Date(i.created_at);
      return i.city === city && (now - created) <= periodMs;
    });
    const prevIssues = issues.filter(i => {
      const created = new Date(i.created_at);
      return i.city === city && (now - created) > periodMs && (now - created) <= (periodMs * 2);
    });

    if (prevIssues.length === 0) return 0;

    const currRate = currIssues.filter(i => i.status === 'Resolved').length / (currIssues.length || 1);
    const prevRate = prevIssues.filter(i => i.status === 'Resolved').length / (prevIssues.length || 1);

    return Math.round((currRate - prevRate) * 100);
  };

  const cityRanking = useMemo(() => {
    return Object.entries(maharashtraDistricts).map(([name]) => {
      const cityIssues = issues.filter(i => i.city === name);
      if (cityIssues.length === 0) return { name, score: 0, solved: 0 };
      const rate = cityIssues.filter(i => i.status === 'Resolved').length / cityIssues.length;
      return { name, score: Math.round(rate * 100), solved: cityIssues.filter(i => i.status === 'Resolved').length };
    }).sort((a, b) => b.score - a.score || b.solved - a.solved).slice(0, 10);
  }, [issues]);
  const total = issues.length;
  const pending = issues.filter(i => (!i.status || i.status === 'Pending')).length;
  const inProgress = issues.filter(i => i.status === 'In Progress').length;
  const resolved = issues.filter(i => i.status === 'Resolved').length;

  const cats = issues.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + 1;
    return acc;
  }, {});

  const avgResolutionLogs = issues.filter(i => i.resolved_at && i.created_at).map(i => {
    return new Date(i.resolved_at) - new Date(i.created_at);
  });

  const avgResTimeMs = avgResolutionLogs.length > 0
    ? avgResolutionLogs.reduce((a, b) => a + b, 0) / avgResolutionLogs.length
    : 0;
  const avgResTimeHours = (avgResTimeMs / (1000 * 60 * 60)).toFixed(1);

  // Filtering
  const filteredIssues = issues.filter(i => {
    const cMatch = filterCat === 'All' || i.category === filterCat;
    const pMatch = filterPri === 'All' || i.priority === filterPri;
    const dMatch = filterDept === 'All' || i.department === filterDept;
    const districtMatch = filterDistrict === 'All' || i.city === filterDistrict;
    const talukaMatch = filterTaluka === 'All' || i.village === filterTaluka;

    const search = searchTerm.toLowerCase();
    const sMatch = !searchTerm ||
      (i.title?.toLowerCase().includes(search)) ||
      (i.complaint_id?.toLowerCase().includes(search)) ||
      (i.user?.email?.toLowerCase().includes(search));

    return cMatch && pMatch && dMatch && districtMatch && talukaMatch && sMatch;
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-in fade-in duration-300">

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-black text-white bg-clip-text text-transparent bg-gradient-to-r from-primary to-emerald-400">Headquarters</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-slate-400 font-medium tracking-wide">City Infrastructure & Complaint Analytics</p>
            {isDistrictAdmin && <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/30 uppercase font-black tracking-widest animate-pulse">🏛️ District Mode: {user.department}</span>}
          </div>
        </div>

        <div className="flex bg-slate-800 rounded-lg p-1 shadow-xl border border-slate-700/50 overflow-x-auto no-scrollbar">
          <div className="flex whitespace-nowrap">
            <button onClick={() => setActiveTab('overview')} className={`px-4 md:px-5 py-2 rounded-md font-bold text-[11px] md:text-sm transition-colors ${activeTab === 'overview' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Overview</button>
            <button onClick={() => setActiveTab('analytics')} className={`px-4 md:px-5 py-2 rounded-md font-bold text-[11px] md:text-sm transition-colors ${activeTab === 'analytics' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>🚀 Analytics</button>
            <button onClick={() => setActiveTab('map')} className={`px-4 md:px-5 py-2 rounded-md font-bold text-[11px] md:text-sm transition-colors ${activeTab === 'map' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Heatmap</button>
            <button onClick={() => setActiveTab('manage')} className={`px-4 md:px-5 py-2 rounded-md font-bold text-[11px] md:text-sm transition-colors ${activeTab === 'manage' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Manage DB</button>
            {isMasterAdmin && <button onClick={() => setActiveTab('admins')} className={`px-4 md:px-5 py-2 rounded-md font-bold text-[11px] md:text-sm transition-colors ${activeTab === 'admins' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>👤 District Admins</button>}
          </div>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4">

          <div className="md:col-span-12 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-4">
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 w-full sm:w-auto overflow-x-auto no-scrollbar">
              {['Today', 'Weekly', 'Monthly', 'All'].map(t => (
                <button key={t} onClick={() => setFilterTime(t)} className={`flex-1 sm:flex-none px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded transition-all whitespace-nowrap ${filterTime === t ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-300'}`}>{t}</button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
              📅 Analyzing {filterTime} Trends
            </div>
          </div>

          <div className="md:col-span-8 flex flex-col gap-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="glass-card p-6 border-b-4 border-b-blue-500 relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 opacity-10 text-blue-500"><svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path d="M10 20a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm-5.6-4.29a9.95 9.95 0 0 1 11.2 0 8 8 0 1 0-11.2 0zm6.12-7.64l3.02-3.02 1.41 1.41-3.02 3.02a2 2 0 1 1-1.41-1.41z" /></svg></div>
                <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Total Complaints</h3>
                <p className="text-5xl font-black text-white">{total}</p>
              </div>
              <div className="glass-card p-6 border-b-4 border-b-emerald-500 relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 opacity-10 text-emerald-500"><svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z" /></svg></div>
                <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Resolution Rate</h3>
                <p className="text-5xl font-black text-emerald-400">{total > 0 ? Math.round((resolved / total) * 100) : 0}%</p>
              </div>
              <div className="glass-card p-6 border-b-4 border-b-amber-500 relative overflow-hidden">
                <div className="absolute -right-6 -bottom-6 opacity-10 text-amber-500"><svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path d="M10 20a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-7.59V4h2v5.59l3.95 3.95-1.41 1.41L9 10.41z" /></svg></div>
                <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Avg Res Time</h3>
                <p className="text-5xl font-black text-amber-400">{avgResTimeHours}<span className="text-lg font-bold ml-1">hrs</span></p>
              </div>
            </div>

            {/* CITY PIPELINE - NEW FEATURE */}
            <div className="glass-card p-6 border border-slate-700/50 bg-gradient-to-br from-slate-900 to-slate-800/50">
              <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">🔄 City Pipeline Flow</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Resource allocation and status tracking per district</p>
                </div>
                <div className="flex gap-4">
                  <div className="text-center px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <div className="text-[9px] text-emerald-400 font-black uppercase">Done</div>
                    <div className="text-lg font-black text-white">{resolved}</div>
                  </div>
                  <div className="text-center px-3 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <div className="text-[9px] text-blue-400 font-black uppercase">Doing</div>
                    <div className="text-lg font-black text-white">{inProgress}</div>
                  </div>
                  <div className="text-center px-3 py-1 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    <div className="text-[9px] text-amber-400 font-black uppercase">Wait</div>
                    <div className="text-lg font-black text-white">{pending}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {cityData.map(city => {
                  const totalCity = city.total;
                  const rP = (city.Resolved / totalCity) * 100;
                  const iP = (city['In Progress'] / totalCity) * 100;
                  const wP = (city.Pending / totalCity) * 100;

                  return (
                    <div key={city.name} className="space-y-2 group hover:bg-slate-800/40 p-2 rounded-xl transition-all cursor-pointer" onClick={() => { setFilterDistrict(city.name); setActiveTab('manage'); }}>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-slate-300 uppercase tracking-widest">{city.name}</span>
                        <span className="font-mono text-[10px] text-primary">{totalCity} Incident(s)</span>
                      </div>
                      <div className="h-4 w-full bg-slate-800 rounded-full flex overflow-hidden border border-slate-700/50 shadow-inner">
                        <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${rP}%` }}></div>
                        <div className="bg-blue-500 transition-all duration-700 opacity-80" style={{ width: `${iP}%` }}></div>
                        <div className="bg-amber-500 transition-all duration-700 opacity-60" style={{ width: `${wP}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[8px] font-black uppercase text-slate-500 tracking-tighter">
                        <span>🟢 {Math.round(rP)}% Solved</span>
                        <span>🔵 {Math.round(iP)}% Processing</span>
                        <span>🟡 {Math.round(wP)}% Queued</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-800">
                <h4 className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">⚠️ Risk Profile Assessment</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(issues.reduce((acc, curr) => {
                    if ((curr.priority === 'High' || curr.is_emergency) && curr.status !== 'Resolved') {
                      acc[curr.city] = (acc[curr.city] || 0) + 1;
                    }
                    return acc;
                  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([city, count]) => (
                    <div key={city} className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-black text-red-400 uppercase">{city}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Critical Backlog</div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center font-black text-red-500 text-xs shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse">{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-4 flex flex-col gap-8">
            {/* CITY RANKING & TRENDS */}
            <div className="glass-card p-6 border border-slate-700/50 flex flex-col h-full rounded-2xl bg-slate-900/40">
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">🏅 City Rankings</h3>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                {cityRanking.map((city, idx) => {
                  const improvement = computeImprovement(city.name);
                  return (
                    <div key={city.name} className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex items-center justify-between group hover:border-primary/50 transition-all cursor-pointer" onClick={() => { setFilterDistrict(city.name); setActiveTab('manage'); }}>
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-amber-500 text-black' : (idx === 1 ? 'bg-slate-300 text-black' : (idx === 2 ? 'bg-orange-800 text-white' : 'bg-slate-800 text-slate-500'))}`}>{idx + 1}</span>
                        <div>
                          <div className="text-[11px] font-black text-white uppercase tracking-widest">{city.name}</div>
                          <div className="text-[9px] text-slate-500 font-bold uppercase">{city.solved} Resolved</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-primary">{city.score}% Score</div>
                        {improvement !== 0 && (
                          <div className={`text-[9px] font-black uppercase flex items-center gap-1 justify-end mt-1 ${improvement > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {improvement > 0 ? '↗' : '↘'} {Math.abs(improvement)}% {filterTime} Trend
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {cityRanking.length === 0 && <p className="text-slate-600 text-xs italic text-center py-20 uppercase font-black tracking-widest opacity-50">Synchronizing Regional Datasets...</p>}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-4 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Department Rankings */}
            <div className="glass-card p-8 border border-indigo-500/30 bg-gradient-to-br from-slate-900 to-indigo-950/20 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-white flex items-center gap-2">🏆 Dept Performance score</h3>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Ranked by Resolution & Speed</span>
              </div>
              <div className="space-y-4">
                {performances.map((dept, idx) => (
                  <div key={idx} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between group hover:border-indigo-500/50 transition-all">
                    <div className="flex items-center gap-4">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400'}`}>{idx + 1}</span>
                      <div>
                        <div className="text-sm font-black text-white uppercase tracking-widest group-hover:text-primary transition-colors">{dept.department}</div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Avg Speed: <span className="text-emerald-400 font-black">{dept.avgSpeedHrs}h</span> | Resolved: <span className="text-blue-400 font-black">{dept.resolved}</span></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-primary">{dept.score}<span className="text-[10px]"> pts</span></div>
                      {dept.delayed > 0 && <div className="text-[9px] text-red-500 font-black uppercase tracking-tighter animate-pulse flex items-center gap-1 justify-end"><span>🚨 {dept.delayed} OVERDUE</span></div>}
                    </div>
                  </div>
                ))}
                {performances.length === 0 && <p className="text-slate-500 text-center py-10 font-medium italic">No performance metrics generated yet.</p>}
              </div>
            </div>

            {/* Predictive Mapping */}
            <div className="glass-card p-8 border border-emerald-500/30 bg-gradient-to-br from-slate-900 to-emerald-950/10 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-white flex items-center gap-2">📍 Predictive Hotspots</h3>
                <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest animate-pulse">AI Engine Live</span>
              </div>
              <div className="space-y-4">
                {predictions.map((pred, idx) => (
                  <div key={idx} className="bg-slate-900/50 p-5 rounded-xl border border-emerald-500/10 border-l-4 border-l-emerald-500 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-20 transition-opacity">
                      <svg className="w-16 h-16 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5V2a1 1 0 112 0v5a1 1 0 01-1 1h-6z" clipRule="evenodd" /><path d="M16.293 9.293a1 1 0 011.414 1.414l-9 9a1 1 0 01-1.414 0l-5-5a1 1 0 011.414-1.414L7 17.586l8.293-8.293z" /></svg>
                    </div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">{pred.category} Risk</span>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Likelihood: {pred.likelihood}</span>
                        <div className="w-16 h-1 bg-slate-800 rounded-full mt-1"><div className="bg-emerald-500 h-full rounded-full" style={{ width: '90%' }}></div></div>
                      </div>
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed font-bold mb-4">{pred.note}</p>
                    <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        COORD: {pred.grid}
                      </div>
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-tighter bg-slate-800 px-2 py-1 rounded">Exp: {pred.dow}</span>
                    </div>
                  </div>
                ))}
                {predictions.length === 0 && <div className="text-center p-12 text-slate-600 font-black uppercase tracking-widest italic opacity-50">Gathering historical dataset for predictive modeling...</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEATMAP TAB */}
      {activeTab === 'map' && (
        <div className="glass-card p-2 h-[600px] border border-slate-700/50 relative shadow-2xl animate-in slide-in-from-bottom-4 overflow-hidden rounded-2xl">
          <div className="absolute top-6 left-6 z-[1000] bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-2xl pointer-events-none">
            <h4 className="text-white font-black mb-3">Live Risk Mapper</h4>
            <div className="flex flex-col gap-2 text-xs font-bold tracking-widest uppercase">
              <span className="flex items-center gap-3 text-red-400"><div className="w-4 h-4 rounded-full bg-red-500/80 border-2 border-red-400"></div> High Priority</span>
              <span className="flex items-center gap-3 text-amber-400"><div className="w-4 h-4 rounded-full bg-amber-500/80 border-2 border-amber-400"></div> Normal</span>
              <span className="flex items-center gap-3 text-emerald-400"><div className="w-4 h-4 rounded-full bg-emerald-500/80 border-2 border-emerald-400"></div> Resolved</span>
            </div>
            {mapView === 'issues' && (
              <div className="flex flex-col gap-2 text-[10px] font-bold tracking-widest uppercase mb-4">
                <span className="flex items-center gap-3 text-red-400"><div className="w-3 h-3 rounded-full bg-red-500/80 border border-red-400"></div> High Risk</span>
                <span className="flex items-center gap-3 text-amber-400"><div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400"></div> Pending</span>
                <span className="flex items-center gap-3 text-emerald-400"><div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-400"></div> Resolved</span>
              </div>
            )}
            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 pointer-events-auto">
              <button onClick={() => setMapView('issues')} className={`flex-1 px-4 py-1 text-[9px] font-black uppercase tracking-wider rounded transition-all ${mapView === 'issues' ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>📍 Pins</button>
              <button onClick={() => setMapView('city')} className={`flex-1 px-4 py-1 text-[9px] font-black uppercase tracking-wider rounded transition-all ${mapView === 'city' ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>🏢 Cities</button>
            </div>
          </div>

          <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%', width: '100%', background: '#0f172a' }}>
            <DistrictMapFocus filterDistrict={filterDistrict} isDistrictAdmin={isDistrictAdmin} />
            <TileLayer
              attribution="&copy; Google Maps"
              url="https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
            />
            {mapView === 'issues' && filteredIssues.filter(i => i.lat && i.lng).map(issue => {
              let color = '#f59e0b';
              if (issue.status === 'Resolved') color = '#10b981';
              else if (issue.priority === 'High') color = '#ef4444';
              else if (issue.priority === 'Low') color = '#3b82f6';

              return (
                <CircleMarker
                  key={issue.id}
                  center={[Number(issue.lat), Number(issue.lng)]}
                  pathOptions={{ color: color, fillColor: color, fillOpacity: 0.6, weight: 2 }}
                  radius={issue.priority === 'High' ? 12 : 8}
                >
                  <Popup className="custom-popup">
                    <div className="p-1">
                      <b className="text-slate-900 text-sm block mb-1">{issue.title}</b>
                      <span className="text-xs px-2 py-0.5 bg-slate-200 rounded block mb-1 font-mono">{issue.complaint_id}</span>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mt-2">{issue.status} • {issue.department}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {mapView === 'city' && Object.entries(districtCoords).map(([city, coords]) => {
              const cityIssues = issues.filter(i => i.city === city);
              if (cityIssues.length === 0) return null;

              const resolvedCount = cityIssues.filter(i => i.status === 'Resolved').length;
              const pendingCount = cityIssues.filter(i => i.status === 'Pending' || !i.status).length;
              const inProgressCount = cityIssues.filter(i => i.status === 'In Progress').length;
              const highPriorityCount = cityIssues.filter(i => i.priority === 'High' && i.status !== 'Resolved').length;

              return (
                <CircleMarker
                  key={city}
                  center={coords}
                  pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.4, weight: 2 }}
                  radius={Math.min(25, 10 + cityIssues.length / 2)}
                >
                  <Tooltip permanent direction="top" className="custom-tooltip-lite" offset={[0, -10]}>
                    <div className="font-black text-[10px] uppercase">{city}</div>
                  </Tooltip>
                  <Popup className="custom-popup">
                    <div className="p-3 w-48">
                      <h4 className="font-black text-slate-900 uppercase border-b pb-2 mb-3 tracking-widest text-xs">{city} INFRA SCAN</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center bg-slate-100 p-2 rounded">
                          <span className="text-[9px] font-black text-slate-500 uppercase">Total Files</span>
                          <span className="text-sm font-black text-slate-900">{cityIssues.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-emerald-600 uppercase">Resolved</span>
                          <span className="text-xs font-black">{resolvedCount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-blue-600 uppercase">Doing</span>
                          <span className="text-xs font-black">{inProgressCount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-amber-600 uppercase">Waiting</span>
                          <span className="text-xs font-black">{pendingCount}</span>
                        </div>
                        {highPriorityCount > 0 && (
                          <div className="mt-3 bg-red-100 p-2 rounded flex items-center justify-between border border-red-200">
                            <span className="text-[9px] font-black text-red-600 uppercase">🚨 Critical Risks</span>
                            <span className="text-xs font-black text-red-600">{highPriorityCount}</span>
                          </div>
                        )}
                      </div>
                      <button onClick={() => { setFilterDistrict(city); setActiveTab('manage'); }} className="w-full mt-4 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest py-2 rounded hover:bg-slate-800 transition-colors">Inspect Unit ➔</button>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      )}

      {/* MANAGE TAB */}
      {activeTab === 'manage' && (
        <div className="glass-card overflow-hidden border border-slate-700/50 animate-in slide-in-from-bottom-4 shadow-2xl">

          <div className="bg-slate-900/50 p-6 border-b border-slate-700 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  placeholder="Search by ID, User, or Title..."
                  className="input-field pl-10 py-2.5 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <svg className="w-4 h-4 absolute left-3 top-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
              <button
                onClick={handleSync}
                disabled={isRefreshing}
                className="btn px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-black uppercase tracking-widest flex items-center gap-2"
              >
                <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                {isRefreshing ? 'Syncing...' : 'Sync Live Data'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-7 gap-4 pt-2">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-2">Filter Category</label>
                <select className="input-field py-1.5 text-sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                  <option value="All">All Categories</option>
                  {Object.keys(cats).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-2">Filter Priority</label>
                <select className="input-field py-1.5 text-sm" value={filterPri} onChange={e => setFilterPri(e.target.value)}>
                  <option value="All">All Priorities</option>
                  <option value="High">High</option>
                  <option value="Normal">Normal</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-2">Dept Assignment</label>
                <select className="input-field py-1.5 text-sm" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                  <option value="All">All Departments</option>
                  <option value="Unassigned">Unassigned</option>
                  <option value="Roads & Transport">Roads & Transport</option>
                  <option value="Sanitation">Sanitation</option>
                  <option value="Water Supply">Water Supply</option>
                  <option value="Electrical">Electrical</option>
                </select>
              </div>
<div>
  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-2">Filter District</label>
  {isDistrictAdmin ? (
    <div className="input-field py-1.5 text-sm bg-slate-800/50 border-slate-700/50 px-3 flex items-center justify-between cursor-default">
      <span className="font-black text-primary uppercase tracking-wider">{filterDistrict}</span>
      <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">LOCKED</span>
    </div>
  ) : (
    <select
      className="input-field py-1.5 text-sm"
      value={filterDistrict}
      onChange={e => {
        setFilterDistrict(e.target.value);
        setFilterTaluka('All');
      }}>
      <option value="All">All Districts</option>
      {availableDistricts.map(d => <option key={d} value={d}>{d}</option>)}
    </select>
  )}
</div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-2">Filter Taluka</label>
                <select className="input-field py-1.5 text-sm" value={filterTaluka} onChange={e => setFilterTaluka(e.target.value)}>
                  <option value="All">All Talukas</option>
                  {availableTalukas.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-end text-sm text-slate-400 font-bold justify-end pb-2">
                <span className="text-primary mr-1">{filteredIssues.length}</span> matching records
              </div>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left">
              <thead className="bg-slate-800/80">
                <tr>
                  <th className="p-4 text-xs tracking-widest uppercase text-slate-400 font-bold">ID / User</th>
                  <th className="p-4 text-xs tracking-widest uppercase text-slate-400 font-bold w-1/3">Issue Context</th>
                  <th className="p-4 text-xs tracking-widest uppercase text-slate-400 font-bold">Pipeline</th>
                  <th className="p-4 text-xs tracking-widest uppercase text-slate-400 font-bold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredIssues.map(issue => (
                  <React.Fragment key={issue.id}>
                    <tr className="hover:bg-slate-800/20 transition-colors">
                      <td className="p-4">
                        <div className="font-mono text-sm text-emerald-400 font-bold mb-1 flex items-center gap-2">
                          {issue.complaint_id}
                          {issue.is_emergency === 1 && <span className="text-[8px] bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse uppercase tracking-tighter">Emergency</span>}
                        </div>
                        <div className="text-xs text-slate-500">{issue.user?.email || 'Anonymous'}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-white mb-1">{issue.title}</div>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] uppercase tracking-widest bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-slate-300">{issue.category}</span>
                          {issue.media_url && <span className="text-[10px] text-indigo-400 font-bold flex items-center gap-1">📸 Photo Attached</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className={`text-xs inline-block font-bold px-2 py-1 rounded mb-1 ${issue.status === 'Resolved' ? 'bg-emerald-500/20 text-emerald-400' : issue.status === 'In Progress' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-500'}`}>
                          {issue.status || 'Pending'}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                          DP: <span className="text-white">{issue.department || 'None'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => {
                            if (expandedIssue === issue.id) setExpandedIssue(null);
                            else {
                              setExpandedIssue(issue.id);
                              setEditFormData({
                                status: issue.status || 'Pending',
                                priority: issue.priority || 'Normal',
                                department: issue.department || 'Unassigned',
                                remarks: issue.admin_remarks || '',
                                resolution_media_url: issue.resolution_media_url || ''
                              });
                            }
                          }}
                          className={`btn py-1.5 px-3 text-xs ${expandedIssue === issue.id ? 'bg-slate-700 hover:bg-slate-600 shadow-inner' : ''}`}
                        >
                          {expandedIssue === issue.id ? 'Close Panel' : 'Administrate ➔'}
                        </button>
                      </td>
                    </tr>

                    {/* EXPANDED EDIT PANEL */}
                    {expandedIssue === issue.id && (
                      <tr className="bg-slate-900/80 shadow-inner border-l-4 border-l-primary">
                        <td colSpan="4" className="p-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Evidence Context */}
                            <div className="space-y-4">
                              <h4 className="font-black text-white text-[10px] uppercase tracking-widest border-b border-slate-800 pb-2">Visual Evidence</h4>
                              <div className="space-y-2">
                                {issue.media_url ? (
                                  <div className="rounded-lg overflow-hidden border border-slate-700">
                                    <img src={issue.media_url} className="w-full h-32 object-cover opacity-80" alt="Evidence" />
                                    <div className="bg-slate-800 p-2 text-[9px] text-center text-slate-400 uppercase font-black tracking-widest">Initial Report Photo</div>
                                  </div>
                                ) : (
                                  <div className="bg-slate-800 p-4 rounded-lg border border-dashed border-slate-700 text-center text-[10px] text-slate-500 font-bold uppercase py-10">No Photo Attached</div>
                                )}

                                {issue.resolution_media_url && (
                                  <div className="rounded-lg overflow-hidden border border-emerald-500/30">
                                    <img src={issue.resolution_media_url} className="w-full h-32 object-cover" alt="Resolution" />
                                    <div className="bg-emerald-900/50 p-2 text-[9px] text-center text-emerald-400 uppercase font-black tracking-widest">Resolution Proof</div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-4">
                              <h4 className="font-black text-white text-[10px] uppercase tracking-widest border-b border-slate-800 pb-2">Control Matrix</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block mb-1">Status</label>
                                  <select className="input-field py-1.5 text-sm" value={editFormData.status} onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}>
                                    <option value="Pending">🟡 Pending</option>
                                    <option value="In Progress">🔵 In Progress</option>
                                    <option value="Resolved">🟢 Resolved</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block mb-1">Priority</label>
                                  <select className="input-field py-1.5 text-sm" value={editFormData.priority} onChange={e => setEditFormData({ ...editFormData, priority: e.target.value })}>
                                    <option value="Low">Low</option>
                                    <option value="Normal">Normal</option>
                                    <option value="High">High ⚠️</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block mb-1">Assign Department</label>
                                <select className="input-field py-1.5 text-sm" value={editFormData.department} onChange={e => setEditFormData({ ...editFormData, department: e.target.value })}>
                                  <option value="Unassigned">Leave Unassigned</option>
                                  <option value="Roads & Transport">Roads & Transport</option>
                                  <option value="Sanitation">Sanitation / Waste</option>
                                  <option value="Water Supply">Water Supply / sewage</option>
                                  <option value="Electrical">Electrical Grid</option>
                                </select>
                              </div>

                              {(editFormData.status === 'Resolved' || editFormData.status === 'In Progress') && (
                                <div className="space-y-3">
                                  <label className="text-[10px] text-emerald-400 uppercase tracking-widest font-black block mb-1">Official Resolution Evidence</label>

                                  <div className="flex gap-2">
                                    <input
                                      className="flex-1 input-field py-1.5 text-xs bg-emerald-500/5 border-emerald-500/20"
                                      placeholder="https://image-url.com"
                                      value={editFormData.resolution_media_url}
                                      onChange={e => setEditFormData({ ...editFormData, resolution_media_url: e.target.value })}
                                    />
                                    <label className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                                      <span>Upload</span>
                                      <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files[0];
                                          if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => setEditFormData({ ...editFormData, resolution_media_url: reader.result });
                                            reader.readAsDataURL(file);
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>
                                  <p className="text-[9px] text-slate-500 italic">Select a photo from your device or paste a URL to provide proof of resolution.</p>
                                </div>
                              )}
                            </div>

                            <div className="space-y-4 flex flex-col h-full">
                              <div>
                                <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block mb-1 flex items-center justify-between">
                                  <span>Official Admin Remarks</span>
                                </label>
                                <textarea
                                  className="input-field text-xs h-24 resize-none"
                                  placeholder="Enter action taken, schedules, or public notices..."
                                  value={editFormData.remarks}
                                  onChange={e => setEditFormData({ ...editFormData, remarks: e.target.value })}
                                />
                              </div>
                              <div className="mt-auto pt-4 flex justify-end">
                                <button onClick={() => handleUpdateIssue(issue.id)} disabled={saving} className="btn px-8 flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                                  {saving ? 'Processing...' : <>Update System <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg></>}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {filteredIssues.length === 0 && <div className="text-center p-12 text-slate-500">No records found matching these parameters.</div>}
          </div>
        </div>
      )}

      {/* ADMINS TAB */}
      {activeTab === 'admins' && isMasterAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4">
          <div className="lg:col-span-4">
            <div className="glass-card p-8 border border-primary/30 shadow-2xl">
              <h3 className="text-xl font-black text-white mb-6 uppercase tracking-widest flex items-center gap-2">➕ Register Admin</h3>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest font-black block mb-1.5">Full Name</label>
                  <input type="text" className="input-field py-2.5 text-sm" required value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} placeholder="District Official Name" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest font-black block mb-1.5">Official Email</label>
                  <input type="email" className="input-field py-2.5 text-sm" required value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} placeholder="name@district.gov.in" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest font-black block mb-1.5">Security Password</label>
                  <input type="password" minLength="6" className="input-field py-2.5 text-sm" required value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="••••••••" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest font-black block mb-1.5">Assigned District</label>
                  <select className="input-field py-2.5 text-sm" required value={adminForm.department} onChange={e => setAdminForm({ ...adminForm, department: e.target.value })}>
                    <option value="">Select District</option>
                    {availableDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="State Headquarters">State Headquarters</option>
                  </select>
                </div>
                <button type="submit" disabled={addingAdmin} className="btn w-full mt-4 font-black py-4 uppercase tracking-[0.2em] text-xs">
                  {addingAdmin ? 'Authorizing...' : 'Provision Account ➔'}
                </button>
              </form>
              <p className="text-[9px] text-slate-500 italic mt-6 text-center">New administrators will have full access to manage reports for their assigned districts.</p>
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="glass-card p-8 border border-slate-700/50 min-h-[500px]">
              <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">🛡️ Authorized Admin Network</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Active administrative sessions and district identifiers</p>
                </div>
                <div className="bg-slate-800 px-3 py-1 rounded text-[10px] font-black text-primary border border-primary/20">{adminUsers.length} TOTAL SESSIONS</div>
              </div>

              <div className="space-y-4">
                {adminUsers.map(adm => (
                  <div key={adm.id} className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex items-center justify-between group hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-xl shadow-inner border border-slate-700">
                        {adm.id === 'MASTER-ADMIN' ? '🏛️' : '👤'}
                      </div>
                      <div>
                        <div className="text-sm font-black text-white uppercase tracking-widest">{adm.name}</div>
                        <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-1">
                          <span className="text-secondary">{adm.email}</span>
                          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[8px] border border-primary/20">{adm.department || 'General'}</span>
                        </div>
                      </div>
                    </div>
                    {adm.id !== 'MASTER-ADMIN' && isMasterAdmin && (
                      <button onClick={() => handleDeleteAdmin(adm.id)} className="opacity-0 group-hover:opacity-100 btn bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all">
                        Revoke Access
                      </button>
                    )}
                  </div>
                ))}
                {adminUsers.length === 0 && <div className="text-center py-20 text-slate-600 font-black uppercase tracking-widest italic opacity-50">Checking administrative pulse...</div>}
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'admins' && !isMasterAdmin && (
        <div className="glass-card p-12 text-center animate-in fade-in">
          <div className="text-6xl mb-8 opacity-20">🔒</div>
          <h3 className="text-2xl font-black text-slate-400 mb-4 uppercase tracking-widest">District Admin Restricted</h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto leading-relaxed">Contact State Headquarters (gov@city.org) to manage district administrator accounts. District admins can manage issues in their assigned department.</p>
          <button onClick={() => setActiveTab('overview')} className="btn bg-slate-800 hover:bg-slate-700 px-8 py-3 font-black uppercase tracking-wider text-sm">← Back to Overview</button>
        </div>
      )}
    </div>
  );
}
