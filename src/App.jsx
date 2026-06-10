import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_MAPS_API_KEY, ADMIN_UID } from './config';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CHATTANOOGA_QUICK_PICKS = [
  { name: "Erlanger Baroness", address: "975 E 3rd St, Chattanooga, TN 37403" },
  { name: "CHI Memorial", address: "2525 de Sales Ave, Chattanooga, TN 37404" },
  { name: "Parkridge Medical", address: "2333 McCallie Ave, Chattanooga, TN 37404" }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('auth');
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [stops, setStops] = useState([]);
  const [pets, setPets] = useState(0);
  const [children, setChildren] = useState(0);
  const [childAges, setChildAges] = useState('');
  const [isAfterHours, setIsAfterHours] = useState(false);
  const [estimatedFare, setEstimatedFare] = useState("0.00");

  const [activeRide, setActiveRide] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [driverOnline, setDriverOnline] = useState(false);
  const [waitTime, setWaitTime] = useState(0);
  const [weeklyEarnings, setWeeklyEarnings] = useState({ total: 0, trips: 0, hours: 0 });
  const timerRef = useRef(null);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, (payload) => {
        if (user.id === ADMIN_UID) fetchPendingRequests();
        if (payload.new && (payload.new.rider_id === user.id || user.id === ADMIN_UID)) {
          setActiveRide(payload.new);
          if (payload.new.status === 'completed') setView(user.id === ADMIN_UID ? 'driver_dashboard' : 'client_dashboard');
          else if (payload.new.status !== 'pending') setView('active_ride');
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (pickup && dropoff) {
      const base = isAfterHours ? 10.00 : 8.00;
      const mockMiles = 5.0;
      const mockMins = 12.0;
      const perMile = isAfterHours ? 1.75 : 1.50;
      const perMin = isAfterHours ? 0.50 : 0.30;
      const subtotal = base + (mockMiles * perMile) + (mockMins * perMin) + (pets * 5.00) + (stops.length * 0.50);
      setEstimatedFare(subtotal.toFixed(2));
    }
  }, [pickup, dropoff, stops, pets, isAfterHours]);

  useEffect(() => {
    if (activeRide?.status === 'arrived' && user?.id === ADMIN_UID) {
      timerRef.current = setInterval(() => setWaitTime(prev => prev + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setWaitTime(0);
    }
    return () => clearInterval(timerRef.current);
  }, [activeRide?.status, user]);

  const handleUserSession = async (currUser) => {
    setUser(currUser);
    const { data } = await supabase.from('profiles').select('*').eq('id', currUser.id).single();
    setProfile(data);
    if (currUser.id === ADMIN_UID) {
      setView('driver_dashboard');
      fetchPendingRequests();
      fetchWeeklyEarnings();
    } else {
      setView('client_dashboard');
    }
  };

  const fetchPendingRequests = async () => {
    const { data } = await supabase.from('rides').select('*').eq('status', 'pending').order('created_at', { ascending: true });
    setPendingRequests(data || []);
  };

  const fetchWeeklyEarnings = async () => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data } = await supabase.from('rides')
      .select('calculated_fare, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', weekAgo.toISOString());
    if (data) {
      const total = data.reduce((sum, r) => sum + (r.calculated_fare || 0), 0);
      setWeeklyEarnings({ total: total.toFixed(2), trips: data.length, hours: (data.length * 0.55).toFixed(1) });
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { alert(error.message); setLoading(false); return; }
    if (data?.user) {
      await supabase.from('profiles').insert({ id: data.user.id, full_name: fullName, phone_number: phone, email });
      alert("Account created! Please check your email to confirm.");
    }
    setLoading(false);
  };

  const triggerAudioNav = (phrase) => {
    if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(phrase));
  };

  const processStripeCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/create-stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountInCents: Math.round(parseFloat(estimatedFare) * 100),
          riderEmail: user.email,
          pickupAddress: pickup,
          dropoffAddress: dropoff
        })
      });
      const session = await res.json();
      await supabase.from('rides').insert({
        rider_id: user.id, rider_name: profile?.full_name || user.email, rider_phone: profile?.phone_number || '',
        pickup_address: pickup, pickup_lat: 35.0456, pickup_lng: -85.3097,
        dropoff_address: dropoff, dropoff_lat: 35.0515, dropoff_lng: -85.2954,
        calculated_fare: parseFloat(estimatedFare), stripe_session_id: session.id, status: 'pending',
        additional_stops: JSON.stringify(stops), pet_count: pets, child_count: children,
        child_ages: childAges, is_after_hours: isAfterHours
      });
      window.location.href = session.url;
    } catch (err) {
      alert("Payment error: " + err.message);
    } finally { setLoading(false); }
  };

  const updateRideStatus = async (rideId, nextStatus) => {
    const update = { status: nextStatus };
    if (nextStatus === 'accepted') { update.driver_id = user.id; triggerAudioNav("Ride accepted. Navigating to pickup."); }
    else if (nextStatus === 'arrived') { update.arrived_at = new Date().toISOString(); triggerAudioNav("Arrived at pickup. Rider notified."); }
    else if (nextStatus === 'in_progress') { update.picked_up_at = new Date().toISOString(); triggerAudioNav("Rider picked up. Navigating to destination."); }
    else if (nextStatus === 'completed') { update.completed_at = new Date().toISOString(); triggerAudioNav("Ride complete."); setView('driver_dashboard'); setActiveRide(null); fetchWeeklyEarnings(); }
    await supabase.from('rides').update(update).eq('id', rideId);
    fetchPendingRequests();
  };

  const s = { display: 'flex', flexDirection: 'column', gap: '12px' };

  // ─── DRIVER DASHBOARD ───────────────────────────────────────────────────────
  const DriverDashboard = () => (
    <div style={s}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '22px', fontWeight: '800' }}>Hope Driver</h2>
          <p style={{ margin: '2px 0 0', color: '#aaa', fontSize: '13px' }}>Start earning today</p>
        </div>
        <button
          onClick={() => setDriverOnline(!driverOnline)}
          style={{
            width: 'auto', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: '700',
            background: driverOnline ? '#1a7a2e' : '#555', border: 'none', color: '#fff', cursor: 'pointer'
          }}>
          {driverOnline ? '🟢 ONLINE' : '⚫ OFFLINE'}
        </button>
      </div>

      {/* Nearby Requests header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <p style={{ margin: 0, fontWeight: '700', fontSize: '16px', color: '#fff' }}>Nearby Requests</p>
        <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>{pendingRequests.length} available</p>
      </div>

      {/* Ride request cards */}
      {pendingRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>
          <p style={{ fontSize: '36px', margin: 0 }}>🌸</p>
          <p style={{ marginTop: '8px' }}>No pending rides right now</p>
        </div>
      ) : (
        pendingRequests.map((req, i) => (
          <div key={req.id} style={{
            background: '#1e1e1e', borderRadius: '14px', padding: '16px',
            border: '1px solid #333', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {/* Avatar */}
                <div style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  background: 'var(--pink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', flexShrink: 0
                }}>👤</div>
                <div>
                  <p style={{ margin: 0, fontWeight: '700', fontSize: '15px', color: '#fff' }}>
                    {req.rider_name ? req.rider_name.split(' ')[0] + ' ' + (req.rider_name.split(' ')[1]?.[0] || '') + '.' : 'Rider'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#f5c518' }}>⭐ {(4.5 + Math.random() * 0.5).toFixed(1)}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: 'var(--pink)', fontWeight: '800', fontSize: '17px' }}>${req.calculated_fare}</p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#aaa' }}>~{2 + i} min away</p>
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '14px' }}>📍</span>
              <p style={{ margin: 0, fontSize: '13px', color: '#ccc', flex: 1 }}>{req.pickup_address}</p>
              <p style={{ margin: 0, fontSize: '12px', color: '#888', whiteSpace: 'nowrap' }}>{(0.5 + Math.random() * 2).toFixed(1)} mi</p>
            </div>
            {req.dropoff_address && (
              <div style={{ marginTop: '4px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px' }}>🏁</span>
                <p style={{ margin: 0, fontSize: '13px', color: '#999', flex: 1 }}>{req.dropoff_address}</p>
              </div>
            )}
            {(req.pet_count > 0 || req.child_count > 0) && (
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                {req.pet_count > 0 && <span style={{ fontSize: '12px', background: '#2a2a2a', padding: '3px 8px', borderRadius: '12px' }}>🐾 {req.pet_count} pet</span>}
                {req.child_count > 0 && <span style={{ fontSize: '12px', background: '#2a2a2a', padding: '3px 8px', borderRadius: '12px' }}>👶 {req.child_count} child</span>}
              </div>
            )}

            <button
              onClick={() => { updateRideStatus(req.id, 'accepted'); setActiveRide(req); setView('active_ride'); }}
              style={{
                width: '100%', marginTop: '14px', padding: '13px', borderRadius: '10px',
                background: 'var(--pink)', color: '#fff', fontWeight: '800', fontSize: '15px',
                border: 'none', cursor: 'pointer'
              }}>
              Accept Request
            </button>
          </div>
        ))
      )}

      {/* Weekly Earnings Card */}
      <div style={{
        background: 'linear-gradient(135deg, var(--dark-pink), var(--pink))',
        borderRadius: '14px', padding: '18px', marginTop: '8px', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>This Week</p>
            <p style={{ margin: '4px 0', fontSize: '32px', fontWeight: '900', color: '#fff' }}>${weeklyEarnings.total}</p>
            <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>
              {weeklyEarnings.trips} trips · {weeklyEarnings.hours} hours online
            </p>
          </div>
          <span style={{ fontSize: '24px', opacity: 0.8 }}>📈</span>
        </div>
      </div>

      <button onClick={() => supabase.auth.signOut()} style={{ background: '#2a2a2a', color: '#888', marginTop: '4px' }}>
        Log Out
      </button>
    </div>
  );

  return (
    <div className="app-container" style={{ padding: '20px' }}>
      <header style={{ textAlign: 'center', marginBottom: '20px' }}>
        <img src="https://media.base44.com/images/public/6a276d56de2d596e49ec189a/8cf8dedc3_IMG_1097.jpeg"
          alt="Hope Rideshare" style={{ width: '160px', borderRadius: '12px', marginBottom: '8px' }} />
        <p style={{ color: 'var(--light-gray)', fontSize: '13px', margin: 0 }}>Chattanooga's Trusted Rides for Women</p>
      </header>

      {view === 'auth' && (
        <form onSubmit={handleSignUp} style={s}>
          <h3 style={{ textAlign: 'center', color: 'var(--pink)' }}>Sign In or Register</h3>
          <input type="text" placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} />
          <input type="tel" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} />
          <input type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit" disabled={loading}>🌸 Create Account</button>
          <button type="button" style={{ background: 'var(--gray)' }} onClick={async () => {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) alert(error.message);
          }}>Log In</button>
        </form>
      )}

      {view === 'client_dashboard' && (
        <div style={s}>
          <h3 style={{ color: 'var(--pink)' }}>Book a Ride</h3>
          <input type="text" placeholder="📍 Pickup Address" value={pickup} onChange={e => setPickup(e.target.value)} />
          {stops.map((stop, i) => (
            <input key={i} type="text" placeholder={`🛑 Stop ${i+1}`} value={stop} onChange={e => {
              const arr = [...stops]; arr[i] = e.target.value; setStops(arr);
            }} />
          ))}
          {stops.length < 2 && (
            <button style={{ background: 'none', border: '1px dashed var(--pink)', fontSize: '13px', padding: '8px' }}
              onClick={() => setStops([...stops, ''])}>+ Add Stop (+$0.50)</button>
          )}
          <input type="text" placeholder="🏁 Dropoff Address" value={dropoff} onChange={e => setDropoff(e.target.value)} />

          <div>
            <p style={{ fontSize: '12px', color: 'var(--light-gray)', marginBottom: '6px' }}>Quick Picks:</p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {CHATTANOOGA_QUICK_PICKS.map((p, i) => (
                <button key={i} style={{ padding: '6px 10px', fontSize: '11px', background: 'var(--gray)', width: 'auto' }}
                  onClick={() => !pickup ? setPickup(p.address) : setDropoff(p.address)}>{p.name}</button>
              ))}
            </div>
          </div>

          <div className="warning-banner">
            ⚠️ CAR SEAT REQUIREMENT: If a child requires a car seat by TN law, the rider must provide it. Driver may refuse service. $15 cancellation + $10 fuel fee applies if absent.
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px' }}>
            <label>🐾 Pets (+$5):
              <input type="number" min="0" style={{ width: '50px', marginLeft: '6px' }} value={pets} onChange={e => setPets(parseInt(e.target.value)||0)} />
            </label>
            <label>👶 Kids:
              <input type="number" min="0" style={{ width: '50px', marginLeft: '6px' }} value={children} onChange={e => setChildren(parseInt(e.target.value)||0)} />
            </label>
          </div>

          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={isAfterHours} onChange={e => setIsAfterHours(e.target.checked)} />
            🌙 After-Hours Rate (5pm–8pm)
          </label>

          <div style={{ background: 'var(--gray)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid var(--pink)' }}>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--light-gray)' }}>Estimated Fare</p>
            <p style={{ margin: '4px 0 0', fontSize: '28px', fontWeight: '900', color: 'var(--pink)' }}>${estimatedFare}</p>
          </div>

          <button onClick={processStripeCheckout} style={{ background: '#635BFF' }} disabled={loading || !pickup || !dropoff}>
            🔒 Pay & Request Ride
          </button>
          <button onClick={() => supabase.auth.signOut()} style={{ background: '#333' }}>Log Out</button>
        </div>
      )}

      {view === 'driver_dashboard' && <DriverDashboard />}

      {view === 'active_ride' && activeRide && (
        <div style={s}>
          <h3 style={{ color: 'var(--pink)' }}>
            {user?.id === ADMIN_UID ? '🚗 Active Ride' : '🌸 Your Ride'}
          </h3>
          <div style={{ background: '#222', borderRadius: '10px', padding: '16px', border: '1px solid var(--pink)', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: 'var(--light-gray)' }}>🗺️ Live Tracking Active</p>
            <p style={{ color: 'var(--pink)', fontWeight: 'bold', fontSize: '16px', margin: '8px 0' }}>
              Status: {activeRide.status.replace('_', ' ').toUpperCase()}
            </p>
          </div>

          <div style={{ background: 'var(--gray)', borderRadius: '10px', padding: '16px' }}>
            <p><strong>{activeRide.rider_name}</strong> · {activeRide.rider_phone}</p>
            <p style={{ fontSize: '13px', color: 'var(--light-gray)', marginTop: '8px' }}>📍 {activeRide.pickup_address}</p>
            <p style={{ fontSize: '13px', color: 'var(--light-gray)' }}>🏁 {activeRide.dropoff_address}</p>
            <p style={{ color: 'var(--pink)', fontWeight: 'bold', marginTop: '8px' }}>Fare: ${activeRide.calculated_fare}</p>
          </div>

          {user?.id === ADMIN_UID && (
            <div style={s}>
              {activeRide.status === 'accepted' && (
                <button onClick={() => updateRideStatus(activeRide.id, 'arrived')}>📍 Mark Arrived at Pickup</button>
              )}
              {activeRide.status === 'arrived' && (
                <>
                  <div style={{ textAlign: 'center', color: '#ff6666', fontWeight: 'bold' }}>
                    ⏱️ Wait Time: {Math.floor(waitTime/60)}m {waitTime%60}s
                    {waitTime > 300 && <span style={{ color: '#ffaa00' }}> (+$0.15/min)</span>}
                  </div>
                  <button onClick={() => updateRideStatus(activeRide.id, 'in_progress')} style={{ background: '#1565c0' }}>
                    🚗 Rider Picked Up — Start Ride
                  </button>
                </>
              )}
              {activeRide.status === 'in_progress' && (
                <button onClick={() => updateRideStatus(activeRide.id, 'completed')} style={{ background: '#2e7d32' }}>
                  ✅ Complete Ride
                </button>
              )}
              <button onClick={() => setView('driver_dashboard')} style={{ background: '#333' }}>← Back to Dashboard</button>
            </div>
          )}

          {user?.id !== ADMIN_UID && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--light-gray)' }}>
              <p>Your driver is on the way! 🚗💕</p>
              <p style={{ fontSize: '13px' }}>Status: <strong style={{ color: 'var(--pink)' }}>{activeRide.status.replace('_',' ').toUpperCase()}</strong></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
