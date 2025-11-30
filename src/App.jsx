import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Settings, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  ArrowLeft, 
  Play, 
  Search, 
  BarChart2, 
  FileText, 
  Download, 
  Upload,
  Clock,
  Menu,
  X
} from 'lucide-react';

// --- Firebase Configuration ---
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCRBxLS1iQh-OM2ejCgsB150gasM1oG4bk",
  authDomain: "uas-master-agung.firebaseapp.com",
  projectId: "uas-master-agung",
  storageBucket: "uas-master-agung.firebasestorage.app",
  messagingSenderId: "1075236873780",
  appId: "1:1075236873780:web:822f3d3297c782b0c4cc61",
  measurementId: "G-XFYTL7MYM5"
};

// --- Firebase Initialization (FIXED) ---
// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Auth and Firestore
const auth = getAuth(app);
const db = getFirestore(app);
// Define appId for database paths
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Math Rendering Helper (KaTeX) ---
const MathRenderer = ({ text }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    // Inject KaTeX stylesheet if not present
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link');
      link.id = 'katex-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css';
      document.head.appendChild(link);
    }
    // Inject KaTeX JS if not present
    if (!window.katex && !document.getElementById('katex-js')) {
      const script = document.createElement('script');
      script.id = 'katex-js';
      script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.js';
      script.onload = () => renderMath();
      document.head.appendChild(script);
    } else {
      renderMath();
    }
  }, [text]);

  const renderMath = () => {
    if (window.katex && containerRef.current) {
      // Basic replace for $$...$$ (display) and $...$ (inline)
      // Note: This is a simplified renderer for demo purposes
      // Safe check: ensure text is string
      const safeText = String(text || "");
      let html = safeText
        .replace(/\$\$(.*?)\$\$/g, (match, p1) => {
          try { return window.katex.renderToString(p1, { displayMode: true }); } catch { return match; }
        })
        .replace(/\$(.*?)\$/g, (match, p1) => {
          try { return window.katex.renderToString(p1, { displayMode: false }); } catch { return match; }
        });
      containerRef.current.innerHTML = html;
    } else {
      if(containerRef.current) containerRef.current.innerText = text;
    }
  };

  return <span ref={containerRef} className="math-content" />;
};

