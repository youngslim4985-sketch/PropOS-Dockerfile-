import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  BrainCircuit, 
  Settings, 
  LogOut, 
  Plus, 
  Search, 
  TrendingUp, 
  MapPin, 
  DollarSign,
  ChevronRight,
  Filter,
  BarChart3,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  getDoc,
  query,
  where,
  OperationType,
  handleFirestoreError
} from './firebase';
import { GoogleGenAI, Type } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format } from 'date-fns';
import { cn } from './lib/utils';

// --- Types ---
interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'agent' | 'client';
  createdAt: any;
}

interface Property {
  id: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  status: 'active' | 'pending' | 'sold';
  imageUrl: string;
  ownerUid: string;
  createdAt: any;
}

interface DealAnalysis {
  id: string;
  propertyId: string;
  userUid: string;
  score: number;
  summary: string;
  pros: string[];
  cons: string[];
  roi: number;
  createdAt: any;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200" 
        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    )}
  >
    <Icon size={20} className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")} />
    <span className="font-medium text-sm">{label}</span>
    {active && (
      <motion.div 
        layoutId="active-pill"
        className="ml-auto w-1.5 h-1.5 rounded-full bg-white"
      />
    )}
  </button>
);

const StatCard = ({ label, value, trend, icon: Icon }: { label: string, value: string, trend?: string, icon: any }) => (
  <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className="p-2 bg-zinc-50 rounded-lg text-zinc-600">
        <Icon size={20} />
      </div>
      {trend && (
        <span className={cn(
          "text-xs font-semibold px-2 py-1 rounded-full",
          trend.startsWith('+') ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {trend}
        </span>
      )}
    </div>
    <p className="text-zinc-500 text-sm font-medium mb-1">{label}</p>
    <h3 className="text-2xl font-bold text-zinc-900">{value}</h3>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'properties' | 'analysis' | 'settings'>('dashboard');
  const [properties, setProperties] = useState<Property[]>([]);
  const [analyses, setAnalyses] = useState<DealAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DealAnalysis | null>(null);
  const hasSeeded = useRef(false);

  // AI Setup
  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setUser(userSnap.data() as UserProfile);
          } else {
            const newUser: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'New User',
              photoURL: firebaseUser.photoURL || '',
              role: 'client',
              createdAt: new Date()
            };
            await setDoc(userRef, newUser);
            setUser(newUser);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const propsQuery = collection(db, 'properties');
    const unsubProps = onSnapshot(propsQuery, (snapshot) => {
      setProperties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'properties'));

    const dealsQuery = query(collection(db, 'deals'), where('userUid', '==', user.uid));
    const unsubDeals = onSnapshot(dealsQuery, (snapshot) => {
      setAnalyses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealAnalysis)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'deals'));

    return () => {
      unsubProps();
      unsubDeals();
    };
  }, [user]);

  // Seed initial data if empty
  useEffect(() => {
    if (!user || user.role !== 'admin' || hasSeeded.current || properties.length > 0) return;

    const seedData = async () => {
      hasSeeded.current = true;
      console.log("Seeding initial properties...");
      const initialProps: Property[] = [
        {
          id: 'prop_1',
          address: '123 Ocean Drive, Miami, FL',
          price: 1250000,
          bedrooms: 4,
          bathrooms: 3,
          sqft: 2800,
          status: 'active',
          imageUrl: 'https://picsum.photos/seed/miami/800/600',
          ownerUid: user.uid,
          createdAt: new Date()
        },
        {
          id: 'prop_2',
          address: '456 Mountain View, Aspen, CO',
          price: 2400000,
          bedrooms: 5,
          bathrooms: 4.5,
          sqft: 4200,
          status: 'active',
          imageUrl: 'https://picsum.photos/seed/aspen/800/600',
          ownerUid: user.uid,
          createdAt: new Date()
        },
        {
          id: 'prop_3',
          address: '789 Skyline Blvd, New York, NY',
          price: 3100000,
          bedrooms: 3,
          bathrooms: 3,
          sqft: 2100,
          status: 'pending',
          imageUrl: 'https://picsum.photos/seed/nyc/800/600',
          ownerUid: user.uid,
          createdAt: new Date()
        }
      ];

      for (const p of initialProps) {
        try {
          await setDoc(doc(db, 'properties', p.id), p);
        } catch (error) {
          console.error(`Failed to seed property ${p.id}:`, error);
        }
      }
    };

    seedData();
  }, [user, properties.length]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const runAnalysis = async (property: Property) => {
    if (!user) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const prompt = `Analyze this real estate property as an investment opportunity:
      Address: ${property.address}
      Price: $${property.price}
      Specs: ${property.bedrooms}BR, ${property.bathrooms}BA, ${property.sqft} sqft
      Status: ${property.status}
      
      Provide a structured analysis including an investment score (0-100), a summary, pros, cons, and estimated ROI.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              summary: { type: Type.STRING },
              pros: { type: Type.ARRAY, items: { type: Type.STRING } },
              cons: { type: Type.ARRAY, items: { type: Type.STRING } },
              roi: { type: Type.NUMBER }
            },
            required: ["score", "summary", "pros", "cons", "roi"]
          }
        }
      });

      const result = JSON.parse(response.text);
      const newDealData = {
        propertyId: property.id,
        userUid: user.uid,
        ...result,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'deals'), newDealData);
      const newDeal: DealAnalysis = {
        id: docRef.id,
        ...newDealData
      };

      setAnalysisResult(newDeal);
      setActiveTab('analysis');
    } catch (error) {
      console.error("Analysis failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-zinc-50">
        <Loader2 className="animate-spin text-zinc-400" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-zinc-200">
            <Building2 className="text-white" size={32} />
          </div>
          <h1 className="text-4xl font-bold text-zinc-900 mb-4 tracking-tight">PropOS</h1>
          <p className="text-zinc-500 mb-10 text-lg leading-relaxed">
            The intelligent operating system for modern real estate professionals.
          </p>
          <button
            onClick={handleLogin}
            className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200 active:scale-[0.98]"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-zinc-100 flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center shadow-lg shadow-zinc-200">
            <Building2 className="text-white" size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight">PropOS</span>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={Building2} 
            label="Properties" 
            active={activeTab === 'properties'} 
            onClick={() => setActiveTab('properties')} 
          />
          <SidebarItem 
            icon={BrainCircuit} 
            label="AI Analysis" 
            active={activeTab === 'analysis'} 
            onClick={() => setActiveTab('analysis')} 
          />
          <SidebarItem 
            icon={Settings} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-100">
          <div className="flex items-center gap-3 mb-6 px-2">
            <img src={user.photoURL} className="w-10 h-10 rounded-full border-2 border-zinc-100" alt="Profile" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{user.displayName}</p>
              <p className="text-xs text-zinc-500 truncate capitalize">{user.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors font-medium text-sm"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-20 bg-white/80 backdrop-blur-md border-bottom border-zinc-100 flex items-center justify-between px-8 sticky top-0 z-10">
          <h2 className="text-xl font-bold text-zinc-900 capitalize">{activeTab}</h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                type="text" 
                placeholder="Search properties..." 
                className="pl-10 pr-4 py-2 bg-zinc-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 transition-all w-64"
              />
            </div>
            <button className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-xl transition-colors">
              <Filter size={20} />
            </button>
            <button 
              onClick={() => setActiveTab('properties')}
              className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-md active:scale-95"
            >
              <Plus size={18} />
              New Deal
            </button>
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard label="Total Properties" value={properties.length.toString()} trend="+12%" icon={Building2} />
                  <StatCard label="Active Deals" value={analyses.length.toString()} trend="+5%" icon={TrendingUp} />
                  <StatCard label="Avg. ROI" value="14.2%" trend="+2.1%" icon={TrendingUp} />
                  <StatCard label="Market Value" value="$4.2M" trend="+8%" icon={DollarSign} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-zinc-900">Market Performance</h3>
                      <div className="flex gap-2">
                        <button className="text-xs font-semibold px-3 py-1 bg-zinc-900 text-white rounded-lg">1M</button>
                        <button className="text-xs font-semibold px-3 py-1 text-zinc-500 hover:bg-zinc-100 rounded-lg">6M</button>
                        <button className="text-xs font-semibold px-3 py-1 text-zinc-500 hover:bg-zinc-100 rounded-lg">1Y</button>
                      </div>
                    </div>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[
                          { name: 'Jan', value: 4000 },
                          { name: 'Feb', value: 3000 },
                          { name: 'Mar', value: 5000 },
                          { name: 'Apr', value: 4500 },
                          { name: 'May', value: 6000 },
                          { name: 'Jun', value: 5500 },
                        ]}>
                          <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#18181b" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#71717a'}} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#71717a'}} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Area type="monotone" dataKey="value" stroke="#18181b" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm">
                    <h3 className="font-bold text-zinc-900 mb-6">Recent Analyses</h3>
                    <div className="space-y-4">
                      {analyses.slice(0, 5).map(deal => (
                        <div key={deal.id} className="flex items-center gap-4 p-3 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer group">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs",
                            deal.score > 80 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                          )}>
                            {deal.score}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 truncate">Property Analysis</p>
                            <p className="text-xs text-zinc-500">{format(new Date(deal.createdAt), 'MMM d, yyyy')}</p>
                          </div>
                          <ChevronRight size={16} className="text-zinc-300 group-hover:text-zinc-900 transition-colors" />
                        </div>
                      ))}
                      {analyses.length === 0 && (
                        <div className="text-center py-10">
                          <BrainCircuit className="mx-auto text-zinc-200 mb-2" size={32} />
                          <p className="text-sm text-zinc-400">No analyses yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'properties' && (
              <motion.div 
                key="properties"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {properties.map(prop => (
                  <div key={prop.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
                    <div className="relative h-48 overflow-hidden">
                      <img 
                        src={prop.imageUrl || `https://picsum.photos/seed/${prop.id}/800/600`} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        alt={prop.address}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-zinc-900 shadow-sm">
                        ${prop.price.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-bold text-zinc-900 line-clamp-1">{prop.address}</h4>
                      </div>
                      <div className="flex items-center gap-4 text-zinc-500 text-xs mb-6">
                        <div className="flex items-center gap-1">
                          <Building2 size={14} />
                          {prop.bedrooms} Bed
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin size={14} />
                          {prop.sqft} sqft
                        </div>
                      </div>
                      <button 
                        onClick={() => runAnalysis(prop)}
                        disabled={isAnalyzing}
                        className="w-full bg-zinc-50 text-zinc-900 py-3 rounded-xl text-sm font-semibold hover:bg-zinc-900 hover:text-white transition-all flex items-center justify-center gap-2 group/btn"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <>
                            <BrainCircuit size={16} className="group-hover/btn:scale-110 transition-transform" />
                            Analyze Deal
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
                
                {properties.length === 0 && (
                  <div className="col-span-full py-20 bg-white rounded-2xl border border-dashed border-zinc-200 flex flex-col items-center justify-center text-center">
                    <Building2 className="text-zinc-200 mb-4" size={48} />
                    <h3 className="text-lg font-bold text-zinc-900 mb-1">No properties found</h3>
                    <p className="text-zinc-500 text-sm max-w-xs">
                      Your property portfolio is currently empty. Add your first property to start analyzing deals.
                    </p>
                  </div>
                )}
                
                {/* Mock Add Property Card */}
                <button className="border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center p-8 text-zinc-400 hover:border-zinc-900 hover:text-zinc-900 transition-all group">
                  <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center mb-4 group-hover:bg-zinc-900 group-hover:text-white transition-all">
                    <Plus size={24} />
                  </div>
                  <span className="font-semibold">Add Property</span>
                </button>
              </motion.div>
            )}

            {activeTab === 'analysis' && (
              <motion.div 
                key="analysis"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto"
              >
                {analysisResult ? (
                  <div className="space-y-8">
                    <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className="text-2xl font-bold text-zinc-900 mb-1">Deal Analysis Report</h3>
                          <p className="text-zinc-500 text-sm">Generated on {format(new Date(analysisResult.createdAt), 'MMMM d, yyyy')}</p>
                        </div>
                        <div className={cn(
                          "w-20 h-20 rounded-2xl flex flex-col items-center justify-center shadow-lg",
                          analysisResult.score > 80 ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                        )}>
                          <span className="text-2xl font-bold">{analysisResult.score}</span>
                          <span className="text-[10px] uppercase font-bold opacity-80">Score</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-4">
                          <h4 className="font-bold text-zinc-900 flex items-center gap-2">
                            <TrendingUp size={18} className="text-emerald-500" />
                            Key Pros
                          </h4>
                          <ul className="space-y-2">
                            {analysisResult.pros.map((pro, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                                <ChevronRight size={14} className="mt-1 text-emerald-500 shrink-0" />
                                {pro}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-4">
                          <h4 className="font-bold text-zinc-900 flex items-center gap-2">
                            <AlertCircle size={18} className="text-rose-500" />
                            Risk Factors
                          </h4>
                          <ul className="space-y-2">
                            {analysisResult.cons.map((con, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                                <ChevronRight size={14} className="mt-1 text-rose-500 shrink-0" />
                                {con}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="p-6 bg-zinc-50 rounded-2xl">
                        <h4 className="font-bold text-zinc-900 mb-3">AI Executive Summary</h4>
                        <div className="markdown-body text-zinc-600 leading-relaxed">
                          <ReactMarkdown>{analysisResult.summary}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 bg-white rounded-3xl border border-zinc-100 shadow-sm">
                    <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <BrainCircuit className="text-zinc-300" size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 mb-2">No Active Analysis</h3>
                    <p className="text-zinc-500 mb-8 max-w-sm mx-auto">
                      Select a property from your listings to run a deep AI investment analysis.
                    </p>
                    <button 
                      onClick={() => setActiveTab('properties')}
                      className="bg-zinc-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-zinc-800 transition-all"
                    >
                      Browse Properties
                    </button>
                  </div>
                )}
              </motion.div>
            )}
            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto"
              >
                <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="h-32 bg-zinc-900 relative">
                    <div className="absolute -bottom-12 left-8">
                      <img 
                        src={user.photoURL} 
                        className="w-24 h-24 rounded-3xl border-4 border-white shadow-lg" 
                        alt="Profile" 
                      />
                    </div>
                  </div>
                  <div className="pt-16 pb-8 px-8">
                    <div className="mb-8">
                      <h3 className="text-2xl font-bold text-zinc-900">{user.displayName}</h3>
                      <p className="text-zinc-500">{user.email}</p>
                      <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800 capitalize">
                        {user.role} Account
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl">
                        <div>
                          <p className="font-semibold text-zinc-900">Email Notifications</p>
                          <p className="text-xs text-zinc-500">Receive weekly market reports</p>
                        </div>
                        <div className="w-12 h-6 bg-zinc-900 rounded-full relative cursor-pointer">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl">
                        <div>
                          <p className="font-semibold text-zinc-900">AI Analysis Depth</p>
                          <p className="text-xs text-zinc-500">Balance speed and detail</p>
                        </div>
                        <select className="bg-white border-none rounded-lg text-sm font-medium focus:ring-2 focus:ring-zinc-900">
                          <option>Standard</option>
                          <option>Deep Dive</option>
                          <option>Executive</option>
                        </select>
                      </div>

                      <div className="pt-6 border-t border-zinc-100">
                        <button 
                          onClick={handleLogout}
                          className="w-full py-3 rounded-xl border-2 border-rose-100 text-rose-500 font-semibold hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
                        >
                          <LogOut size={18} />
                          Sign Out of All Devices
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

