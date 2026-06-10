import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_UID } from './config';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LOGO = "https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('auth');
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // login | register

  // Auth fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // Rider booking
  const [riderTab, setRiderTab] = useState('home'); // home | book | schedule | history
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [stops, setStops] = useState([]);
  const [hasPet, setHasPet] = useState(false);
  const [rideHistory, setRideHistory] = useState([]);
  const [activeRide, setActiveRide] = useState(null);

  // Driver
  const [driverTab, setDriverTab] = useState('pending'); // pending | active | history
  const [pendingRequests, setPendingRequests] = useState([]);
  const [driverOnline, setDriverOnline] = useState(false);
  const [completedRides, setCompletedRides] = useState([]);
  const [todayRides, setTodayRides] = useState([]);
  const [waitTime, setWaitTime] = useState(0);
  const timerRef = useRef(null);

  const isAdmin = user?.id === ADMIN_UID;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleUserSession(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) handleUserSession(session.user);
      else { setUser(null); setProfile(null); setView('auth'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('ride-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
        if (isAdmin) { fetchPendingRequests(); fetchDriverStats(); }
        else fetchRiderActiveRide();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (activeRide?.status === 'arrived' && isAdmin) {
      timerRef.current = setInterval(() => setWaitTime(p => p + 1), 1000);
    } else { clearInterval(timerRef.current); setWaitTime(0); }
    return () => clearInterval(timerRef.current);
  }, [activeRide?.status]);

  const handleUserSession = async (currUser) => {
    setUser(currUser);
    const { data } = await supabase.from('profiles').select('*').eq('id', currUser.id).single();
    setProfile(data);
    if (currUser.id === ADMIN_UID) {
      setView('driver');
      fetchPendingRequests();
      fetchDriverStats();
    } else {
      setView('rider');
      fetchRiderHistory(currUser.id);
      fetchRiderActiveRide(currUser.id);
    }
  };

  const fetchPendingRequests = async () => {
    const { data } = await supabase.from('rides').select('*').eq('status', 'pending').order('created_at', { ascending: true });
    setPendingRequests(data || []);
  };

  const fetchDriverStats = async () => {
    const today = new Date(); today.setHours(0,0,0,0);
    const { data: todayData } = await supabase.from('rides').select('*').gte('created_at', today.toISOString());
    setTodayRides(todayData || []);
    const { data: compData } = await supabase.from('rides').select('*').eq('status', 'completed').order('completed_at', { ascending: false }).limit(20);
    setCompletedRides(compData || []);
    // check active
    const { data: actData } = await supabase.from('rides').select('*').in('status', ['accepted','arrived','in_progress']).limit(1);
    if (actData && actData.length > 0) setActiveRide(actData[0]);
  };

  const fetchRiderHistory = async (uid) => {
    const { data } = await supabase.from('rides').select('*').eq('rider_id', uid).order('created_at', { ascending: false }).limit(10);
    setRideHistory(data || []);
  };

  const fetchRiderActiveRide = async (uid) => {
    const id = uid || user?.id;
    if (!id) return;
    const { data } = await supabase.from('rides').select('*').eq('rider_id', id).in('status', ['pending','accepted','arrived','in_progress']).limit(1);
    if (data && data.length > 0) setActiveRide(data[0]);
    else setActiveRide(null);
  };

  const handleSignUp = async (e) => {
    e.preventDefault(); setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { alert(error.message); setLoading(false); return; }
    if (data?.user) {
      await supabase.from('profiles').insert({ id: data.user.id, full_name: fullName, phone_number: phone, email });
      alert("Account created! Please check your email to confirm.");
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoading(false);
  };

  const calcFare = () => {
    if (!pickup || !dropoff) return { base: 8, distance: 0, duration: 0, wait: 0, pet: 0, total: 0 };
    const base = 8.00, mockMiles = 8.5, mockMins = 18;
    const distance = mockMiles * 1.50;
    const duration = mockMins * 0.30;
    const pet = hasPet ? 5 : 0;
    const total = base + distance + duration + pet;
    return { base, distance: distance.toFixed(2), duration: duration.toFixed(2), wait: '0.00', pet: pet.toFixed(2), total: total.toFixed(2), miles: mockMiles, mins: mockMins };
  };

  const confirmDispatch = async () => {
    const fare = calcFare();
    if (!pickup || !dropoff) { alert("Please enter pickup and dropoff addresses."); return; }
    setLoading(true);
    try {
      await supabase.from('rides').insert({
        rider_id: user.id,
        rider_name: profile?.full_name || user.email,
        rider_phone: profile?.phone_number || '',
        pickup_address: pickup,
        pickup_lat: 35.0456, pickup_lng: -85.3097,
        dropoff_address: dropoff,
        dropoff_lat: 35.0515, dropoff_lng: -85.2954,
        calculated_fare: parseFloat(fare.total),
        status: 'pending',
        additional_stops: JSON.stringify(stops),
        pet_count: hasPet ? 1 : 0,
        is_after_hours: false
      });
      setPickup(''); setDropoff(''); setStops([]); setHasPet(false);
      setRiderTab('home');
      alert("🚗 Ride requested! Your driver will be notified.");
    } catch (err) {
      alert("Error: " + err.message);
    } finally { setLoading(false); }
  };

  const updateRideStatus = async (rideId, nextStatus) => {
    const update = { status: nextStatus };
    if (nextStatus === 'accepted') update.driver_id = user.id;
    else if (nextStatus === 'arrived') update.arrived_at = new Date().toISOString();
    else if (nextStatus === 'in_progress') update.picked_up_at = new Date().toISOString();
    else if (nextStatus === 'completed') { update.completed_at = new Date().toISOString(); setActiveRide(null); }
    await supabase.from('rides').update(update).eq('id', rideId);
    if (nextStatus === 'accepted') { const req = pendingRequests.find(r => r.id === rideId); setActiveRide({ ...req, status: 'accepted' }); }
    fetchPendingRequests(); fetchDriverStats();
  };

  const fare = calcFare();

  // ── WEEKLY EARNINGS ──────────────────────────────────────────────────────
  const todayEarnings = todayRides.filter(r => r.status === 'completed').reduce((s, r) => s + (r.calculated_fare || 0), 0);
  const grossFares = completedRides.reduce((s, r) => s + (r.calculated_fare || 0), 0);
  const platformFee = grossFares * 0.10;
  const youKeep = grossFares - platformFee;

  // ── STYLES ────────────────────────────────────────────────────────────────
  const col = { display: 'flex', flexDirection: 'column', gap: '12px' };
  const row = { display: 'flex', flexDirection: 'row' };
  const card = { background: 'var(--dark-gray)', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' };
  const pinkBtn = { background: 'var(--pink)', color: '#fff', border: 'none', borderRadius: '10px', padding: '14px', fontWeight: '700', fontSize: '15px', width: '100%', cursor: 'pointer' };
  const grayBtn = { background: 'var(--gray)', color: 'var(--white)', border: 'none', borderRadius: '10px', padding: '12px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' };
  const tabBtn = (active) => ({ background: active ? 'var(--pink)' : '#f0f0f0', color: active ? '#fff' : '#666', border: 'none', borderRadius: '20px', padding: '8px 16px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' });
  const inputStyle = { background: 'var(--gray)', border: '1px solid #444', borderRadius: '10px', padding: '13px 14px', fontSize: '14px', color: 'var(--white)', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const statCard = (color) => ({ background: color || 'var(--gray)', borderRadius: '12px', padding: '14px', textAlign: 'center', flex: 1 });

  // ── AUTH ─────────────────────────────────────────────────────────────────
  if (view === 'auth') return (
    <div style={{ minHeight: '100vh', backgroundImage: 'linear-gradient(rgba(18,18,18,0.82), rgba(18,18,18,0.92)), url(https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <img src={LOGO} alt="Hope" style={{ width: '220px', borderRadius: '16px', marginBottom: '16px' }} />
      <h2 style={{ color: '#fff', margin: '0 0 4px', fontSize: '24px' }}>Hope Rideshare</h2>
      <p style={{ color: 'var(--light-gray)', fontSize: '13px', marginBottom: '28px' }}>Chattanooga's Trusted Rides for Women</p>

      <div style={{ ...row, gap: '8px', marginBottom: '20px' }}>
        <button style={tabBtn(authMode === 'login')} onClick={() => setAuthMode('login')}>Log In</button>
        <button style={tabBtn(authMode === 'register')} onClick={() => setAuthMode('register')}>Create Account</button>
      </div>

      <form onSubmit={authMode === 'login' ? handleLogin : handleSignUp} style={{ ...col, width: '100%', maxWidth: '360px' }}>
        {authMode === 'register' && <>
          <input style={{ ...inputStyle, background: 'var(--dark-gray)', color: '#fff', border: '1px solid #333' }} placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} />
          <input style={{ ...inputStyle, background: 'var(--dark-gray)', color: '#fff', border: '1px solid #333' }} type="tel" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} />
        </>}
        <input style={{ ...inputStyle, background: 'var(--dark-gray)', color: '#fff', border: '1px solid #333' }} type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} />
        <input style={{ ...inputStyle, background: 'var(--dark-gray)', color: '#fff', border: '1px solid #333' }} type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" disabled={loading} style={pinkBtn}>{loading ? '...' : authMode === 'login' ? 'Log In' : '🌸 Create Account'}</button>
      </form>
    </div>
  );

  // ── RIDER VIEW ────────────────────────────────────────────────────────────
  if (view === 'rider') {
    const firstName = profile?.full_name?.split(' ')[0] || 'there';
    return (
      <div style={{ minHeight: '100vh', backgroundImage: 'linear-gradient(rgba(18,18,18,0.93), rgba(18,18,18,0.97)), url(https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed', fontFamily: 'system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ background: 'var(--black)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={LOGO} alt="Hope" style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'cover' }} />
            <span style={{ color: '#fff', fontWeight: '700', fontSize: '16px' }}>"Hope"</span>
            <span style={{ color: 'var(--light-gray)', fontSize: '11px', letterSpacing: '1px' }}>RIDESHARE</span>
          </div>
          <div style={{ ...row, gap: '8px' }}>
            <button style={tabBtn(true)} onClick={() => {}}>Rider</button>
            <button style={tabBtn(false)} onClick={() => setView('driver')}>Driver</button>
          </div>
        </div>

        <div style={{ padding: '20px', maxWidth: '480px', margin: '0 auto' }}>
          {/* Tabs */}
          <div style={{ ...row, gap: '8px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '20px' }}>
            {['home','book','schedule','history'].map(t => (
              <button key={t} style={tabBtn(riderTab === t)} onClick={() => setRiderTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Active ride banner */}
          {activeRide && (
            <div style={{ ...card, background: 'rgba(162,19,93,0.15)', border: '2px solid var(--pink)', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 4px', fontWeight: '700', color: 'var(--pink)' }}>🚗 Ride in Progress</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--light-gray)' }}>Status: <strong style={{ color: 'var(--pink)' }}>{activeRide.status.replace('_',' ').toUpperCase()}</strong></p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--light-gray)' }}>📍 {activeRide.pickup_address} → 🏁 {activeRide.dropoff_address}</p>
            </div>
          )}

          {riderTab === 'home' && (
            <div style={col}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: '800', color: 'var(--white)' }}>Hello, {firstName} 👋</h2>
                <p style={{ margin: 0, color: 'var(--light-gray)', fontSize: '14px' }}>Where are you headed today?</p>
              </div>
              <div style={card}>
                <input style={inputStyle} placeholder="📍 Current location / Pickup" value={pickup} onChange={e => setPickup(e.target.value)} />
                <div style={{ height: '8px' }} />
                <input style={inputStyle} placeholder="➤ Where to?" value={dropoff} onChange={e => setDropoff(e.target.value)} />
                <div style={{ height: '12px' }} />
                <button style={pinkBtn} onClick={() => { if (pickup && dropoff) setRiderTab('book'); else setRiderTab('book'); }}>Request a Ride</button>
              </div>

              <p style={{ margin: '4px 0 0', fontWeight: '700', fontSize: '12px', color: 'var(--light-gray)', letterSpacing: '1px' }}>QUICK SHORTCUTS</p>
              <button style={{ ...grayBtn, textAlign: 'left', padding: '14px' }}>＋ Add Shortcut</button>

              <div style={{ ...card, display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>📅</span>
                <div>
                  <p style={{ margin: 0, fontWeight: '700', color: 'var(--white)' }}>Schedule a Ride</p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--light-gray)' }}>Book for a future date & time</p>
                </div>
              </div>

              <div style={{ ...row, gap: '10px' }}>
                <div style={statCard('rgba(162,19,93,0.2)')}>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--dark-pink)' }}>{rideHistory.length}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--light-gray)' }}>Rides</p>
                </div>
                <div style={statCard()}>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#f5c518' }}>⭐</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--light-gray)' }}>Rating</p>
                </div>
                <div style={statCard()}>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--pink)' }}>1</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--light-gray)' }}>Months</p>
                </div>
              </div>

              {/* SOS Button */}
              <button style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '12px', padding: '16px', fontWeight: '800', fontSize: '16px', cursor: 'pointer', letterSpacing: '1px' }}>
                ⚠️ SOS — Emergency Alert
              </button>
            </div>
          )}

          {riderTab === 'book' && (
            <div style={col}>
              <h3 style={{ margin: 0, color: 'var(--white)', fontWeight: '800' }}>Request your ride</h3>
              <input style={inputStyle} placeholder="📍 Pickup Address" value={pickup} onChange={e => setPickup(e.target.value)} />
              {stops.map((stop, i) => (
                <input key={i} style={inputStyle} placeholder={`🛑 Stop ${i+1}`} value={stop} onChange={e => { const a=[...stops]; a[i]=e.target.value; setStops(a); }} />
              ))}
              <div style={{ ...row, gap: '8px' }}>
                {stops.length < 2 && <button style={{ ...grayBtn, flex: 1 }} onClick={() => setStops([...stops,''])}>＋ Add Stop</button>}
                <label style={{ ...grayBtn, display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
                  <input type="checkbox" checked={hasPet} onChange={e => setHasPet(e.target.checked)} />
                  🐾 Pet (+$5)
                </label>
              </div>
              <input style={inputStyle} placeholder="📍 Dropoff Address" value={dropoff} onChange={e => setDropoff(e.target.value)} />

              {(pickup || dropoff) && (
                <div style={card}>
                  {[
                    ['Base Fare', `$${fare.base.toFixed(2)}`],
                    ['Distance ($1.50/mi)', `$${fare.distance}`],
                    ['Duration ($0.30/min)', `$${fare.duration}`],
                    ['Wait Time ($0.50/min after 5m)', `$${fare.wait}`],
                    ['Pet Premium', `$${fare.pet}`],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '14px', color: 'var(--light-gray)', borderBottom: '1px solid #333' }}>
                      <span>{label}</span><span style={{ fontWeight: '600', color: '#222' }}>{val}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontWeight: '800', fontSize: '16px' }}>
                    <span style={{ color: 'var(--white)' }}>Total Estimate</span>
                    <span style={{ color: 'var(--pink)', fontSize: '20px' }}>${fare.total}</span>
                  </div>
                </div>
              )}

              <button style={pinkBtn} onClick={confirmDispatch} disabled={loading || !pickup || !dropoff}>
                {loading ? 'Requesting...' : 'Confirm HOPE Dispatch'}
              </button>
            </div>
          )}

          {riderTab === 'schedule' && (
            <div style={col}>
              <h3 style={{ margin: 0, color: 'var(--white)', fontWeight: '800' }}>Schedule a Ride</h3>
              <div style={card}>
                <p style={{ margin: '0 0 12px', color: 'var(--light-gray)', fontSize: '13px' }}>Book for a future date & time</p>
                <input style={inputStyle} placeholder="📍 Pickup Address" />
                <div style={{ height: '8px' }} />
                <input style={inputStyle} placeholder="🏁 Dropoff Address" />
                <div style={{ height: '8px' }} />
                <input style={inputStyle} type="datetime-local" />
                <div style={{ height: '12px' }} />
                <button style={pinkBtn}>Schedule Ride</button>
              </div>
            </div>
          )}

          {riderTab === 'history' && (
            <div style={col}>
              <h3 style={{ margin: 0, color: 'var(--white)', fontWeight: '800' }}>Ride History</h3>
              {rideHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--light-gray)' }}>
                  <p style={{ fontSize: '32px' }}>🌸</p>
                  <p>No rides yet</p>
                </div>
              ) : rideHistory.map(r => (
                <div key={r.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ margin: 0, fontWeight: '700', color: 'var(--white)' }}>{r.pickup_address}</p>
                    <p style={{ margin: 0, color: 'var(--pink)', fontWeight: '800' }}>${r.calculated_fare}</p>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--light-gray)' }}>→ {r.dropoff_address}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: r.status === 'completed' ? '#2e7d32' : '#888' }}>{r.status.toUpperCase()}</p>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => supabase.auth.signOut()} style={{ ...grayBtn, marginTop: '16px', width: '100%' }}>Log Out</button>
        </div>
      </div>
    );
  }

  // ── DRIVER VIEW ───────────────────────────────────────────────────────────
  if (view === 'driver') {
    const pendingCount = pendingRequests.length;
    const todayCount = todayRides.length;
    const completedCount = todayRides.filter(r => r.status === 'completed').length;
    const activeForDriver = pendingRequests.filter(r => r.status !== 'pending');

    return (
      <div style={{ minHeight: '100vh', backgroundImage: 'linear-gradient(rgba(18,18,18,0.93), rgba(18,18,18,0.97)), url(https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed', fontFamily: 'system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ background: 'var(--black)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={LOGO} alt="Hope" style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'cover' }} />
            <div>
              <p style={{ color: '#fff', fontWeight: '700', fontSize: '15px', margin: 0 }}>"Hope"</p>
              <p style={{ color: 'var(--light-gray)', fontSize: '10px', letterSpacing: '1px', margin: 0 }}>TRUSTED RIDES FOR WOMEN</p>
            </div>
          </div>
          <button style={{ ...grayBtn, padding: '8px 14px', fontSize: '13px' }} onClick={() => setView('rider')}>← Back</button>
        </div>

        <div style={{ padding: '20px', maxWidth: '480px', margin: '0 auto', ...col }}>
          {/* Title + Online toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--white)' }}>Driver Dashboard</h2>
              <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--light-gray)' }}>Manage ride requests in real-time</p>
            </div>
            <button onClick={() => setDriverOnline(!driverOnline)} style={{ background: driverOnline ? '#1a7a2e' : '#555', color: '#fff', border: 'none', borderRadius: '20px', padding: '8px 14px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>
              {driverOnline ? '🟢 ONLINE' : '⚫ OFFLINE'}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ ...row, gap: '10px' }}>
            {[
              ['⏳', pendingCount, 'PENDING'],
              ['🚗', todayCount, "TODAY'S RIDES"],
              ['✅', completedCount, 'COMPLETED'],
              ['$', `$${todayEarnings.toFixed(0)}`, 'EARNINGS'],
            ].map(([icon, val, label]) => (
              <div key={label} style={{ ...statCard(), border: '1px solid #444', flex: 1, padding: '12px 8px' }}>
                <p style={{ margin: '0 0 4px', fontSize: '18px' }}>{icon}</p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--white)' }}>{val}</p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--light-gray)', letterSpacing: '0.5px' }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Live Map */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--pink)' }}>📍</span>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '13px', color: 'var(--white)', letterSpacing: '1px' }}>LIVE MAP — CHATTANOOGA AREA</p>
            </div>
            <iframe
              src="https://www.openstreetmap.org/export/embed.html?bbox=-85.3800,34.9800,-85.2200,35.1200&layer=mapnik"
              style={{ width: '100%', height: '220px', border: 'none', display: 'block' }}
              title="Chattanooga Map"
            />
          </div>

          {/* Earnings Summary */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <p style={{ margin: 0, fontWeight: '700', color: 'var(--white)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--pink)' }}>📈</span> Earnings Summary
              </p>
              <select style={{ border: '1px solid #444', borderRadius: '8px', padding: '4px 8px', fontSize: '13px', background: 'var(--dark-gray)' }}>
                <option>Today</option><option>This Week</option><option>This Month</option>
              </select>
            </div>
            <div style={{ background: 'rgba(162,19,93,0.15)', borderRadius: '10px', padding: '16px', textAlign: 'center', marginBottom: '12px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--light-gray)', letterSpacing: '1px' }}>NET TAKE-HOME · TODAY</p>
              <p style={{ margin: 0, fontSize: '36px', fontWeight: '900', color: 'var(--dark-pink)' }}>${youKeep.toFixed(2)}</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--light-gray)' }}>{completedRides.length} rides completed</p>
            </div>
            {[
              ['Gross Fares', `$${grossFares.toFixed(2)}`, '#111'],
              ['Tips Received', '+$0.00', '#2e7d32'],
              ['Platform Fee (10%)', `-$${platformFee.toFixed(2)}`, 'var(--pink)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #333', fontSize: '14px' }}>
                <span style={{ color: 'var(--light-gray)' }}>{label}</span><span style={{ fontWeight: '700', color }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: '15px', fontWeight: '800' }}>
              <span style={{ color: 'var(--white)' }}>You Keep</span>
              <span style={{ color: 'var(--pink)' }}>${youKeep.toFixed(2)}</span>
            </div>
          </div>

          {/* Ride Tabs */}
          <div style={{ ...row, gap: '8px' }}>
            {[['pending', `Pending (${pendingCount})`], ['active', `Active (${activeRide ? 1 : 0})`], ['history', `History (${completedRides.length})`]].map(([t, label]) => (
              <button key={t} style={tabBtn(driverTab === t)} onClick={() => setDriverTab(t)}>{label}</button>
            ))}
          </div>

          {/* Pending rides */}
          {driverTab === 'pending' && (
            pendingRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--light-gray)' }}>
                <p style={{ fontSize: '32px', margin: 0 }}>🔔</p>
                <p style={{ fontWeight: '600', margin: '8px 0 4px', color: 'var(--light-gray)' }}>No pending requests</p>
                <p style={{ fontSize: '13px', margin: 0 }}>New ride requests will appear here</p>
              </div>
            ) : pendingRequests.map(req => (
              <div key={req.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--pink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '800', fontSize: '16px', flexShrink: 0 }}>
                      {(req.rider_name || 'R').charAt(0)}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: '700', color: 'var(--white)' }}>
                        {req.rider_name ? req.rider_name.split(' ')[0] + ' ' + (req.rider_name.split(' ')[1]?.[0]||'') + '.' : 'Rider'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#f5c518' }}>⭐ {(4.5 + Math.random()*0.5).toFixed(1)}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, color: 'var(--pink)', fontWeight: '800', fontSize: '18px' }}>${req.calculated_fare}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--light-gray)' }}>~2 min away</p>
                  </div>
                </div>
                <div style={{ marginTop: '12px', ...col, gap: '4px' }}>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--light-gray)' }}>📍 {req.pickup_address}</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--light-gray)' }}>🏁 {req.dropoff_address}</p>
                </div>
                <button style={{ ...pinkBtn, marginTop: '12px' }} onClick={() => { updateRideStatus(req.id, 'accepted'); }}>
                  Accept Request
                </button>
              </div>
            ))
          )}

          {driverTab === 'active' && (
            activeRide && ['accepted','arrived','in_progress'].includes(activeRide.status) ? (
              <div style={card}>
                <p style={{ margin: '0 0 12px', fontWeight: '800', fontSize: '16px', color: 'var(--white)' }}>Active Ride</p>
                <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--light-gray)' }}>👤 {activeRide.rider_name} · {activeRide.rider_phone}</p>
                <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--light-gray)' }}>📍 {activeRide.pickup_address}</p>
                <p style={{ margin: '4px 0 12px', fontSize: '13px', color: 'var(--light-gray)' }}>🏁 {activeRide.dropoff_address}</p>
                <p style={{ margin: '0 0 12px', color: 'var(--pink)', fontWeight: '700' }}>Status: {activeRide.status.replace('_',' ').toUpperCase()}</p>
                {activeRide.status === 'accepted' && <button style={pinkBtn} onClick={() => updateRideStatus(activeRide.id, 'arrived')}>📍 Arrived at Pickup</button>}
                {activeRide.status === 'arrived' && (
                  <div style={col}>
                    <p style={{ color: '#d32f2f', fontWeight: '700', textAlign: 'center' }}>⏱️ {Math.floor(waitTime/60)}m {waitTime%60}s</p>
                    <button style={{ ...pinkBtn, background: '#1565c0' }} onClick={() => updateRideStatus(activeRide.id, 'in_progress')}>🚗 Start Ride</button>
                  </div>
                )}
                {activeRide.status === 'in_progress' && <button style={{ ...pinkBtn, background: '#2e7d32' }} onClick={() => updateRideStatus(activeRide.id, 'completed')}>✅ Complete Ride</button>}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--light-gray)' }}>
                <p style={{ fontSize: '32px', margin: 0 }}>🚗</p>
                <p>No active ride</p>
              </div>
            )
          )}

          {driverTab === 'history' && (
            completedRides.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--light-gray)' }}>
                <p style={{ fontSize: '32px', margin: 0 }}>📋</p>
                <p>No completed rides yet</p>
              </div>
            ) : completedRides.map(r => (
              <div key={r.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontWeight: '700', color: 'var(--white)' }}>{r.rider_name}</p>
                  <p style={{ margin: 0, color: 'var(--pink)', fontWeight: '800' }}>${r.calculated_fare}</p>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--light-gray)' }}>📍 {r.pickup_address}</p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--light-gray)' }}>🏁 {r.dropoff_address}</p>
              </div>
            ))
          )}

          <button onClick={() => supabase.auth.signOut()} style={{ ...grayBtn, width: '100%', marginTop: '8px' }}>Log Out</button>
        </div>
      </div>
    );
  }

  return null;
}