// --- Main Application Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home'); // home, student-course, quiz, result, admin-login, admin-dashboard
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Data State
  const [courses, setCourses] = useState([]);
  const [questions, setQuestions] = useState([]);
  
  // Quiz State
  const [activeCourse, setActiveCourse] = useState(null);
  const [activeQuizQuestions, setActiveQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { questionId: { selectedOption: number, isCorrect: boolean } }
  const [quizConfig, setQuizConfig] = useState({ version: 'A', difficulty: 'all' });
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);

  // --- Auth & Data Loading ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        // FIX: Directly use anonymous auth. 
        // The __initial_auth_token logic causes a mismatch when using a custom Firebase config 
        // inside this environment because the token belongs to the default project.
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Listen to Courses
    const coursesRef = collection(db, 'artifacts', appId, 'public', 'data', 'courses');
    const unsubCourses = onSnapshot(coursesRef, (snapshot) => {
      setCourses(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Course listener error:", err));

    // Listen to Questions
    const questionsRef = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
    const unsubQuestions = onSnapshot(questionsRef, (snapshot) => {
      setQuestions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Question listener error:", err));

    return () => {
      unsubCourses();
      unsubQuestions();
    };
  }, [user]);

  // --- Navigation Helpers ---
  const goHome = () => {
    setView('home');
    setActiveCourse(null);
    setScore(0);
    setUserAnswers({});
    setCurrentQuestionIndex(0);
    setShowExplanation(false);
  };

  // --- Quiz Logic ---
  const startQuiz = (course, version, difficulty) => {
    // Filter questions
    let filtered = questions.filter(q => q.courseId === course.id);
    if (version !== 'all') filtered = filtered.filter(q => q.version === version);
    if (difficulty !== 'all') filtered = filtered.filter(q => q.difficulty === difficulty);

    if (filtered.length === 0) {
      alert("Belum ada soal untuk kriteria ini.");
      return;
    }

    // Shuffle questions
    filtered = filtered.sort(() => Math.random() - 0.5);

    setActiveCourse(course);
    setActiveQuizQuestions(filtered);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setShowExplanation(false);
    setView('quiz');
  };

  const handleAnswer = (optionIndex) => {
    const currentQ = activeQuizQuestions[currentQuestionIndex];
    const isCorrect = optionIndex === currentQ.correctIndex;
    
    setUserAnswers(prev => ({
      ...prev,
      [currentQ.id]: { selectedOption: optionIndex, isCorrect }
    }));
    
    if (isCorrect) setScore(s => s + 1);
    setShowExplanation(true);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < activeQuizQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setShowExplanation(false);
    } else {
      setView('result');
    }
  };

  // --- Components ---

  const Navbar = () => (
    <nav className="bg-indigo-600 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={goHome}>
          <BookOpen className="h-6 w-6" />
          <span className="font-bold text-lg hidden sm:block">UAS Master</span>
        </div>
        <div className="flex gap-3 text-sm">
          <button onClick={goHome} className="hover:text-indigo-200">Home</button>
          <button onClick={() => setView('admin-login')} className="hover:text-indigo-200 font-medium">
             {isAdmin ? 'Dashboard Admin' : 'Login Admin'}
          </button>
        </div>
      </div>
    </nav>
  );

  const AdminDashboard = () => {
    const [tab, setTab] = useState('courses'); // courses, questions
    const [isEditing, setIsEditing] = useState(null);
    const [formData, setFormData] = useState({});
    const [importData, setImportData] = useState('');

    // Course CRUD
    const handleSaveCourse = async () => {
      if (!formData.name || !formData.code) return alert("Nama dan Kode wajib diisi");
      const ref = collection(db, 'artifacts', appId, 'public', 'data', 'courses');
      try {
        if (isEditing) {
          await updateDoc(doc(ref, isEditing), formData);
        } else {
          await addDoc(ref, { ...formData, createdAt: serverTimestamp() });
        }
        setIsEditing(null);
        setFormData({});
      } catch (e) {
        alert("Gagal menyimpan: " + e.message);
      }
    };

    const handleDeleteCourse = async (id) => {
      if (confirm("Hapus mata kuliah ini? Semua soal terkait juga harus dihapus manual.")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', id));
      }
    };

    // Question CRUD
    const handleSaveQuestion = async () => {
      if (!formData.text || !formData.courseId) return alert("Pertanyaan dan Mata Kuliah wajib diisi");
      const ref = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
      
      const payload = {
        courseId: formData.courseId,
        version: formData.version || 'A',
        difficulty: formData.difficulty || 'sedang',
        text: formData.text,
        explanation: formData.explanation || '',
        correctIndex: parseInt(formData.correctIndex || 0),
        options: formData.options || ["", "", "", ""],
        updatedAt: serverTimestamp()
      };

      try {
        if (isEditing) {
          await updateDoc(doc(ref, isEditing), payload);
        } else {
          await addDoc(ref, payload);
        }
        setIsEditing(null);
        setFormData({});
      } catch (e) {
        alert("Gagal menyimpan soal: " + e.message);
      }
    };

    const handleDeleteQuestion = async (id) => {
      if (confirm("Hapus soal ini?")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'questions', id));
      }
    };

    const handleImport = async () => {
      try {
        const parsed = JSON.parse(importData);
        if (!Array.isArray(parsed)) throw new Error("Format harus array JSON");
        
        const batchPromises = parsed.map(q => {
           const ref = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
           return addDoc(ref, { ...q, createdAt: serverTimestamp() });
        });
        
        await Promise.all(batchPromises);
        alert(`Berhasil mengimpor ${parsed.length} soal!`);
        setImportData('');
      } catch (e) {
        alert("Import Gagal: " + e.message);
      }
    };

    const handleExport = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(questions));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "bank_soal_export.json");
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    };

    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Panel Administrator</h2>
          <button onClick={() => { setIsAdmin(false); goHome(); }} className="text-red-500 text-sm">Logout</button>
        </div>

        <div className="flex gap-4 mb-6 border-b pb-1 overflow-x-auto">
          <button onClick={() => { setTab('courses'); setIsEditing(null); setFormData({}); }} className={`px-4 py-2 font-medium ${tab === 'courses' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Mata Kuliah</button>
          <button onClick={() => { setTab('questions'); setIsEditing(null); setFormData({}); }} className={`px-4 py-2 font-medium ${tab === 'questions' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Bank Soal</button>
          <button onClick={() => setTab('import')} className={`px-4 py-2 font-medium ${tab === 'import' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Import / Export</button>
        </div>

        {/* --- COURSES TAB --- */}
        {tab === 'courses' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1 bg-white p-4 rounded-lg shadow h-fit">
              <h3 className="font-bold mb-4">{isEditing ? 'Edit Kuliah' : 'Tambah Kuliah'}</h3>
              <input 
                className="w-full border p-2 rounded mb-3" 
                placeholder="Kode (mis: IF101)" 
                value={formData.code || ''} 
                onChange={e => setFormData({...formData, code: e.target.value})}
              />
              <input 
                className="w-full border p-2 rounded mb-3" 
                placeholder="Nama Mata Kuliah" 
                value={formData.name || ''} 
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
              <div className="flex gap-2">
                <button onClick={handleSaveCourse} className="bg-indigo-600 text-white px-4 py-2 rounded flex-1">Simpan</button>
                {isEditing && <button onClick={() => {setIsEditing(null); setFormData({})}} className="bg-gray-300 px-4 py-2 rounded">Batal</button>}
              </div>
            </div>

            <div className="md:col-span-2 space-y-3">
              {courses.map(c => (
                <div key={c.id} className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
                  <div>
                    <h4 className="font-bold">{c.name}</h4>
                    <p className="text-sm text-gray-500">{c.code}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {setIsEditing(c.id); setFormData(c)}} className="p-2 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={18} /></button>
                    <button onClick={() => handleDeleteCourse(c.id)} className="p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
              {courses.length === 0 && <p className="text-gray-500 italic">Belum ada mata kuliah.</p>}
            </div>
          </div>
        )}

        {/* --- QUESTIONS TAB --- */}
        {tab === 'questions' && (
          <div className="grid lg:grid-cols-3 gap-6">
             <div className="lg:col-span-1 bg-white p-4 rounded-lg shadow h-fit max-h-[90vh] overflow-y-auto">
              <h3 className="font-bold mb-4">{isEditing ? 'Edit Soal' : 'Tambah Soal'}</h3>
              
              <select 
                className="w-full border p-2 rounded mb-3" 
                value={formData.courseId || ''} 
                onChange={e => setFormData({...formData, courseId: e.target.value})}
              >
                <option value="">Pilih Mata Kuliah</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
              </select>

              <div className="flex gap-2 mb-3">
                <select className="border p-2 rounded w-1/2" value={formData.version || 'A'} onChange={e => setFormData({...formData, version: e.target.value})}>
                  <option value="A">Versi A</option>
                  <option value="B">Versi B</option>
                  <option value="C">Versi C</option>
                </select>
                <select className="border p-2 rounded w-1/2" value={formData.difficulty || 'sedang'} onChange={e => setFormData({...formData, difficulty: e.target.value})}>
                  <option value="mudah">Mudah</option>
                  <option value="sedang">Sedang</option>
                  <option value="sulit">Sulit</option>
                </select>
              </div>

              <textarea 
                className="w-full border p-2 rounded mb-3 h-24 text-sm font-mono" 
                placeholder="Pertanyaan (Bisa pakai $LaTeX$)" 
                value={formData.text || ''} 
                onChange={e => setFormData({...formData, text: e.target.value})}
              />

              <label className="text-xs font-bold text-gray-500 mb-1 block">Pilihan Jawaban:</label>
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="flex gap-2 mb-2 items-center">
                  <input 
                    type="radio" 
                    name="correct" 
                    checked={(formData.correctIndex || 0) == idx} 
                    onChange={() => setFormData({...formData, correctIndex: idx})}
                  />
                  <input 
                    className="w-full border p-1 rounded text-sm" 
                    placeholder={`Pilihan ${idx + 1}`}
                    value={formData.options?.[idx] || ''}
                    onChange={(e) => {
                      const newOpts = [...(formData.options || ["", "", "", ""])];
                      newOpts[idx] = e.target.value;
                      setFormData({...formData, options: newOpts});
                    }}
                  />
                </div>
              ))}

              <textarea 
                className="w-full border p-2 rounded mb-3 h-20 text-sm mt-2" 
                placeholder="Penjelasan / Pembahasan" 
                value={formData.explanation || ''} 
                onChange={e => setFormData({...formData, explanation: e.target.value})}
              />

              <div className="flex gap-2">
                <button onClick={handleSaveQuestion} className="bg-indigo-600 text-white px-4 py-2 rounded flex-1">Simpan Soal</button>
                {isEditing && <button onClick={() => {setIsEditing(null); setFormData({})}} className="bg-gray-300 px-4 py-2 rounded">Batal</button>}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="flex gap-2 mb-4">
                <Search size={20} className="text-gray-400" />
                <input 
                  placeholder="Cari soal..." 
                  className="border-b focus:outline-none w-full"
                  onChange={(e) => { /* Implement search filter logic here later */}} 
                />
              </div>
              {questions.map(q => {
                const c = courses.find(c => c.id === q.courseId);
                return (
                  <div key={q.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-indigo-500">
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                        {c?.code} • Versi {q.version} • {q.difficulty}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => {setIsEditing(q.id); setFormData(q)}} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteQuestion(q.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <p className="font-medium text-gray-800 mb-2 truncate"><MathRenderer text={q.text} /></p>
                    <p className="text-sm text-gray-500">Jawaban: {q.options[q.correctIndex]}</p>
                  </div>
                )
              })}
              {questions.length === 0 && <p className="text-gray-500 italic">Belum ada soal.</p>}
            </div>
          </div>
        )}

        {/* --- IMPORT/EXPORT TAB --- */}
        {tab === 'import' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-bold text-lg mb-4">Backup & Restore Soal</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2"><Download size={18}/> Export Data</h4>
                <p className="text-sm text-gray-600 mb-4">Unduh semua soal dalam format JSON untuk backup atau diedit di text editor.</p>
                <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow">Download JSON</button>
              </div>
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2"><Upload size={18}/> Import Data</h4>
                <p className="text-sm text-gray-600 mb-2">Tempel (Paste) isi JSON di sini untuk mengembalikan data soal.</p>
                <textarea 
                  className="w-full border p-2 rounded text-xs font-mono h-32 mb-2" 
                  placeholder='[{"text": "Soal 1", ...}]'
                  value={importData}
                  onChange={e => setImportData(e.target.value)}
                />
                <button onClick={handleImport} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow">Import JSON</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- Student Views ---

  if (view === 'admin-login') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Login Administrator</h2>
            <p className="text-sm text-gray-500 mb-4 text-center">Masukkan kode akses untuk mengelola soal.</p>
            <input 
              type="password" 
              className="w-full border p-3 rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500 outline-none" 
              placeholder="Kode Akses (Default: admin123)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.target.value === 'admin123') {
                    setIsAdmin(true);
                    setView('admin-dashboard');
                  } else {
                    alert('Kode salah!');
                  }
                }
              }}
            />
            <button onClick={() => setView('home')} className="w-full text-indigo-600 font-medium">Kembali ke Menu Utama</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'admin-dashboard') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <AdminDashboard />
      </div>
    );
  }

  if (view === 'quiz') {
    const currentQ = activeQuizQuestions[currentQuestionIndex];
    const userAnswer = userAnswers[currentQ.id];
    const hasAnswered = userAnswer !== undefined;

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 max-w-3xl mx-auto w-full p-4">
          
          {/* Header Stats */}
          <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center sticky top-20 z-40">
            <div>
              <h2 className="font-bold text-gray-800">{activeCourse.name}</h2>
              <div className="text-sm text-gray-500">Soal {currentQuestionIndex + 1} dari {activeQuizQuestions.length}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-indigo-600">{score}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Poin</div>
            </div>
          </div>

          {/* Question Card */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-6 border-b">
               <div className="flex justify-between mb-4">
                 <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${currentQ.difficulty === 'mudah' ? 'bg-green-100 text-green-700' : currentQ.difficulty === 'sulit' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                   {currentQ.difficulty}
                 </span>
                 <span className="text-gray-400 text-sm">Versi {currentQ.version}</span>
               </div>
               <div className="text-lg md:text-xl font-medium text-gray-800 leading-relaxed">
                 <MathRenderer text={currentQ.text} />
               </div>
            </div>

            <div className="p-6 bg-gray-50">
              <div className="space-y-3">
                {currentQ.options.map((opt, idx) => {
                  let btnClass = "w-full text-left p-4 rounded-lg border-2 transition-all duration-200 flex items-center justify-between ";
                  
                  if (hasAnswered) {
                    if (idx === currentQ.correctIndex) {
                      btnClass += "bg-green-100 border-green-500 text-green-800"; // Correct
                    } else if (idx === userAnswer.selectedOption) {
                      btnClass += "bg-red-100 border-red-500 text-red-800"; // Wrong selected
                    } else {
                      btnClass += "bg-white border-gray-200 opacity-50"; // Others
                    }
                  } else {
                    btnClass += "bg-white border-gray-200 hover:border-indigo-400 hover:shadow-md cursor-pointer";
                  }

                  return (
                    <button 
                      key={idx} 
                      disabled={hasAnswered}
                      onClick={() => handleAnswer(idx)}
                      className={btnClass}
                    >
                      <div className="flex items-center gap-3">
                         <span className="font-bold opacity-50">{String.fromCharCode(65 + idx)}.</span>
                         <span><MathRenderer text={opt} /></span>
                      </div>
                      {hasAnswered && idx === currentQ.correctIndex && <CheckCircle size={20} className="text-green-600"/>}
                      {hasAnswered && idx === userAnswer.selectedOption && idx !== currentQ.correctIndex && <XCircle size={20} className="text-red-600"/>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Explanation Section (Instant Feedback) */}
            {hasAnswered && (
              <div className="p-6 bg-blue-50 border-t border-blue-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-2">
                  <BookOpen size={18}/> Pembahasan
                </h4>
                <div className="text-gray-700 text-sm leading-relaxed">
                   {currentQ.explanation ? <MathRenderer text={currentQ.explanation} /> : "Tidak ada pembahasan detail untuk soal ini."}
                </div>
                <div className="mt-6 flex justify-end">
                   <button 
                    onClick={nextQuestion}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium shadow-lg flex items-center gap-2"
                   >
                     {currentQuestionIndex < activeQuizQuestions.length - 1 ? "Soal Selanjutnya" : "Lihat Hasil Akhir"} <Play size={16} fill="currentColor"/>
                   </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'result') {
    const percentage = Math.round((score / activeQuizQuestions.length) * 100);
    
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 max-w-4xl mx-auto w-full p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Hasil Latihan</h2>
            <p className="text-gray-500 mb-6">{activeCourse.name}</p>
            
            <div className="flex justify-center items-center gap-8 mb-8">
              <div className="text-center">
                 <div className="text-5xl font-bold text-indigo-600 mb-1">{score}</div>
                 <div className="text-xs text-gray-500 uppercase">Benar</div>
              </div>
              <div className="h-16 w-px bg-gray-200"></div>
              <div className="text-center">
                 <div className="text-5xl font-bold text-gray-400 mb-1">{activeQuizQuestions.length - score}</div>
                 <div className="text-xs text-gray-500 uppercase">Salah</div>
              </div>
              <div className="h-16 w-px bg-gray-200"></div>
              <div className="text-center">
                 <div className={`text-5xl font-bold mb-1 ${percentage >= 80 ? 'text-green-500' : percentage >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>{percentage}%</div>
                 <div className="text-xs text-gray-500 uppercase">Nilai</div>
              </div>
            </div>

            <button onClick={goHome} className="bg-gray-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-black transition">
              Coba Latihan Lain
            </button>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-xl text-gray-700">Review Jawaban</h3>
            {activeQuizQuestions.map((q, idx) => {
              const ua = userAnswers[q.id];
              const isCorrect = ua?.isCorrect;
              
              return (
                <div key={q.id} className={`bg-white p-6 rounded-lg shadow border-l-4 ${isCorrect ? 'border-green-500' : 'border-red-500'}`}>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 mt-1">
                      {isCorrect ? <CheckCircle className="text-green-500" /> : <XCircle className="text-red-500" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800 mb-2"><MathRenderer text={q.text} /></p>
                      
                      <div className="grid md:grid-cols-2 gap-4 mt-4 text-sm">
                        <div className={`p-3 rounded ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                          <span className="font-bold block mb-1">Jawaban Kamu:</span>
                          {q.options[ua?.selectedOption]}
                        </div>
                        {!isCorrect && (
                          <div className="p-3 rounded bg-green-50 border border-green-200">
                             <span className="font-bold block mb-1">Jawaban Benar:</span>
                             {q.options[q.correctIndex]}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-gray-600">
                        <strong className="block text-gray-500 text-xs uppercase mb-1">Pembahasan:</strong>
                        <MathRenderer text={q.explanation || "Tidak ada pembahasan."} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- Default View: Home / Course Selection ---
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      
      {/* Hero Section */}
      <div className="bg-indigo-700 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-extrabold mb-4">Siap Hadapi UAS?</h1>
          <p className="text-indigo-100 text-lg mb-8">Pilih mata kuliah, kerjakan soal latihan, dan dapatkan pembahasan instan untuk memperdalam pemahamanmu.</p>
          
          <div className="bg-white p-2 rounded-lg max-w-lg mx-auto flex shadow-xl">
             <Search className="text-gray-400 m-3" />
             <input 
              placeholder="Cari mata kuliah..." 
              className="flex-1 outline-none text-gray-700"
              onChange={(e) => {
                 // Simple client side search visualization (actual filtering usually done in render)
              }}
             />
             <button className="bg-indigo-600 text-white px-6 py-2 rounded font-medium hover:bg-indigo-800 transition">Cari</button>
          </div>
        </div>
      </div>

      {/* Course List */}
      <div className="flex-1 max-w-6xl mx-auto w-full p-6 -mt-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map(course => (
            <div key={course.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition duration-300 transform hover:-translate-y-1">
              <div className="h-3 bg-indigo-500"></div>
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded text-sm">
                    {course.code}
                  </div>
                  <BarChart2 className="text-gray-300" size={20} />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{course.name}</h3>
                <p className="text-gray-500 text-sm mb-6">Latihan soal tersedia dalam berbagai tingkat kesulitan.</p>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                   <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Pilih Versi Soal</label>
                   <select 
                    className="w-full border-gray-300 border rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    onChange={(e) => setQuizConfig({...quizConfig, version: e.target.value})}
                   >
                     <option value="A">Paket A</option>
                     <option value="B">Paket B</option>
                     <option value="C">Paket C</option>
                     <option value="all">Semua Versi (Acak)</option>
                   </select>
                </div>

                <button 
                  onClick={() => startQuiz(course, quizConfig.version, 'all')}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 flex items-center justify-center gap-2 transition"
                >
                  Mulai Latihan <ArrowLeft className="rotate-180" size={18} />
                </button>
              </div>
            </div>
          ))}

          {courses.length === 0 && (
             <div className="col-span-full text-center py-10 text-gray-500 bg-white rounded-lg shadow">
               <p>Belum ada mata kuliah yang tersedia.</p>
               <p className="text-sm">Silakan login sebagai admin untuk menambahkan data.</p>
             </div>
          )}
        </div>
      </div>

      <footer className="bg-white border-t mt-12 py-8 text-center text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} UAS Practice Platform. Dibuat untuk Mahasiswa.
      </footer>
    </div>
  );
}