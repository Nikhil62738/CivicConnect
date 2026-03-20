import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { maharashtraDistricts } from './constants';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import IssueTracker from './IssueTracker';
import NotificationBell from './NotificationBell';
import AdminDashboard from './AdminDashboard';
import Login from './Login';
import Register from './Register';
import UserProfile from './UserProfile';

// Fix for default marker icons in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const defaultCenter = [20.5937, 78.9629]; // India geographic center

// Maharashtra districts and their talukas
// Maharashtra districts and their talukas are now imported from constants.js

// Component to handle map clicks with BOUNDARY ENFORCEMENT
function LocationSelector({ formData, setFormData }) {
  const map = useMap();

  useMapEvents({
    async click(e) {
      if (!formData.city) {
        alert("Please select a District first to lock the reporting area.");
        return;
      }

      const { lat, lng } = e.latlng;

      try {
        // Reverse geocoding to verify boundaries
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
        const data = await res.json();

        // Extract all possible location hints for universal matching
        const addr = data.address || {};
        const granularLoc = addr.suburb || addr.village || addr.city || addr.town || addr.hamlet || "";

        // Normalize selections for comparison
        const normSelected = formData.city.toLowerCase().replace(/ district| taluka/g, '').trim();
        const normGranular = granularLoc.toLowerCase().trim();

        // UNIVERSAL VALIDATION LOGIC:
        // 1. Scan EVERY field in the address for a match with the selected district
        let isInside = Object.values(addr).some(val => {
            if (typeof val !== 'string') return false;
            const normVal = val.toLowerCase().replace(/ district| taluka/g, '').trim();
            return normVal.includes(normSelected) || normSelected.includes(normVal);
        });
        
        // 2. TIER 2 FALLBACK: Check if the specific town is a known Taluka in our constants
        if (!isInside && granularLoc) {
            const validTalukas = maharashtraDistricts[formData.city] || [];
            isInside = validTalukas.some(t => t.toLowerCase() === normGranular);
        }

        // 3. TIER 3 FALLBACK: Special case for Mumbai areas which are complex in OSM
        if (!isInside && normSelected.includes("mumbai")) {
            isInside = Object.values(addr).some(val => String(val).toLowerCase().includes("mumbai"));
        }

        if (!isInside) {
          const detectedLoc = granularLoc || addr.county || addr.state_district || "an area outside your selected district";
          alert(`Boundary Alert: You can only report issues within ${formData.city}. Your current pin is in ${detectedLoc}. Please select location in that area.`);
          return;
        }

        setFormData(prev => ({
          ...prev,
          lat: lat,
          lng: lng
        }));
      } catch (err) {
        // If geocoding fails, we allow the pin but log it (safety fallback)
        console.warn("Boundary validation skipped due to network error");
        setFormData(prev => ({ ...prev, lat: lat, lng: lng }));
      }
    },
  });

  return formData.lat && formData.lng ? (
    <Marker position={[formData.lat, formData.lng]} />
  ) : null;
}

// Helper component to auto-fly map to selected area
function MapFocusManager({ city, village }) {
  const map = useMap();

  useEffect(() => {
    if (!city) return;

    const geocodeArea = async () => {
      try {
        // Using structured search for maximum precision within administrative boundaries
        const baseUrl = "https://nominatim.openstreetmap.org/search?format=json&limit=1&country=India&state=Maharashtra";
        let queryUrl = `${baseUrl}&county=${encodeURIComponent(city)}`;

        if (village) {
          queryUrl += `&city=${encodeURIComponent(village)}`;
        }

        const res = await fetch(queryUrl);
        const data = await res.json();

        if (data && data.length > 0) {
          const { lat, lon } = data[0];
          // District level: Zoom 11 | Taluka level: Zoom 14 for detail
          map.flyTo([lat, lon], village ? 14 : 11, { animate: true, duration: 2.5 });
        } else if (village) {
          // Fallback: If taluka search fails, revert to district center
          const districtRes = await fetch(`${baseUrl}&county=${encodeURIComponent(city)}`);
          const districtData = await districtRes.json();
          if (districtData && districtData.length > 0) {
            map.flyTo([districtData[0].lat, districtData[0].lon], 11, { animate: true });
          }
        }
      } catch (err) {
        console.error("Precise auto-focus failed", err);
      }
    };

    geocodeArea();
  }, [city, village, map]);

  return null;
}

function GpsButton({ setFormData }) {
  const map = useMap();
  const [loading, setLoading] = useState(false);

  const handleGps = (e) => {
    e.preventDefault();
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      setFormData(prev => ({ ...prev, lat: latitude, lng: longitude }));
      map.flyTo([latitude, longitude], 16, { animate: true });
      setLoading(false);
    }, (err) => {
      console.error(err);
      alert("Unable to retrieve your location. Please check browser permissions.");
      setLoading(false);
    });
  };

  return (
    <button
      onClick={handleGps}
      type="button"
      className="absolute top-4 right-4 z-[1000] bg-white text-slate-900 p-2.5 rounded-lg shadow-xl hover:bg-slate-100 outline-none focus:ring-2 focus:ring-primary transition-colors flex items-center justify-center group"
      title="Use my location"
    >
      {loading ? (
        <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      ) : (
        <svg className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
      )}
    </button>
  );
}

