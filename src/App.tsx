
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Plus, 
  Coins, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2, 
  History, 
  Home, 
  MessageCircle, 
  Send,
  User,
  LogOut,
  Trophy,
  Activity,
  UserPlus,
  LogIn,
  Settings,
  ShieldAlert,
  Trash2,
  MinusCircle,
  Eye,
  RefreshCcw,
  Mail,
  Lock,
  ChevronRight,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  increment,
  addDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { OperationType, FirestoreErrorInfo, UserProfile, LinkEntry, SocialPost } from './types';

// --- Error Handler ---
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center p-6 text-center">
      <motion.div 
        animate={{ scale: [1, 1.1, 1], rotate: [0, 90, 180, 270, 360] }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mb-4 shadow-[0_0_20px_-5px_rgba(37,99,235,0.4)]"
      />
      <h2 className="text-xl font-bold text-white tracking-tight">Initializing LinkFlow</h2>
      <p className="text-gray-500 text-sm mt-2">Connecting to secure servers...</p>
    </div>
  );
}

export default function App() {
  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'signup' | 'forgot'>('login');
  
  // App State
  const [activeTab, setActiveTab] = useState<'earn' | 'submit' | 'social' | 'admin'>('earn');
  const [credits, setCredits] = useState(0);
  const [myLinks, setMyLinks] = useState<LinkEntry[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  
  const [currentTask, setCurrentTask] = useState<LinkEntry | null>(null);
  const [timer, setTimer] = useState(40);
  const [isTaskActive, setIsTaskActive] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskSuccess, setTaskSuccess] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Auth Handlers ---
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDocRef = doc(db, 'users', u.uid);
        try {
          await getDocFromServer(doc(db, 'test', 'connection')).catch(() => {});
          
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setProfile({ uid: u.uid, ...userDoc.data() } as UserProfile);
            setCredits(userDoc.data().credits);
          }
        } catch (e) {
          console.error("Error fetching profile", e);
        }
      } else {
        setProfile(null);
        setCredits(0);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setActiveTab('earn');
    } catch (e) {
      console.error(e);
    }
  };

  // --- Task System Logic ---
  
  const loadNextLink = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'links'), 
        where('viewsRemaining', '>', 0),
        orderBy('viewsRemaining', 'desc'),
        limit(20)
      );
      const querySnapshot = await getDocs(q);
      const available = querySnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as LinkEntry))
        .filter(l => l.ownerId !== user.uid);

      if (available.length === 0) {
        setCurrentTask(null);
        return;
      }
      
      const random = available[Math.floor(Math.random() * available.length)];
      setCurrentTask(random);
      setTimer(40);
      setTaskError(null);
      setTaskSuccess(false);
      setIsTaskActive(false);
    } catch (error) {
      console.error(error);
    }
  }, [user]);

  useEffect(() => {
    if (user && !currentTask && activeTab === 'earn') {
      loadNextLink();
    }
  }, [user, activeTab, currentTask, loadNextLink]);

  const stopTask = (error: string | null = null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsTaskActive(false);
    if (error) {
      setTaskError(error);
      setTimer(40);
    }
  };

  const completeTask = async () => {
    if (!user || !currentTask) return;
    if (timerRef.current) clearInterval(timerRef.current);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { credits: increment(1) });
      
      const linkRef = doc(db, 'links', currentTask.id);
      await updateDoc(linkRef, { viewsRemaining: increment(-1) });

      await addDoc(collection(db, 'taskLogs'), {
        userId: user.uid,
        linkId: currentTask.id,
        completedAt: serverTimestamp()
      });

      setTaskSuccess(true);
      setIsTaskActive(false);
      
      setTimeout(() => {
        loadNextLink();
      }, 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const startTask = () => {
    if (!currentTask) return;
    window.open(currentTask.url, '_blank', 'noreferrer');
    setIsTaskActive(true);
    setTaskError(null);
    setTimer(40);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          completeTask();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isTaskActive) {
        stopTask("Cheating detected! Tab switched during timer. Task failed.");
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTaskActive]);

  // --- Real-time Data ---
  
  useEffect(() => {
    if (!user) return;
    const qMyLinks = query(collection(db, 'links'), where('ownerId', '==', user.uid));
    const unsubMyLinks = onSnapshot(qMyLinks, (snapshot) => {
      setMyLinks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LinkEntry)));
    });

    const qPosts = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(20));
    const unsubPosts = onSnapshot(qPosts, (snapshot) => {
      setPosts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SocialPost)));
    });

    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setProfile({ uid: user.uid, ...data } as UserProfile);
        setCredits(data.credits);
      }
    });

    return () => {
      unsubMyLinks();
      unsubPosts();
      unsubProfile();
    };
  }, [user]);

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-gray-200 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {authView === 'login' && <LoginView setView={setAuthView} />}
          {authView === 'signup' && <SignupView setView={setAuthView} />}
          {authView === 'forgot' && <ForgotView setView={setAuthView} />}
        </AnimatePresence>
      </div>
    );
  }

  if (profile?.isBlocked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20 shadow-[0_0_20px_-5px_rgba(239,68,68,0.4)]">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2 tracking-tight">Account Restricted</h1>
        <p className="text-gray-500 max-w-xs mb-8 font-medium">
          Your access has been revoked due to anti-cheat violations.
        </p>
        <button onClick={handleSignOut} className="px-8 py-3 bg-white text-black font-black rounded-2xl hover:bg-gray-200 transition-all">
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-gray-200 font-sans selection:bg-blue-500/30 pb-32">
      <header className="sticky top-0 z-50 bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_-3px_rgba(37,99,235,0.4)]">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase italic">LinkFlow</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="font-black text-sm tracking-tighter tabular-nums">{credits}</span>
          </div>
          {profile?.isAdmin && (
            <button 
              onClick={() => setActiveTab('admin')}
              className={`p-2 rounded-full border transition-all ${activeTab === 'admin' ? 'bg-purple-600/20 border-purple-500/50 text-purple-400' : 'bg-white/5 border-white/10 text-gray-600'}`}
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button onClick={handleSignOut} className="p-2 rounded-full bg-white/5 border border-white/10 text-gray-600 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 pt-6">
        <AnimatePresence mode="wait">
          {activeTab === 'earn' && <EarnView currentTask={currentTask} timer={timer} isTaskActive={isTaskActive} taskSuccess={taskSuccess} taskError={taskError} startTask={startTask} />}
          {activeTab === 'submit' && <SubmitView credits={credits} myLinks={myLinks} user={user} profile={profile} />}
          {activeTab === 'social' && <SocialView posts={posts} user={user} profile={profile} />}
          {activeTab === 'admin' && profile?.isAdmin && <AdminView />}
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0f0f0f]/80 backdrop-blur-2xl border-t border-white/5 px-8 pt-4 pb-10 z-[60]">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <NavBtn active={activeTab === 'earn'} onClick={() => setActiveTab('earn')} icon={<Home className="w-6 h-6" />} label="Mine" />
          <NavBtn active={activeTab === 'submit'} onClick={() => setActiveTab('submit')} icon={<Plus className="w-6 h-6" />} label="Blast" />
          <NavBtn active={activeTab === 'social'} onClick={() => setActiveTab('social')} icon={<MessageCircle className="w-6 h-6" />} label="Feed" />
        </div>
      </nav>
    </div>
  );
}

