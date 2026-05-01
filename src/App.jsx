import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { 
  Camera, 
  LogOut, 
  Image as ImageIcon, 
  Loader2, 
  X, 
  Heart, 
  Upload,
  ChevronRight,
  Info,
  Lock,
  Key
} from 'lucide-react';

// --- 회원님 전용 외부 Firebase 환경 변수 연동 ---
// Vercel 배포 시에는 환경변수를 사용하고, 현재 테스트 환경에서는 회원님이 주신 정보를 바로 사용합니다.
let env = {};
try {
  const getEnv = new Function('return import.meta.env;');
  env = getEnv() || {};
} catch (e) {
  // 캔버스 환경에서는 무시됩니다.
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyCf2VED9pYs_6Ii2s9nH9WSK-kL9yrMDo4",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "gguru-alb.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "gguru-alb",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "gguru-alb.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "513871263396",
  appId: env.VITE_FIREBASE_APP_ID || "1:513871263396:web:91974d89afdbd4a74d1831"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [view, setView] = useState('intro'); // 'intro', 'auth', 'main'
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [photos, setPhotos] = useState([]);
  
  // Auth/Family Code States
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [albumCode, setAlbumCode] = useState('');
  const [albumPassword, setAlbumPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [activeAlbum, setActiveAlbum] = useState(null);

  // Upload States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // 1. 초기 인증 시퀀스 (회원님의 Firebase 프로젝트로 익명 로그인)
  useEffect(() => {
    const introTimer = setTimeout(() => {
      setView(prev => prev === 'intro' ? 'auth' : prev);
    }, 3500);

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth init error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });

    return () => {
      clearTimeout(introTimer);
      unsubscribe();
    };
  }, []);

  // 2. 앨범 사진 불러오기
  useEffect(() => {
    if (!isAuthReady || !user || view !== 'main' || !activeAlbum) return;

    // 회원님의 DB 경로로 직접 접근
    const photosRef = collection(db, 'photos');
    
    const unsubscribe = onSnapshot(
      photosRef, 
      (snapshot) => {
        const fetchedPhotos = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(photo => photo.albumCode === activeAlbum);
          
        fetchedPhotos.sort((a, b) => b.createdAt - a.createdAt);
        setPhotos(fetchedPhotos);
      },
      (error) => {
        console.error("Error fetching photos: ", error);
        if (error.code === 'permission-denied' || (error.message && error.message.includes('permissions'))) {
          showToast("Firebase 규칙 오류: DB Rules를 allow read, write: if true; 로 변경해주세요.");
        } else {
          showToast("사진을 불러오는데 실패했습니다.");
        }
      }
    );

    return () => unsubscribe();
  }, [user, isAuthReady, view, activeAlbum]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthReady || !user) {
      setAuthError('인증 정보를 확인 중입니다. 잠시 후 시도해주세요.');
      return;
    }
    
    const code = albumCode.trim();
    const pwd = albumPassword.trim();

    if (code.length < 4 || pwd.length < 4) {
      setAuthError('코드와 비밀번호는 각각 4자리 이상 입력해주세요.');
      return;
    }

    setIsAuthLoading(true);
    setAuthError('');

    try {
      const albumDocRef = doc(db, 'albums', code);
      const albumDocSnap = await getDoc(albumDocRef);

      if (isLoginMode) {
        if (albumDocSnap.exists()) {
          const albumData = albumDocSnap.data();
          if (albumData.password === pwd) {
            setActiveAlbum(code);
            setAlbumCode('');
            setAlbumPassword('');
            setView('main');
          } else {
            setAuthError('비밀번호가 일치하지 않습니다.');
          }
        } else {
          setAuthError('존재하지 않는 앨범 코드입니다.');
        }
      } else {
        if (albumDocSnap.exists()) {
          setAuthError('이미 사용 중인 앨범 코드입니다. 다른 코드를 입력해주세요.');
        } else {
          await setDoc(albumDocRef, {
            createdAt: Date.now(),
            creatorId: user.uid,
            password: pwd
          });
          setActiveAlbum(code);
          setAlbumCode('');
          setAlbumPassword('');
          setView('main');
          showToast(`'${code}' 앨범이 성공적으로 생성되었습니다.`);
        }
      }
    } catch (error) {
      console.error("Album auth error:", error);
      if (error.code === 'permission-denied' || (error.message && error.message.includes('permissions'))) {
        setAuthError('권한 오류: 파이어베이스 콘솔 Firestore Rules에서 allow read, write: if true; 로 바꿔주세요!');
      } else {
        setAuthError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setActiveAlbum(null);
    setView('auth');
  };

  const compressImage = (file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round(height * (maxWidth / width));
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round(width * (maxHeight / height));
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!isAuthReady || !user || !activeAlbum) return;

    if (!file.type.startsWith('image/')) {
      showToast('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10); 

    try {
      const compressedBase64 = await compressImage(file, 800, 800, 0.65);
      setUploadProgress(50); 
      
      await addDoc(collection(db, 'photos'), {
        url: compressedBase64,
        createdAt: Date.now(),
        fileName: file.name,
        albumCode: activeAlbum,
        uploaderId: user.uid
      });

      setUploadProgress(100);
      setIsUploading(false);
      showToast('성공적으로 업로드되었습니다.');
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (error) {
      console.error("Upload process error:", error);
      setIsUploading(false);
      if (error.code === 'permission-denied' || (error.message && error.message.includes('permissions'))) {
        showToast('권한 거부됨: Firebase 보안 규칙을 확인하세요.');
      } else {
        showToast('업로드에 실패했습니다.');
      }
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!isAuthReady || !user) return;
    try {
      await deleteDoc(doc(db, 'photos', photoId));
      setSelectedPhoto(null);
      showToast('사진이 삭제되었습니다.');
    } catch (error) {
      console.error("Error deleting photo:", error);
      showToast('삭제 권한이 없거나 오류가 발생했습니다.');
    }
  };

  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Montserrat:wght@200;300;400;500&family=Noto+Serif+KR:wght@200;300;400;500;600&display=swap');
    
    .font-cinzel { font-family: 'Cinzel', serif; }
    .font-serif-kr { font-family: 'Noto Serif KR', serif; }
    .font-montserrat { font-family: 'Montserrat', sans-serif; }
    
    @keyframes cinematicScale {
      0% { opacity: 0; transform: scale(0.9) translateY(10px); filter: blur(8px); }
      100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
    }
    .animate-cinematic { animation: cinematicScale 2.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
    .delay-1000 { animation-delay: 1s; }

    @keyframes slideUpFade {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-up { animation: slideUpFade 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

    .masonry-container {
      column-count: 2;
      column-gap: 1.5rem;
    }
    @media (min-width: 768px) { .masonry-container { column-count: 3; } }
    @media (min-width: 1024px) { .masonry-container { column-count: 4; } }
    @media (min-width: 1280px) { .masonry-container { column-count: 5; } }
    
    .masonry-item {
      break-inside: avoid;
      margin-bottom: 1.5rem;
      animation: fadeUpItem 0.8s ease-out backwards;
    }
    
    @keyframes fadeUpItem {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .hover-scale { transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
    .masonry-item:hover .hover-scale { transform: scale(1.05); }
  `;

  if (view === 'intro') {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
        <style>{globalStyles}</style>
        <div className="animate-cinematic opacity-0 text-center flex flex-col items-center">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-10 shadow-[0_0_60px_rgba(255,255,255,0.3)]">
            <Camera className="w-12 h-12 text-black" strokeWidth={1.5} />
          </div>
          <h1 className="text-6xl md:text-8xl text-white font-cinzel tracking-[0.3em] uppercase ml-[0.3em] font-semibold drop-shadow-2xl">
            GGURU
          </h1>
          <p className="text-zinc-400 mt-8 tracking-[0.5em] text-sm uppercase opacity-0 animate-cinematic delay-1000 font-montserrat">
            Cinematic Archive
          </p>
        </div>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 sm:p-8">
        <style>{globalStyles}</style>
        <div className="w-full max-w-5xl flex flex-col md:flex-row bg-[#0f0f0f] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl animate-slide-up">
          
          <div className="w-full md:w-1/2 p-12 relative overflow-hidden flex flex-col justify-between min-h-[400px]">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-zinc-800 to-black z-0"></div>
            <div className="absolute -top-32 -left-32 w-[30rem] h-[30rem] bg-white/5 rounded-full blur-[120px] z-0"></div>
            <div className="absolute bottom-10 right-10 w-80 h-80 bg-white/10 rounded-full blur-[100px] z-0"></div>
            
            <div className="relative z-10">
              <Heart className="text-white w-10 h-10 mb-8" strokeWidth={1} />
              <h2 className="text-4xl md:text-5xl text-white font-serif-kr font-light tracking-wide leading-tight drop-shadow-lg">
                기억하고 싶은<br/>
                <span className="text-zinc-400 font-serif-kr font-medium italic">모든 순간들</span>
              </h2>
            </div>
            
            <div className="relative z-10 text-zinc-500 text-sm tracking-[0.3em] uppercase mt-12 md:mt-0 font-cinzel font-semibold">
              Private Family Gallery
            </div>
          </div>

          <div className="w-full md:w-1/2 p-8 md:p-14 flex flex-col justify-center bg-[#0a0a0a] backdrop-blur-md">
            <h3 className="text-3xl text-white font-cinzel font-semibold mb-4 tracking-wider">
              {isLoginMode ? 'Enter Album' : 'Create Album'}
            </h3>
            <p className="text-zinc-400 text-sm mb-10 leading-relaxed font-serif-kr font-light">
              {isLoginMode 
                ? '공유받은 앨범 코드와 비밀번호를 입력하세요.' 
                : '우리 가족만의 고유한 앨범 코드와 비밀번호를 설정하세요.'}
            </p>

            <form onSubmit={handleAuthSubmit} className="space-y-6">
              <div>
                <label className="flex items-center space-x-2 text-zinc-400 text-xs uppercase tracking-[0.2em] mb-3 font-montserrat">
                  <Key className="w-4 h-4" />
                  <span>Album Code (ID)</span>
                </label>
                <input 
                  type="text" 
                  value={albumCode}
                  onChange={(e) => setAlbumCode(e.target.value)}
                  className="w-full bg-zinc-900/80 border border-zinc-700 text-white rounded-xl px-4 py-4 outline-none focus:border-white focus:bg-zinc-800 transition-all placeholder:text-zinc-500 font-montserrat shadow-inner text-lg"
                  placeholder={isLoginMode ? "예: gguru_family" : "사용할 코드를 입력하세요"}
                  required
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-zinc-400 text-xs uppercase tracking-[0.2em] mb-3 font-montserrat">
                  <Lock className="w-4 h-4" />
                  <span>Password</span>
                </label>
                <input 
                  type="password" 
                  value={albumPassword}
                  onChange={(e) => setAlbumPassword(e.target.value)}
                  className="w-full bg-zinc-900/80 border border-zinc-700 text-white rounded-xl px-4 py-4 outline-none focus:border-white focus:bg-zinc-800 transition-all placeholder:text-zinc-500 font-montserrat shadow-inner text-lg"
                  placeholder="••••••••"
                  required
                />
              </div>

              {authError && (
                <div className="flex items-center space-x-2 text-red-400 text-sm bg-red-950/50 p-4 rounded-xl border border-red-500/30 font-serif-kr">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button 
                type="submit" 
                disabled={isAuthLoading || !isAuthReady}
                className="w-full bg-white text-black font-serif-kr font-semibold rounded-xl px-4 py-4 hover:bg-zinc-200 transition-all flex items-center justify-center space-x-2 mt-6 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.1)] text-lg"
              >
                {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                <span>{isLoginMode ? '앨범 열기' : '새 앨범 만들기'}</span>
                {!isAuthLoading && <ChevronRight className="w-5 h-5 opacity-50" />}
              </button>
            </form>

            <div className="mt-10 text-center">
              <button 
                onClick={() => {
                  setIsLoginMode(!isLoginMode);
                  setAuthError('');
                  setAlbumCode('');
                  setAlbumPassword('');
                }}
                className="text-zinc-500 hover:text-white text-sm transition-colors font-serif-kr underline underline-offset-4 decoration-zinc-700 hover:decoration-white"
              >
                {isLoginMode ? '새로운 앨범을 만들고 싶으신가요? 생성하기' : '이미 앨범이 있으신가요? 앨범 열기'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // view === 'main'
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white/30 relative">
      <style>{globalStyles}</style>

      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-white text-black px-6 py-3 rounded-full shadow-2xl flex items-center space-x-2 animate-[fadeUpItem_0.3s_ease-out] font-serif-kr font-medium">
          <Info className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/10 px-6 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
            <Camera className="w-5 h-5 text-black" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-cinzel font-bold tracking-[0.2em] uppercase hidden sm:block">GGURU</h1>
        </div>
        
        <div className="flex items-center space-x-6">
          <span className="hidden md:flex items-center space-x-2 text-zinc-400 text-sm border border-zinc-800 px-4 py-2 rounded-full font-montserrat tracking-wide bg-zinc-900/50">
            <Lock className="w-3 h-3 text-white" />
            <span>ALBUM : <strong className="text-white font-medium">{activeAlbum}</strong></span>
          </span>
          <button 
            onClick={handleLogout}
            className="flex items-center space-x-2 text-zinc-400 hover:text-white transition-colors font-montserrat tracking-wider uppercase text-xs"
          >
            <span className="hidden sm:inline">Close Album</span>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-12">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 space-y-6 md:space-y-0">
          <div>
            <h2 className="text-4xl md:text-5xl font-serif-kr font-medium mb-4 tracking-wide">꾸루 아카이브</h2>
            <p className="text-zinc-400 font-serif-kr font-light text-lg">
              {photos.length > 0 
                ? `우리가 함께한 ${photos.length}개의 반짝이는 순간들` 
                : '아직 기록된 추억이 없습니다. 첫 번째 사진을 올려주세요.'}
            </p>
          </div>

          <div className="flex items-center space-x-4 w-full md:w-auto">
            {isUploading && (
              <div className="flex items-center space-x-3 bg-zinc-900 rounded-xl px-5 py-3 border border-zinc-700 w-full justify-center md:w-auto">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span className="text-sm text-zinc-300 font-montserrat tracking-wide">UPLOADING... {uploadProgress}%</span>
              </div>
            )}

            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full md:w-auto bg-white text-black px-8 py-4 rounded-xl font-serif-kr font-medium flex items-center justify-center space-x-3 hover:bg-zinc-200 transition-colors disabled:opacity-50 shadow-lg text-lg"
            >
              <Upload className="w-5 h-5" />
              <span>사진 추가하기</span>
            </button>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="py-40 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
            <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
              <ImageIcon className="w-10 h-10 text-zinc-500" strokeWidth={1} />
            </div>
            <p className="text-zinc-400 text-2xl font-serif-kr font-light">텅 비어있네요.</p>
            <p className="text-zinc-500 text-base mt-3 font-serif-kr">꾸루의 사랑스러운 모습을 기록해보세요.</p>
          </div>
        ) : (
          <div className="masonry-container">
            {photos.map((photo, index) => (
              <div 
                key={photo.id} 
                className="masonry-item relative group cursor-pointer overflow-hidden rounded-xl bg-zinc-900 shadow-2xl"
                style={{ animationDelay: `${(index % 15) * 0.05}s` }}
                onClick={() => setSelectedPhoto(photo)}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10"></div>
                
                <img 
                  src={photo.url} 
                  alt="꾸루 사진" 
                  loading="lazy"
                  className="w-full h-auto object-cover hover-scale"
                />
                
                <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500 z-20">
                  <p className="text-white text-xs font-montserrat tracking-[0.2em] uppercase opacity-80 mb-1">Captured</p>
                  <p className="text-white text-base font-serif-kr font-light">
                    {new Date(photo.createdAt).toLocaleDateString('ko-KR', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedPhoto && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/98 backdrop-blur-2xl animate-[fadeIn_0.3s_ease-out]"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-end z-50">
            <button 
              className="p-4 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
              onClick={(e) => { e.stopPropagation(); setSelectedPhoto(null); }}
            >
              <X className="w-8 h-8" strokeWidth={1.5} />
            </button>
          </div>

          <div className="relative max-w-[90vw] max-h-[85vh]">
            <img 
              src={selectedPhoto.url} 
              alt="확대된 꾸루 사진" 
              className="w-full h-full object-contain shadow-[0_0_120px_rgba(255,255,255,0.08)] animate-[fadeUpItem_0.5s_ease-out]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          
          <div className="absolute bottom-0 left-0 right-0 p-10 flex justify-between items-end z-50 animate-[fadeUpItem_0.8s_ease-out]">
            <div className="text-white">
              <p className="text-xs text-zinc-500 uppercase tracking-[0.3em] mb-2 font-montserrat">Captured Date</p>
              <p className="text-2xl font-serif-kr font-light">
                {new Date(selectedPhoto.createdAt).toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit'
                })}
              </p>
            </div>
            
            <button 
              className="text-zinc-500 hover:text-red-400 transition-colors text-xs uppercase tracking-[0.2em] font-montserrat border-b border-transparent hover:border-red-400 pb-1"
              onClick={(e) => { 
                e.stopPropagation(); 
                handleDeletePhoto(selectedPhoto.id); 
              }}
            >
              Delete Photo
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