const i18n = {
  en: {
    title: "CivicConnect", reportIssue: "Report Issue", trackIssues: "Track Issues", myHistory: "My History", welcome: "Welcome", logout: "Logout", login: "Login", register: "Register", makeCity: "Make Your City", better: "Better", desc: "Report local infrastructure issues directly to your government administration. Pinpoint the exact location on the map and help improve your community.", issuesFixed: "Issues Fixed", avgResponse: "Avg Response", reportNew: "Report a New Issue", issueTitle: "Issue Title", category: "Category", uploadMedia: "Upload Media", description: "Description", location: "Location Pinpoint", submit: "Submit Report", submitting: "Submitting...", offlineAlert: "Saved Offline! Will sync when connected."
  },
  hi: {
    title: "नागरिक संपर्क", reportIssue: "समस्या दर्ज करें", trackIssues: "समस्याएं ट्रैक", myHistory: "मेरा इतिहास", welcome: "स्वागत है", logout: "लॉग आउट", login: "लॉग इन", register: "पंजीकरण", makeCity: "अपना शहर बनाएं", better: "बेहतर", desc: "स्थानीय बुनियादी ढांचे की समस्याओं की रिपोर्ट सीधे अपने सरकारी प्रशासन को करें। मानचित्र पर सटीक स्थान पिनपॉइंट करें और अपने समुदाय को बेहतर बनाने में मदद करें।", issuesFixed: "समस्याएं हल हुईं", avgResponse: "औसत प्रतिक्रिया", reportNew: "नई समस्या दर्ज करें", issueTitle: "समस्या का शीर्षक", category: "श्रेणी", uploadMedia: "मीडिया अपलोड करें", description: "विवरण", location: "स्थान पिनपॉइंट करें", submit: "रिपोर्ट सबमिट करें", submitting: "सबमिट कर रहा है...", offlineAlert: "ऑफ़लाइन सेव किया गया! कनेक्ट होने पर सिंक होगा।"
  },
  mr: {
    title: "नागरिक संपर्क", reportIssue: "समस्या नोंदवा", trackIssues: "समस्या ट्रॅक करा", myHistory: "माझा इतिहास", welcome: "स्वागत आहे", logout: "लॉगआउट", login: "लॉगिन", register: "नोंदणी", makeCity: "तुमचे शहर बनवा", better: "चांगले", desc: "स्थानिक पायाभूत सुविधांच्या समस्या थेट तुमच्या सरकारी प्रशासनाला कळवा. नकाशावर अचूक स्थान पिनपॉइंट करा आणि तुमचा समुदाय सुधारण्यास मदत करा.", issuesFixed: "समस्या सोडवल्या", avgResponse: "सरासरी प्रतिसाद", reportNew: "नवीन समस्या नोंदवा", issueTitle: "समस्येचे शीर्षक", category: "श्रेणी", uploadMedia: "माध्यम अपलोड करा", description: "वर्णन", location: "स्थान पिनपॉइंट करा", submit: "अहवाल सबमिट करा", submitting: "सबमिट करत आहे...", offlineAlert: "ऑफलाइन जतन केले! कनेक्ट झाल्यावर सिंक होईल."
  }
};