// --- Specific Views ---

function LoginView({ setView }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm bg-[#1a1a1a] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-600/30">
          <Activity className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-black text-white tracking-tight">Access Hub</h2>
        <p className="text-gray-500 mt-2 text-sm font-medium">Mine credits, boost views.</p>
      </div>
      <form onSubmit={handleLogin} className="space-y-4">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:border-blue-500/50 transition-all font-bold text-sm" required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:border-blue-500/50 transition-all font-bold text-sm" required />
        <button type="button" onClick={() => setView('forgot')} className="text-[11px] font-black text-blue-500 uppercase tracking-widest block ml-1 hover:text-blue-400">Forgot Code?</button>
        {error && <p className="text-red-500 text-xs font-bold bg-red-500/10 p-3 rounded-xl">{error}</p>}
        <button disabled={loading} className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 transition-all">{loading ? 'Verifying...' : 'Sign In'}</button>
      </form>
      <button onClick={() => setView('signup')} className="w-full mt-8 text-gray-500 text-sm font-bold">New here? <span className="text-white">Create Account</span></button>
    </motion.div>
  );
}

function SignupView({ setView }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', u.user.uid), { name, email, credits: 0, isBlocked: false, isAdmin: false, createdAt: Date.now() });
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-sm bg-[#1a1a1a] border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
      <h2 className="text-3xl font-black text-white tracking-tight mb-2">Deploy Account</h2>
      <p className="text-gray-500 mb-8 font-medium">Kickstart with 5 free credits.</p>
      <form onSubmit={handleSignup} className="space-y-4">
        <input type="text" placeholder="Avatar Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 focus:border-blue-500 font-bold" required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 focus:border-blue-500 font-bold" required />
        <input type="password" placeholder="Key Phrase" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 focus:border-blue-500 font-bold" required />
        {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
        <button disabled={loading} className="w-full py-5 bg-white text-black font-black rounded-2xl active:scale-95 transition-all text-lg">{loading ? 'Deploying...' : 'Register'}</button>
      </form>
      <button onClick={() => setView('login')} className="w-full mt-8 text-gray-500 text-sm font-bold">Already registered? Log In</button>
    </motion.div>
  );
}

function ForgotView({ setView }: any) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleReset = async (e: any) => {
    e.preventDefault();
    try { await sendPasswordResetEmail(auth, email); setSent(true); } 
    catch (e) { alert("Failed to send reset link."); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm bg-[#1a1a1a] p-8 rounded-[2.5rem] shadow-2xl border border-white/5">
      <h2 className="text-2xl font-black text-white mb-8">Restore Access</h2>
      {sent ? <p className="text-green-500 font-bold p-4 bg-green-500/10 rounded-2xl mb-6">Check your inbox for instructions.</p> : (
        <form onSubmit={handleReset} className="space-y-6">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-white/5 border-white/10 rounded-2xl py-4 px-6 font-bold" required />
          <button className="w-full py-4 bg-white text-black font-black rounded-2xl">Send Link</button>
        </form>
      )}
      <button onClick={() => setView('login')} className="w-full text-sm font-bold text-gray-600 mt-6 uppercase tracking-widest">Abort</button>
    </motion.div>
  );
}

function EarnView({ currentTask, timer, isTaskActive, taskSuccess, taskError, startTask }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
       <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 rounded-full text-[10px] font-black text-blue-400 uppercase tracking-widest">
          <Trophy className="w-3 h-3" /> Mine Active
        </div>
        <div className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">+1 CR / TASK</div>
      </div>

      {currentTask ? (
        <div className="bg-[#1a1a1a] border border-white/5 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 rotate-12 opacity-5"><ExternalLink className="w-16 h-16 text-white" /></div>
          <span className="text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] block mb-4">Target: {currentTask.ownerName}</span>
          <h2 className="text-3xl font-black text-white mb-2 leading-none tracking-tight">{currentTask.title}</h2>
          <p className="text-gray-500 text-sm mb-12 truncate font-medium border-l-2 border-blue-600 pl-4 bg-white/5 py-2 rounded-r-xl">{currentTask.url}</p>

          <div className="flex items-center justify-center py-4">
            <div className="relative flex items-center justify-center">
              <svg className="w-44 h-44 transform -rotate-90">
                <circle cx="88" cy="88" r="82" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-white/5" />
                <motion.circle cx="88" cy="88" r="82" stroke="currentColor" strokeWidth="10" fill="transparent" strokeDasharray={515} animate={{ strokeDashoffset: 515 - (515 * timer) / 40 }} transition={{ duration: 1, ease: "linear" }} className={isTaskActive ? 'text-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'text-gray-800'} />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-6xl font-black text-white tracking-tighter tabular-nums">{timer}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-700 mt-2">Sec Left</span>
              </div>
            </div>
          </div>

          <div className="mt-14 space-y-4">
            {!isTaskActive && !taskSuccess && <button onClick={startTask} className="w-full py-5 bg-blue-600 text-white font-black text-xl rounded-[2rem] shadow-2xl shadow-blue-900/30 active:scale-95 transition-all flex items-center justify-center gap-3"><LogIn className="w-6 h-6" /> Deploy Task</button>}
            {isTaskActive && <div className="bg-blue-600/10 border border-blue-500/20 py-6 rounded-[2rem] text-blue-400 font-black text-center animate-pulse flex items-center justify-center gap-3 tracking-widest uppercase text-xs">Engagement Lock On</div>}
            {taskSuccess && <p className="bg-green-500/20 border border-green-500/30 p-6 rounded-[2rem] text-green-400 font-black text-center tracking-widest text-xs uppercase animate-bounce">Success! Credit Mined</p>}
            {taskError && <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-[2rem] flex items-center gap-4 text-red-500 text-xs font-black uppercase tracking-tight leading-relaxed">{taskError}</div>}
          </div>
        </div>
      ) : <p className="text-center py-32 text-gray-700 font-black uppercase tracking-[0.4em]">Grid Empty</p>}
    </motion.div>
  );
}

function SubmitView({ credits, myLinks, user }: any) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (credits < 1 || loading) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { credits: increment(-1) });
      await addDoc(collection(db, 'links'), { url, title, ownerId: user.uid, ownerName: auth.currentUser?.displayName || 'User', viewsRemaining: 1, createdAt: serverTimestamp() });
      setUrl(''); setTitle('');
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'links'); }
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="bg-[#1a1a1a] border border-white/5 rounded-[3rem] p-10 shadow-2xl">
        <h2 className="text-3xl font-black text-white mb-8 tracking-tight">Boost Content</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <input type="text" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-5 font-bold" required />
          <input type="url" placeholder="Link (YouTube/Social)" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-5 font-bold" required />
          <button disabled={credits < 1 || loading} className="w-full py-5 bg-white text-black font-black text-xl rounded-[1.75rem] shadow-xl shadow-white/5 active:scale-95 transition-all">{loading ? 'Deploying...' : 'Spend 1 Credit'}</button>
          {credits < 1 && <p className="text-center text-red-500 font-black text-[10px] tracking-widest uppercase">Insufficient Balance</p>}
        </form>
      </div>
      <div className="space-y-4 px-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-700">Live Campaigns</h3>
        {myLinks.map((l: any) => (
          <div key={l.id} className="bg-white/5 border border-white/5 rounded-3xl p-5 flex items-center justify-between">
            <div className="flex-1 truncate pr-4"><span className="block font-black text-white text-sm truncate">{l.title}</span><span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{new URL(l.url).hostname}</span></div>
            <div className="text-right"><span className="text-2xl font-black text-blue-500 tracking-tighter tabular-nums">{l.viewsRemaining}</span><span className="block text-[8px] font-black text-gray-700 uppercase tracking-widest mt-1">Left</span></div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function SocialView({ posts, user, profile }: any) {
  const [content, setContent] = useState('');
  const handlePost = async (e: any) => {
    e.preventDefault();
    if (!content.trim()) return;
    try { await addDoc(collection(db, 'posts'), { authorId: user.uid, authorName: profile.name, content, likes: 0, createdAt: serverTimestamp() }); setContent(''); }
    catch (e) { handleFirestoreError(e, OperationType.WRITE, 'posts'); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="bg-[#1a1a1a] p-6 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <form onSubmit={handlePost} className="space-y-4">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Say something..." className="w-full bg-white/5 border-white/10 rounded-[1.5rem] p-5 h-28 focus:border-blue-600 font-bold transition-all resize-none" />
          <button className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl text-sm tracking-widest uppercase hover:bg-blue-500 shadow-xl shadow-blue-900/40">Transmit</button>
        </form>
      </div>
      {posts.map((p: any) => (
        <div key={p.id} className="bg-white/5 border-white/5 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center font-black text-blue-500">{p.authorName?.[0]}</div>
            <div>
              <span className="block font-black text-white text-sm">{p.authorName}</span>
              <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest">{p.createdAt instanceof Timestamp ? new Date(p.createdAt.toDate()).toLocaleTimeString() : 'Now'}</span>
            </div>
          </div>
          <p className="text-gray-400 text-sm font-medium leading-relaxed">{p.content}</p>
        </div>
      ))}
    </motion.div>
  );
}

function AdminView() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (s) => setUsers(s.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile))));
    return () => unsub();
  }, []);

  const setStatus = async (uid: string, blocked: boolean) => await updateDoc(doc(db, 'users', uid), { isBlocked: blocked });
  const modCredits = async (uid: string, amt: number) => await updateDoc(doc(db, 'users', uid), { credits: increment(amt) });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h2 className="text-2xl font-black text-white px-2 tracking-tight">Override Console</h2>
      {users.map(u => (
        <div key={u.uid} className={`bg-[#1a1a1a] p-6 rounded-[2.5rem] border ${u.isBlocked ? 'border-red-500/40' : 'border-white/5'} space-y-6`}>
          <div className="flex justify-between items-start">
            <div>
              <span className="block font-black text-white">{u.name}</span>
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{u.email}</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-amber-500 tabular-nums">{u.credits}</span>
              <span className="block text-[8px] font-black text-amber-800 uppercase tracking-widest">Balance</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => modCredits(u.uid, 10)} className="flex-1 bg-white/5 py-3 rounded-2xl font-black text-xs text-green-500">+10</button>
            <button onClick={() => modCredits(u.uid, -10)} className="flex-1 bg-white/5 py-3 rounded-2xl font-black text-xs text-orange-500">-10</button>
            <button onClick={() => setStatus(u.uid, !u.isBlocked)} className={`flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest ${u.isBlocked ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{u.isBlocked ? 'Restore' : 'Purge'}</button>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

function NavBtn({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all relative ${active ? 'text-blue-500' : 'text-gray-700'}`}>
      <div className={`p-3 rounded-2xl transition-all ${active ? 'bg-blue-600/10 scale-110 shadow-lg shadow-blue-900/10' : ''}`}>{icon}</div>
      <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-all ${active ? 'opacity-100' : 'opacity-30'}`}>{label}</span>
      {active && <motion.div layoutId="n-ind" className="absolute -bottom-3 w-1 h-1 bg-blue-500 rounded-full" />}
    </button>
  );
}
