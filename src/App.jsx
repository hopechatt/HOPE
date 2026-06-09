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
        if (profile?.id === ADMIN_UID) fetchPendingRequests();
        if (payload.new && (payload.new.rider_id === user.id || profile?.id === ADMIN_UID)) {
          setActiveRide(payload.new);
          if (payload.new.status === 'completed') setView(profile?.id === ADMIN_UID ? 'driver_dashboard' : 'client_dashboard');
          else if (payload.new.status !== 'pending') setView('active_ride');
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, profile]);

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
    if (activeRide?.status === 'arrived' && profile?.id === ADMIN_UID) {
      timerRef.current = setInterval(() => setWaitTime(prev => prev + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setWaitTime(0);
    }
    return () => clearInterval(timerRef.current);
  }, [activeRide?.status, profile]);

  const handleUserSession = async (currUser) => {
    setUser(currUser);
    const { data } = await supabase.from('profiles').select('*').eq('id', currUser.id).single();
    setProfile(data);
    if (currUser.id === ADMIN_UID) { setView('driver_dashboard'); fetchPendingRequests(); }
    else setView('client_dashboard');
  };

  const fetchPendingRequests = async () => {
    const { data } = await supabase.from('rides').select('*').eq('status', 'pending').order('created_at', { ascending: true });
    setPendingRequests(data || []);
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
        rider_id: user.id, rider_name: profile.full_name, rider_phone: profile.phone_number,
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
    else if (nextStatus === 'completed') { update.completed_at = new Date().toISOString(); triggerAudioNav("Ride complete."); setView('driver_dashboard'); setActiveRide(null); }
    await supabase.from('rides').update(update).eq('id', rideId);
    fetchPendingRequests();
  };

  const s = { display: 'flex', flexDirection: 'column', gap: '12px' };

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
              const s = [...stops]; s[i] = e.target.value; setStops(s);
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

      {view === 'driver_dashboard' && (
        <div style={s}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--pink)', margin: 0 }}>Driver Console</h3>
            <button style={{ width: 'auto', padding: '8px 14px', background: driverOnline ? '#2e7d32' : '#555' }}
              onClick={() => setDriverOnline(!driverOnline)}>
              {driverOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
            </button>
          </div>

          <p style={{ color: 'var(--light-gray)', fontSize: '13px' }}>Pending Requests: {pendingRequests.length}</p>

          {pendingRequests.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--light-gray)' }}>
              <p style={{ fontSize: '32px' }}>🌸</p>
              <p>No pending rides. You're all caught up!</p>
            </div>
          )}

          {pendingRequests.map(req => (
            <div key={req.id} style={{ background: 'var(--gray)', padding: '16px', borderRadius: '10px', border: '1px solid #444' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>👤 {req.rider_name}</p>
              <p style={{ fontSize: '13px', color: 'var(--light-gray)' }}>📍 {req.pickup_address}</p>
              <p style={{ fontSize: '13px', color: 'var(--light-gray)' }}>🏁 {req.dropoff_address}</p>
              <p style={{ color: 'var(--pink)', fontWeight: 'bold', margin: '8px 0' }}>Fare: ${req.calculated_fare}</p>
              {req.pet_count > 0 && <p style={{ fontSize: '12px' }}>🐾 {req.pet_count} pet(s)</p>}
              {req.child_count > 0 && <p style={{ fontSize: '12px' }}>👶 {req.child_count} child(ren)</p>}
              <button style={{ background: '#2e7d32', marginTop: '10px' }} onClick={() => updateRideStatus(req.id, 'accepted')}>
                ✅ Accept Ride
              </button>
            </div>
          ))}
          <button onClick={() => supabase.auth.signOut()} style={{ background: '#333', marginTop: '20px' }}>Log Out</button>
        </div>
      )}

      {view === 'active_ride' && activeRide && (
        <div style={s}>
          <h3 style={{ color: 'var(--pink)' }}>Ride In Progress</h3>
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
          </div>

          {profile?.id === ADMIN_UID && (
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
                  <button style={{ background: '#2e7d32' }} onClick={() => updateRideStatus(activeRide.id, 'in_progress')}>
                    🚗 Rider Boarded — Start Route
                  </button>
                </>
              )}
              {activeRide.status === 'in_progress' && (
                <button style={{ background: '#1565c0' }} onClick={() => updateRideStatus(activeRide.id, 'completed')}>
                  ✅ Mark Dropoff Complete
                </button>
              )}
              <button style={{ background: '#c62828', fontSize: '13px' }} onClick={() => updateRideStatus(activeRide.id, 'completed')}>
                ❌ Cancel Ride ($15 fee applies)
              </button>
            </div>
          )}

          {profile?.id !== ADMIN_UID && (
            <div style={{ background: 'var(--gray)', padding: '20px', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--pink)' }}>
              {activeRide.status === 'accepted' && <p>🚗 Your Hope driver is on the way...</p>}
              {activeRide.status === 'arrived' && (
                <p style={{ color: 'var(--pink)', fontWeight: 'bold' }}>
                  🔔 Hope has arrived! Please board within 5 minutes.
                </p>
              )}
              {activeRide.status === 'in_progress' && <p>✨ Ride in progress. Sit back and relax!</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