const CivicChatbot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'bot', text: "Hello! I'm your Smart Civic Assistant. Ask me how to report issues or about points!" }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.start();
    setIsListening(true);

    let finalTranscript = '';
    let silenceTimer = null;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const currentText = finalTranscript + interimTranscript;
      setInput(currentText);

      // Reset the 5-second silence timer every time the user speaks
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (currentText.trim()) {
          recognition.stop();
          sendMessage(currentText);
        }
      }, 5000);
    };

    recognition.onerror = () => { setIsListening(false); if (silenceTimer) clearTimeout(silenceTimer); };
    recognition.onend = () => { setIsListening(false); if (silenceTimer) clearTimeout(silenceTimer); };
  };

  const sendMessage = async (overrideInput) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim()) return;
    const userMsg = { role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.text })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.response }]);
      speak(data.response);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'bot', text: "I'm having trouble connecting. Is the server running?" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999]">
      {open ? (
        <div className="glass-card w-80 h-[450px] flex flex-col shadow-2xl animate-in slide-in-from-bottom-10 duration-500 overflow-hidden border-indigo-500/30">
          <div className="bg-gradient-to-r from-indigo-600 to-primary p-4 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center animate-pulse">🤖</div>
              <h3 className="text-white font-black text-xs uppercase tracking-widest">Voice Assistant</h3>
            </div>
            <button onClick={() => { setOpen(false); window.speechSynthesis.cancel(); }} className="text-white hover:text-indigo-200 text-lg">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/40 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed shadow-lg ${m.role === 'user' ? 'bg-primary text-white font-bold rounded-tr-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && <div className="text-[10px] text-slate-500 font-bold animate-pulse flex items-center gap-2"><span>Thinking...</span><div className="w-1 h-1 bg-primary rounded-full animate-ping"></div></div>}
          </div>
          <div className="p-4 bg-slate-900/60 border-t border-slate-700/50 flex gap-2 items-center">
            <div className="relative flex-1">
              <input
                type="text"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary h-10"
                placeholder="Talk to me..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && sendMessage()}
              />
              <button
                onClick={startVoice}
                className={`absolute right-2 top-1.5 p-1 rounded-md transition-all ${isListening ? 'bg-red-500 text-white animate-pulse shadow-red-500/50 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
              </button>
            </div>
            <button onClick={() => sendMessage()} className="bg-primary text-white p-2.5 rounded-lg hover:scale-110 active:scale-90 transition-transform shadow-lg shadow-primary/20 shrink-0">
              <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-primary rounded-full shadow-2xl flex items-center justify-center text-3xl hover:scale-110 active:scale-95 transition-all group relative border-4 border-slate-900"
        >
          <div className="absolute -top-2 -right-2 bg-indigo-500 text-[10px] font-black text-white px-2 py-0.5 rounded-full animate-bounce shadow-lg">Voice</div>
          🤖
        </button>
      )}
    </div>
  );
};

const UserHistory = ({ onActivity }) => {
  const [myIssues, setMyIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingIssue, setEditingIssue] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    title: '',
    category: '',
    description: '',
    city: '',
    village: '',
    is_emergency: false,
    media: null
  });

  const categories = ['pothole', 'garbage', 'water', 'streetlight', 'flood', 'fire', 'other'];
  const categoryLabels = {
    pothole: 'Potholes',
    garbage: 'Garbage collection',
    water: 'Water leakage',
    streetlight: 'Streetlight not working',
    flood: 'Flood',
    fire: 'Fire',
    other: 'Other'
  };

  const fetchMyIssues = async ({ showSpinner = false } = {}) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMyIssues([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showSpinner) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetch('http://localhost:5000/api/user/my-issues', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setMyIssues(Array.isArray(data.issues) ? data.issues : []);
    } catch (e) {
      console.error(e);
      setMyIssues([]);
    } finally {
      if (showSpinner) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMyIssues({ showSpinner: true });
  }, []);

  if (loading) return (
    <div className="max-w-4xl mx-auto py-24 px-6 text-center">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
      <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs">Retrieving Your Archive...</p>
    </div>
  );

  const closeEditor = () => {
    setEditingIssue(null);
    setUpdateForm({ title: '', category: '', description: '', is_emergency: false, media: null });
  };

  const openEditorForIssue = (issue) => {
    setEditingIssue(issue);
    setUpdateForm({
      title: issue.title || '',
      category: issue.category || 'other',
      description: issue.description || '',
      city: issue.city || '',
      village: issue.village || '',
      is_emergency: issue.is_emergency === 1,
      media: null
    });
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!editingIssue) return;

    const token = localStorage.getItem('token');
    if (!token) return alert('Please login again.');

    if (!updateForm.title.trim()) return alert('Title is required.');
    if (!updateForm.description.trim()) return alert('Description is required.');
    if (!updateForm.category) return alert('Category is required.');

    setIsUpdating(true);
    try {
      let mediaUrl = null;
      if (updateForm.media) {
        const reader = new FileReader();
        mediaUrl = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(updateForm.media);
        });
      }

      const payload = {
        title: updateForm.title.trim(),
        category: updateForm.category,
        description: updateForm.description.trim(),
        city: updateForm.city,
        village: updateForm.village,
        is_emergency: updateForm.is_emergency
      };
      if (mediaUrl) payload.media_url = mediaUrl;

      const res = await fetch(`http://localhost:5000/api/issues/${editingIssue.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      closeEditor();
      await fetchMyIssues();
      if (onActivity) onActivity(); // Sync global leaderboard
    } catch (err) {
      alert(err.message || 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (issueId) => {
    if (!window.confirm('Delete this report? This cannot be undone.')) return;

    const token = localStorage.getItem('token');
    if (!token) return alert('Please login again.');

    try {
      const res = await fetch(`http://localhost:5000/api/issues/${issueId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      await fetchMyIssues();
      if (onActivity) onActivity(); // Sync global leaderboard
    } catch (err) {
      alert(err.message || 'Delete failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-4xl font-black text-white relative">
            My History
            <div className="absolute -bottom-2 left-0 w-12 h-1.5 bg-primary rounded-full"></div>
          </h2>
          <p className="text-slate-400 mt-4 font-medium tracking-wide">Tracking your personal contributions to urban excellence.</p>
        </div>
        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 text-center shadow-xl">
          <div className="text-3xl font-black text-primary">{myIssues.length}</div>
          <div className="text-[8px] uppercase font-black text-slate-500 tracking-widest mt-1">Total Reports</div>
        </div>
      </div>

      <div className="space-y-6">
        {myIssues.map(issue => (
          <div key={issue.id} className="glass-card p-8 border border-slate-700/30 hover:border-primary/40 transition-all flex flex-col md:flex-row gap-8 group shadow-2xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full ${issue.status === 'Resolved' ? 'bg-emerald-500' : issue.is_escalated ? 'bg-indigo-500' : 'bg-amber-500'}`}></div>

            <div className="flex-1">
              <div className="flex flex-wrap gap-2 items-center mb-4">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg">ID: {issue.complaint_id}</span>
                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border ${issue.status === 'Resolved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                  {issue.status}
                </span>
                {issue.is_escalated === 1 && <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 animate-pulse">⚖️ Escalated</span>}
              </div>

              <h3 className="text-2xl font-black text-white mb-2 group-hover:text-primary transition-colors">{issue.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed line-clamp-2 mb-6 font-medium">{issue.description}</p>

              {issue.admin_remarks && (
                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 mb-6 shadow-inner relative">
                  <div className="text-[8px] font-black text-primary uppercase tracking-[0.2em] mb-2">🏛️ Official Administration Note</div>
                  <p className="text-xs text-slate-300 italic font-medium leading-relaxed">"{issue.admin_remarks}"</p>
                </div>
              )}

              <div className="flex items-center gap-6 pt-4 border-t border-slate-800/50 w-full">
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  {new Date(issue.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                  <svg className="w-3.5 h-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.162-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" /></svg>
                  {issue.upvotes || 0} Citizens Supported
                </div>

                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => openEditorForIssue(issue)}
                    disabled={isUpdating}
                    className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-primary/30 text-primary bg-primary/10 hover:bg-primary/20 transition-all active:scale-95 disabled:opacity-60"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(issue.id)}
                    disabled={isUpdating}
                    className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all active:scale-95 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {issue.media_url && (
              <div className="w-full md:w-48 h-48 rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl relative group-hover:scale-[1.02] transition-transform duration-500">
                <img src={issue.media_url} className="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" alt="Report Content" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-bottom p-4">
                  <div className="mt-auto text-[8px] font-black uppercase tracking-widest text-white/60">Evidence Provided</div>
                </div>
              </div>
            )}
          </div>
        ))}

        {myIssues.length === 0 && (
          <div className="bg-slate-900/40 rounded-[2rem] p-20 text-center border border-dashed border-slate-800 shadow-2xl">
            <div className="text-6xl mb-6 opacity-20">🗄️</div>
            <h4 className="text-white font-black text-xl mb-2">No Archives Found</h4>
            <p className="text-slate-500 font-medium mb-8 max-w-xs mx-auto text-sm">Your reporting history is empty. Start contributing to make your city better.</p>
            <button className="btn px-10 py-3 text-xs font-black uppercase tracking-widest shadow-primary/20" onClick={() => window.location.reload()}>New Report</button>
          </div>
        )}
      </div>

      {editingIssue && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-2xl p-6 border-primary/30 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-white">Update Report</h3>
              <button
                type="button"
                onClick={closeEditor}
                className="text-slate-300 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400">Title</label>
                  <input
                    className="input-field"
                    type="text"
                    value={updateForm.title}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400">Category</label>
                  <select
                    className="input-field bg-slate-900"
                    value={updateForm.category}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, category: e.target.value }))}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400">District</label>
                  <select
                    className="input-field bg-slate-900"
                    value={updateForm.city}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, city: e.target.value, village: '' }))}
                  >
                    <option value="">Select District</option>
                    {Object.keys(maharashtraDistricts).sort().map(district => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400">Taluka</label>
                  <select
                    className="input-field bg-slate-900"
                    value={updateForm.village}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, village: e.target.value }))}
                    disabled={!updateForm.city}
                  >
                    <option value="">Select Taluka</option>
                    {updateForm.city && maharashtraDistricts[updateForm.city]?.map(taluka => (
                      <option key={taluka} value={taluka}>{taluka}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Description</label>
                <textarea
                  className="input-field resize-none h-28"
                  value={updateForm.description}
                  onChange={(e) => setUpdateForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                />
              </div>

              <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/60 p-3 rounded-xl">
                <div className="flex flex-col">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Emergency Reporting</span>
                  <span className="text-[10px] text-slate-500 mt-1">Flags report as highest priority.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={updateForm.is_emergency}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, is_emergency: e.target.checked }))}
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Update Media (optional)</label>
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => setUpdateForm(prev => ({ ...prev, media: e.target.files[0] || null }))}
                      className="block w-full text-xs text-slate-300 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-indigo-500 cursor-pointer"
                    />
                  </div>
                  {editingIssue.media_url && !updateForm.media && (
                    <img
                      src={editingIssue.media_url}
                      alt="Current media"
                      className="w-full md:w-28 h-20 md:h-20 object-cover rounded-xl border border-slate-800"
                    />
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="btn flex-1 bg-slate-700 hover:bg-slate-600 text-white"
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn flex-1 bg-primary hover:bg-indigo-500 text-white font-black uppercase tracking-widest"
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
            {refreshing && (
              <div className="mt-3 text-[10px] text-slate-500 text-center">Refreshing your history...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [lang, setLang] = useState('en');
  const t = i18n[lang];
  const [offlineQueue, setOfflineQueue] = useState(() => JSON.parse(localStorage.getItem('offlineQueue') || '[]'));
  const [currentView, setCurrentView] = useState('report');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [lastComplaintId, setLastComplaintId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    description: '',
    lat: null,
    lng: null,
    city: '',
    state: '',
    village: '',
    media: null,
    is_emergency: false
  });

  const [aiParsing, setAiParsing] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [isListeningDescription, setIsListeningDescription] = useState(false);
  const [globalIssues, setGlobalIssues] = useState([]);
  const [counts, setCounts] = useState({ fixed: 0, avg: '24h' });
  const [smartSuggestions, setSmartSuggestions] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);

  const fetchGlobalData = async () => {
    if (globalIssues.length === 0) setGlobalLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/issues');
      const data = await res.json();
      const issues = data.issues || [];
      setGlobalIssues(issues);

      const fixed = issues.filter(i => i.status === 'Resolved').length;
      const labs = issues.filter(i => i.resolved_at && i.created_at).map(i => new Date(i.resolved_at) - new Date(i.created_at));
      const avgVal = labs.length > 0 ? (labs.reduce((a, b) => a + b, 0) / labs.length / (1000 * 60 * 60)).toFixed(1) + 'h' : '24h';

      setCounts({ fixed, avg: avgVal });
    } catch (e) {
      console.error("Global data fetch failed", e);
    } finally {
      setGlobalLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalData();
    const interval = setInterval(fetchGlobalData, 10000);
    return () => clearInterval(interval);
  }, []);

  const cityRanking = useMemo(() => {
    return Object.entries(maharashtraDistricts)
      .map(([name]) => {
        const cityIssues = globalIssues.filter(i => i.city === name);
        const solved = cityIssues.filter(i => i.status === 'Resolved').length;
        const rate = cityIssues.length > 0 ? solved / cityIssues.length : 0;
        const userDistrict = user ? globalIssues.some(i => i.city === name && (i.user_id === user.id || i.user?.email === user.email)) : false;

        return {
          name,
          score: Math.round(rate * 100),
          solved,
          total: cityIssues.length,
          userReported: userDistrict
        };
      })
      .sort((a, b) => 
        b.score - a.score || 
        (b.userReported - a.userReported) || 
        b.solved - a.solved ||
        a.name.localeCompare(b.name)
      )
      .slice(0, 5);
  }, [globalIssues, user]);

  // --- DUPLICATE DETECTION CHECKER ---
  useEffect(() => {
    if (formData.lat && formData.lng && formData.category && currentView === 'report') {
      const checkNearby = async () => {
        setCheckingDuplicates(true);
        try {
          const res = await fetch(`http://localhost:5000/api/issues/check-duplicates?lat=${formData.lat}&lng=${formData.lng}&category=${formData.category}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          setDuplicates(data.duplicates || []);
        } catch (e) {
          console.error("Duplicate check failed", e);
        } finally {
          setCheckingDuplicates(false);
        }
      };

      const fetchSuggestions = async () => {
        try {
          const res = await fetch(`http://localhost:5000/api/smart-suggestions?lat=${formData.lat}&lng=${formData.lng}&radius=1`);
          const data = await res.json();
          setSmartSuggestions(data.suggestions || []);
        } catch (e) {
          console.error("Smart suggestions failed", e);
        }
      };

      const delayDebounceFn = setTimeout(() => {
        checkNearby();
        fetchSuggestions();
      }, 1000);

      return () => clearTimeout(delayDebounceFn);
    } else {
      setDuplicates([]);
      setSmartSuggestions([]);
    }
  }, [formData.lat, formData.lng, formData.category, currentView]);

  // --- VOICE TO TEXT (DESCRIPTION) ---
  const startDescriptionVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech recognition not supported");

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'en' ? 'en-US' : lang === 'hi' ? 'hi-IN' : 'mr-IN';
    recognition.start();
    setIsListeningDescription(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setFormData(prev => ({ ...prev, description: prev.description + (prev.description ? ' ' : '') + transcript }));
    };

    recognition.onend = () => setIsListeningDescription(false);
  };

  // Offline Sync Worker
  useEffect(() => {
    const syncOffline = async () => {
      if (!navigator.onLine || offlineQueue.length === 0) return;
      const storedToken = localStorage.getItem('token');
      if (!storedToken) return;

      const remaining = [];
      let syncedCount = 0;
      for (const item of offlineQueue) {
        try {
          const res = await fetch('http://localhost:5000/api/issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${storedToken}` },
            body: JSON.stringify(item)
          });
          if (res.ok) syncedCount++;
          else remaining.push(item);
        } catch (e) {
          remaining.push(item);
        }
      }
      if (syncedCount > 0) {
        setOfflineQueue(remaining);
        localStorage.setItem('offlineQueue', JSON.stringify(remaining));
      }
    };

    window.addEventListener('online', syncOffline);
    const interval = setInterval(syncOffline, 15000);
    return () => {
      window.removeEventListener('online', syncOffline);
      clearInterval(interval);
    };
  }, [offlineQueue]);

  // Check for existing authentication on app load
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    const storedLoginType = localStorage.getItem('loginType');

    if (storedToken && storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setToken(storedToken);

      // Set initial view based on stored data
      if (storedLoginType === 'admin' && parsedUser.role === 'admin') {
        setCurrentView('admin');
      } else {
        setCurrentView('report');
      }

      // Verify role with server to prevent localStorage spoofing
      fetch('http://localhost:5000/api/user/profile', {
        headers: { 'Authorization': `Bearer ${storedToken}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.user) {
            setUser(data.user);
            localStorage.setItem('user', JSON.stringify(data.user));
            // If they were trying to see admin but aren't one, kick them out
            if (data.user.role !== 'admin' && currentView === 'admin') {
              setCurrentView('report');
            }
          } else {
            handleLogout();
          }
        })
        .catch(() => {
          // If offline, trust local role but we've already set it
        });
    }
    setAuthLoading(false);
  }, []);

  const handleLogin = (userData, userToken, loginType) => {
    setUser(userData);
    setToken(userToken);
    // If Admin -> Admin Panel, If Citizen -> Track Issues Page (User Panel)
    const target = userData.role === 'admin' ? 'admin' : 'track';
    setCurrentView(target);
    localStorage.setItem('loginType', userData.role);
  };

  const handleRegister = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('loginType', 'user');
    setCurrentView('report');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginType');
    setUser(null);
    setToken(null);
    setCurrentView('login');
  };

  const handleMediaUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFormData(prev => ({ ...prev, media: file }));

    if (file.type.startsWith('image/')) {
      setAiParsing(true);
      setAiResult(null);

      try {
        // ML Image Detection using Google ViT via public HuggingFace Interface
        const response = await fetch(
          "https://api-inference.huggingface.co/models/google/vit-base-patch16-224",
          { method: "POST", body: file }
        );
        const result = await response.json();

        if (result && Array.isArray(result) && result.length > 0) {
          const topLabel = result[0].label.toLowerCase();
          const allLabels = result.map(r => r.label.toLowerCase()).join(' ');

          let detected = 'other';
          let severity = 'Medium';

          if (allLabels.match(/garbage|trash|waste|debris|bottle|can|wrapper|dump|plastic/)) detected = 'garbage';
          else if (allLabels.match(/crack|pothole|road|street|asphalt|pavement|hole/)) {
            detected = 'pothole';
            // Heuristic for severity
            if (allLabels.match(/deep|large|major|dangerous|crater/)) severity = 'High';
          }
          else if (allLabels.match(/water|puddle|leak|liquid|pipe/)) detected = 'water';
          else if (allLabels.match(/light|pole|lamp|street sign|electricity/)) detected = 'streetlight';

          setFormData(prev => ({ ...prev, category: detected, severity: severity }));
          setAiResult({ label: topLabel, detectedCat: detected, severity, confidence: Math.round(result[0].score * 100) });
        } else {
          throw new Error("Invalid ML result");
        }
      } catch (e) {
        console.warn("ML Detection failed, relying on manual selection", e);
        const name = file.name.toLowerCase();

        // Fallback parsing heuristics if external AI hits rate limits naturally
        let detected = 'other';
        let severity = 'Medium';
        if (name.match(/garbage|trash|waste|debris|bottle|can|wrapper|dump|plastic/)) detected = 'garbage';
        else if (name.match(/crack|pothole|road|street|asphalt|pavement|hole/)) {
          detected = 'pothole';
          if (name.match(/major|high|big/)) severity = 'High';
        }
        else if (name.match(/water|puddle|leak|liquid|pipe/)) detected = 'water';

        if (detected !== 'other') {
          setFormData(prev => ({ ...prev, category: detected, severity: severity }));
          setAiResult({ label: 'Heuristic Extracted', detectedCat: detected, severity, confidence: 99 });
        }
      } finally {
        setAiParsing(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.lat || !formData.lng) {
      alert("Please select a location on the map.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Convert media file to base64 if it exists
      let mediaUrl = null;
      if (formData.media) {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(formData.media);
        });
        mediaUrl = await base64Promise;
      }

      const safePayload = {
        title: formData.title,
        category: formData.category,
        description: formData.description,
        lat: formData.lat,
        lng: formData.lng,
        city: formData.city,
        state: formData.state,
        village: formData.village,
        is_emergency: formData.is_emergency,
        media_url: mediaUrl
      };

      if (!navigator.onLine) {
        const newQueue = [...offlineQueue, safePayload];
        setOfflineQueue(newQueue);
        localStorage.setItem('offlineQueue', JSON.stringify(newQueue));
        setFormData({ title: '', category: '', description: '', lat: null, lng: null, city: '', state: 'Maharashtra', village: '', media: null, is_emergency: false });
        setIsSubmitting(false);
        alert(t.offlineAlert);
        return;
      }

      const response = await fetch('http://localhost:5000/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(safePayload)
      });

      if (response.ok) {
        const data = await response.json();
        setFormData({ title: '', category: '', description: '', lat: null, lng: null, city: '', state: 'Maharashtra', village: '', media: null, is_emergency: false });
        setLastComplaintId(data.complaint_id);
        setShowSuccess({ show: true, complaintId: data.complaint_id });

        // Refresh global rankings immediately after submission
        fetchGlobalData();
      } else {
        const errorData = await response.json();
        alert(`Server Error: ${errorData.error || "Failed to report issue"}`);
      }
    } catch (error) {
      console.error(error);
      alert(`Network Error: Cannot reach backend on port 5000. Is Node.js running? (${error.message})`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-900 text-slate-100 font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/20 blur-[120px] pointer-events-none"></div>

      {currentView !== 'admin' ? (
        <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/60 border-b border-slate-700/50">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary flex items-center gap-4">
              {t.title}
              <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-slate-800 text-xs text-white border border-slate-600 rounded px-2 py-1 outline-none font-sans font-bold">
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
                <option value="mr">मराठी</option>
              </select>
            </div>
            <nav className="flex gap-6 text-sm font-medium items-center">
              {offlineQueue.length > 0 && (
                <div className="text-[10px] uppercase font-bold bg-amber-500/20 text-amber-500 px-3 py-1.5 rounded-full border border-amber-500/30 flex items-center gap-2 animate-pulse cursor-default">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  {offlineQueue.length} Offline
                </div>
              )}
              {user ? (
                <>
                  <button
                    onClick={() => setCurrentView('report')}
                    className={`${currentView === 'report' ? 'text-primary' : 'text-slate-400'} hover:text-slate-200 transition-colors mr-2`}
                  >
                    📡 {t.reportIssue}
                  </button>
                  <button
                    onClick={() => setCurrentView('track')}
                    className={`${currentView === 'track' ? 'text-primary font-black scale-105' : 'text-slate-400'} hover:text-slate-200 transition-all text-xs tracking-widest uppercase mr-4`}
                  >
                    📡 {t.trackIssues}
                  </button>
                  <button
                    onClick={() => setCurrentView('history')}
                    className={`${currentView === 'history' ? 'text-primary' : 'text-slate-400'} hover:text-slate-200 transition-colors mr-2`}
                  >
                    📚 {t.myHistory}
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => setCurrentView('admin')}
                      className={`${currentView === 'admin' ? 'text-amber-500 font-extrabold shadow-sm' : 'text-slate-500'} hover:text-amber-400 transition-all text-[10px] tracking-[0.2em] uppercase border border-slate-800 px-3 py-1 rounded-md ml-2 hover:border-amber-500/30`}
                    >
                      🔐 Admin Portal
                    </button>
                  )}
                  <NotificationBell complaintId={lastComplaintId} />
                  <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-700">
                    <button
                      onClick={() => setShowProfileModal(true)}
                      className="text-slate-300 hover:text-primary transition-colors text-sm font-medium cursor-pointer"
                    >
                      {t.welcome}, {user.name}
                    </button>
                    <button
                      onClick={handleLogout}
                      className="text-slate-400 hover:text-slate-200 transition-colors text-sm"
                    >
                      {t.logout}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setCurrentView('login')}
                    className={`${currentView === 'login' ? 'text-primary' : 'text-slate-400'} hover:text-slate-200 transition-colors`}
                  >
                    {t.login}
                  </button>
                  <button
                    onClick={() => setCurrentView('register')}
                    className={`${currentView === 'register' ? 'text-primary' : 'text-slate-400'} hover:text-slate-200 transition-colors`}
                  >
                    {t.register}
                  </button>
                </>
              )}
            </nav>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-amber-500/30">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500/10 border border-amber-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              </div>
              <div className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-amber-600 uppercase">
                GovPortal
              </div>
            </div>
            <nav className="flex gap-6 items-center">
              <span className="text-amber-500 text-xs font-bold uppercase tracking-widest">{user?.name} | {user?.email}</span>
              <button
                onClick={handleLogout}
                className="btn py-1.5 px-6 text-[10px] bg-red-500/10 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white uppercase tracking-widest transition-all"
              >
                Sign Out ➔
              </button>
            </nav>
          </div>
        </header>
      )}

      {authLoading ? (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-slate-400">Loading...</p>
          </div>
        </div>
      ) : !user && currentView !== 'track' ? (
        currentView === 'register' ? (
          <Register onRegister={handleRegister} onSwitchToLogin={() => setCurrentView('login')} />
        ) : (
          <Login onLogin={handleLogin} onSwitchToRegister={() => setCurrentView('register')} />
        )
      ) : currentView === 'history' ? (
        <UserHistory onActivity={fetchGlobalData} />
      ) : currentView === 'admin' && user?.role === 'admin' ? (
        <AdminDashboard />
      ) : currentView === 'track' ? (
        <IssueTracker />
      ) : (
        <main className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
          <div className="lg:col-span-5 flex flex-col justify-center">
            <h1 className="text-5xl font-extrabold leading-tight mb-6">
              {t.makeCity} <br /><span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">{t.better}</span>
            </h1>
            <p className="text-lg text-slate-400 mb-8 leading-relaxed">
              {t.desc}
            </p>
            <div className="flex gap-4">
              <div className="px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/50 flex flex-col w-1/2 items-center">
                <span className="text-3xl font-bold text-primary">{counts.fixed > 1000 ? (counts.fixed / 1000).toFixed(1) + 'K+' : counts.fixed}</span>
                <span className="text-xs text-slate-400 uppercase tracking-widest mt-1">{t.issuesFixed}</span>
              </div>
              <div className="px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/50 flex flex-col w-1/2 items-center">
                <span className="text-3xl font-bold text-secondary">{counts.avg}</span>
                <span className="text-xs text-slate-400 uppercase tracking-widest mt-1">{t.avgResponse}</span>
              </div>
            </div>

            {/* Regional Performance Leaderboard */}
            <div className="mt-12 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -z-10 group-hover:bg-primary/10 transition-colors"></div>

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                    🏆 State Leaderboard <span className="text-primary/70 font-black tracking-tighter">(Top 5)</span>
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Elite Top 5 of 36 Districts Ranked by Efficiency</p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Live Data</span>
                </div>
              </div>

              <div className="space-y-4">
                {globalLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] animate-pulse">Awaiting Regional Pulse...</p>
                  </div>
                ) : (
                  <>
                    {cityRanking.map((city, idx) => (
                      <div key={city.name} className="flex flex-col gap-1.5 group/item">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black border ${idx === 0 ? 'bg-amber-500 border-amber-400 text-black shadow-[0_0_10px_rgba(245,158,11,0.2)]' :
                              idx === 1 ? 'bg-slate-300 border-slate-200 text-black' :
                                idx === 2 ? 'bg-amber-700 border-amber-600 text-white' :
                                  'bg-slate-800 border-slate-700 text-slate-500'
                              }`}>
                              {idx + 1}
                            </span>
                            <span className="text-sm font-black text-slate-300 group-hover/item:text-white transition-colors uppercase tracking-tight">{city.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-primary">{city.score}% Success</span>
                            <div className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">{city.solved} Resolved</div>
                          </div>
                        </div>
                        <div className="w-full bg-slate-800/50 h-1.5 rounded-full overflow-hidden border border-slate-700/30">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${city.score > 80 ? 'bg-emerald-500' :
                              city.score > 50 ? 'bg-primary' :
                                'bg-amber-500'
                              }`}
                            style={{ width: `${city.score}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                    {cityRanking.length === 0 && (
                      <div className="py-8 text-center bg-slate-800/20 rounded-xl border border-dashed border-slate-700">
                        <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">No Active Districts Yet</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-center gap-2">
                <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <p className="text-[8px] text-slate-500 italic font-medium">Rankings prioritize resolved-to-total ratio. Higher efficiency = Higher Rank.</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="glass-card p-8 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 text-white">{t.reportNew}</h2>

              <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">{t.issueTitle}</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Deep pothole on 5th Avenue"
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
                    <select
                      className="input-field appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:1em_1em] bg-[right_1rem_center] bg-no-repeat pr-10"
                      required
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                    >
                      <option value="" disabled>Select Category</option>
                      <option value="pothole">Potholes</option>
                      <option value="garbage">Garbage collection</option>
                      <option value="water">Water leakage</option>
                      <option value="streetlight">Streetlight not working</option>
                      <option value="flood">Flood</option>
                      <option value="fire">Fire</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5 flex justify-between">
                      <span>Upload Media</span>
                      {aiParsing && <span className="text-xs text-primary animate-pulse flex items-center gap-1"><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> AI Scanning...</span>}
                    </label>
                    <input
                      type="file"
                      className="input-field py-[6px] file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-indigo-500 cursor-pointer"
                      accept="image/*,video/*"
                      onChange={handleMediaUpload}
                    />
                    {aiResult && (
                      <div className="mt-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg flex items-start gap-2 animate-in fade-in">
                        <span className="text-lg">🤖</span>
                        <div>
                          <div className="font-bold flex items-center gap-2">
                            AI Detection: {aiResult.label} ({aiResult.confidence}%)
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${aiResult.severity === 'High' ? 'bg-red-500 text-white' : aiResult.severity === 'Low' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-black'}`}>
                              {aiResult.severity} Severity
                            </span>
                          </div>
                          <div className="text-slate-400 mt-0.5">Auto-categorized as: <span className="text-white uppercase tracking-widest">{aiResult.detectedCat}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl flex items-center justify-between group hover:bg-red-500/10 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${formData.is_emergency ? 'bg-red-500 text-white animate-pulse shadow-red-500/50 shadow-md' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                      🚨
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-300">Hazard Level</div>
                      <div className={`text-xs font-bold transition-colors ${formData.is_emergency ? 'text-red-400' : 'text-slate-500'}`}>Emergency Reporting</div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={formData.is_emergency}
                      onChange={(e) => setFormData({ ...formData, is_emergency: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>

                {smartSuggestions.length > 0 && (
                  <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🧠</span>
                      <span className="text-sm font-bold text-blue-400">Smart Suggestions</span>
                    </div>
                    <ul className="space-y-1">
                      {smartSuggestions.map((suggestion, idx) => (
                        <li key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                          <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5 flex justify-between items-center">
                    <span>Description</span>
                    <button
                      type="button"
                      onClick={startDescriptionVoice}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isListeningDescription ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'}`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                      {isListeningDescription ? 'Listening...' : 'Speak Instead'}
                    </button>
                  </label>
                  <textarea
                    className="input-field resize-none h-28"
                    placeholder="Describe the issue in detail..."
                    required
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  ></textarea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">District</label>
                    <select
                      className="input-field appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:1em_1em] bg-[right_1rem_center] bg-no-repeat pr-10"
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value, village: '' })}
                    >
                      <option value="">Select District</option>
                      {Object.keys(maharashtraDistricts).sort().map(district => (
                        <option key={district} value={district}>{district}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Taluka</label>
                    <select
                      className="input-field appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:1em_1em] bg-[right_1rem_center] bg-no-repeat pr-10"
                      value={formData.village}
                      onChange={e => setFormData({ ...formData, village: e.target.value })}
                      disabled={!formData.city}
                    >
                      <option value="">Select Taluka</option>
                      {formData.city && maharashtraDistricts[formData.city]?.map(taluka => (
                        <option key={taluka} value={taluka}>{taluka}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5 flex justify-between items-end">
                    <span>Location Pinpoint</span>
                    <span className="text-xs font-normal text-slate-500">
                      {formData.lat ? `Selected: ${formData.lat.toFixed(4)}, ${formData.lng.toFixed(4)}` : 'Click on map to select'}
                    </span>
                  </label>
                  <div className={`h-[300px] w-full relative rounded-xl overflow-hidden border-2 transition-colors ${formData.lat ? 'border-primary' : 'border-slate-700'}`}>
                    <MapContainer
                      center={defaultCenter}
                      zoom={5}
                      scrollWheelZoom={false}
                      style={{ height: '100%', width: '100%', zIndex: 10 }}
                    >
                      <GpsButton setFormData={setFormData} />
                      {/* Using Google Maps tile layer as specified in the original admin.html script */}
                      <TileLayer
                        attribution="Map data © Google"
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                        maxZoom={20}
                      />
                      <LocationSelector formData={formData} setFormData={setFormData} />
                      <MapFocusManager city={formData.city} village={formData.village} />
                    </MapContainer>
                  </div>
                </div>

                {duplicates.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-center justify-between group animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-500/20 text-amber-500 rounded-lg flex items-center justify-center text-xl">
                        🔍
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[2px] text-amber-500">Duplicate Found Nearby</div>
                        <div className="text-xs text-slate-300 font-medium">This issue might already be reported.</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentView('track')}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all"
                    >
                      Upvote Instead?
                    </button>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className={`btn w-full md:w-auto min-w-[160px] flex items-center justify-center gap-2 ${isSubmitting || checkingDuplicates ? 'opacity-70 cursor-not-allowed' : ''}`}
                    disabled={isSubmitting || checkingDuplicates}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        {t.submitting}
                      </>
                    ) : checkingDuplicates ? "Checking Proximity..." : t.submit}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-card p-10 flex flex-col items-center text-center max-w-sm w-full animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 className="text-2xl font-bold mb-2">Report Submitted!</h3>
            <p className="text-slate-400 mb-4 leading-relaxed">
              Your complaint has been registered successfully.
            </p>
            <div className="bg-slate-800 p-3 rounded-lg mb-6 w-full">
              <p className="text-xs text-slate-400 mb-1">Complaint ID</p>
              <p className="text-white font-mono text-lg">{showSuccess.complaintId}</p>
            </div>
            <p className="text-slate-400 mb-8 leading-relaxed text-sm">
              Use this ID to track your complaint status.
            </p>
            <div className="flex gap-3 w-full">
              <button
                className="btn flex-1 bg-slate-700 hover:bg-slate-600"
                onClick={() => {
                  setShowSuccess(null);
                  setCurrentView('track');
                }}
              >
                Track Issues
              </button>
              <button
                className="btn flex-1 bg-emerald-600 hover:bg-emerald-500"
                onClick={() => setShowSuccess(null)}
              >
                Report Another
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && user && (
        <UserProfile
          user={user}
          onClose={() => setShowProfileModal(false)}
          onUpdate={(updatedUser) => setUser(updatedUser)}
        />
      )}

      <CivicChatbot />
    </div>
  );
}
