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
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  Camera, 
  LogOut, 
  Image as ImageIcon, 
  Loader2, 
  X, 
  PawPrint, 
  Upload, 
  ChevronRight, 
  Info, 
  Lock, 
  Key,
  Download,
  Minus
} from 'lucide-react';

// --- 회원님 전용 외부 Firebase 환경 변수 연동 ---
const firebaseConfig = {
  apiKey: "AIzaSyCf2VED9pYs_6Ii2s9nH9WSK-kL9yrMDo4",
  authDomain: "gguru-alb.firebaseapp.com",
  projectId: "gguru-alb",
  storageBucket: "gguru-alb.firebasestorage.app",
  messagingSenderId: "513871263396",
  appId: "1:513871263396:web:91974d89afdbd4a74d1831"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [view, setView] = useState('intro');
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isFontReady, setIsFontReady] = useState(false);
  const [photos, setPhotos] = useState([]);
  
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [rememberMe, setRememberMe] = useState(false); // 아이디/비번 기억하기 상태 추가
  const [albumCode, setAlbumCode] = useState('');
  const [albumPassword, setAlbumPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [activeAlbum, setActiveAlbum] = useState(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  
  // 모달 상태
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  // PWA 설치 프롬프트 이벤트를 저장하기 위한 state
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // 모바일 전용 롱프레스 및 드래그 앤 드롭을 위한 상태와 Refs
  const [editPhotoId, setEditPhotoId] = useState(null);
  const [draggedPhotoId, setDraggedPhotoId] = useState(null);
  const [targetPhotoId, setTargetPhotoId] = useState(null);
  
  const pressTimerRef = useRef(null);
  const touchPos = useRef({ x: 0, y: 0 });
  const isLongPress = useRef(false);
  const isDragging = useRef(false);
  const justLongPressed = useRef(false);

  useEffect(() => {
    // PWA 설치 이벤트 리스너 등록
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const loadFonts = async () => {
      if (document.fonts) {
        try {
          await document.fonts.load('600 12px Fredoka');
          await document.fonts.load('400 12px Fredoka');
          await document.fonts.load('400 12px Cinzel');
          await document.fonts.load('700 12px Cinzel');
          await document.fonts.ready;
          requestAnimationFrame(() => {
            setTimeout(() => setIsFontReady(true), 150);
          });
        } catch (e) {
          setIsFontReady(true);
        }
      } else {
        setIsFontReady(true);
      }
    };
    loadFonts();

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

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user || view !== 'main' || !activeAlbum) return;

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
        if (error.code === 'permission-denied') {
          showToast("Firebase 규칙 오류: DB Rules를 확인해주세요.");
        } else {
          showToast("사진을 불러오는데 실패했습니다.");
        }
      }
    );

    return () => unsubscribe();
  }, [user, isAuthReady, view, activeAlbum]);

  // 로그인 화면 진입 시, 기억된 정보가 있으면 자동 완성
  useEffect(() => {
    if (view === 'auth' && isLoginMode) {
      const savedCode = localStorage.getItem('gguruk_saved_code');
      const savedPwd = localStorage.getItem('gguruk_saved_pwd');
      if (savedCode && savedPwd) {
        setAlbumCode(savedCode);
        setAlbumPassword(savedPwd);
        setRememberMe(true);
      }
    }
  }, [view, isLoginMode]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      showToast('앱 설치를 지원하지 않는 브라우저이거나 이미 설치되었습니다.');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
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
            // 정보 기억하기 로직
            if (rememberMe) {
              localStorage.setItem('gguruk_saved_code', code);
              localStorage.setItem('gguruk_saved_pwd', pwd);
            } else {
              localStorage.removeItem('gguruk_saved_code');
              localStorage.removeItem('gguruk_saved_pwd');
            }
            
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
          setAuthError('이미 사용 중인 앨범 코드입니다.');
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
          showToast(`앨범이 생성되었어요`);
        }
      }
    } catch (error) {
      console.error("Album auth error:", error);
      setAuthError('서버 연결 중 오류가 발생했습니다.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setActiveAlbum(null);
    setIsLoginMode(true); 
    setView('auth');
    setIsLogoutConfirmOpen(false);
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
      console.error("Upload error:", error);
      setIsUploading(false);
      showToast('업로드에 실패했습니다.');
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!isAuthReady || !user) return;
    try {
      await deleteDoc(doc(db, 'photos', photoId));
      setSelectedPhoto(null);
      setEditPhotoId(null);
      showToast('사진이 삭제되었습니다.');
    } catch (error) {
      console.error("Error deleting photo:", error);
      showToast('삭제 중 오류가 발생했습니다.');
    }
  };

  // --- 모바일 호환 완벽한 터치/롱프레스 핸들러 ---
  const handlePressStart = (clientX, clientY, photo) => {
    if (editPhotoId) return; // 편집 모드면 롱프레스 트리거 무시
    
    touchPos.current = { x: clientX, y: clientY };
    isLongPress.current = false;
    isDragging.current = false;
    justLongPressed.current = false;

    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    
    // 0.4초간 꾹 누르면 롱프레스 및 드래그 모드 즉시 활성화
    pressTimerRef.current = setTimeout(() => {
      isLongPress.current = true;
      setDraggedPhotoId(photo.id);
      if (navigator.vibrate) navigator.vibrate(50); // 짧은 진동 피드백
    }, 400); 
  };

  const handlePressMove = (clientX, clientY) => {
    if (!isLongPress.current && pressTimerRef.current) {
      // 0.4초가 지나기 전 스크롤 등 큰 움직임이 발생하면 롱프레스 취소
      const dx = Math.abs(clientX - touchPos.current.x);
      const dy = Math.abs(clientY - touchPos.current.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(pressTimerRef.current);
        setDraggedPhotoId(null);
      }
    } else if (isLongPress.current) {
      // 롱프레스 후 드래그 시 순서 변경 처리
      isDragging.current = true;
      const elem = document.elementFromPoint(clientX, clientY);
      const targetItem = elem?.closest('.masonry-item');
      if (targetItem) {
        const targetId = targetItem.getAttribute('data-id');
        if (targetId && targetId !== draggedPhotoId) {
          setTargetPhotoId(targetId);
        } else {
          setTargetPhotoId(null);
        }
      } else {
        setTargetPhotoId(null);
      }
    }
  };

  const handlePressEnd = async (photo) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);

    if (isLongPress.current) {
      if (isDragging.current && targetPhotoId) {
        // 드래그 앤 드롭으로 순서 맞바꾸기
        const dragged = photos.find(p => p.id === draggedPhotoId);
        const target = photos.find(p => p.id === targetPhotoId);
        if (dragged && target) {
          try {
            const draggedRef = doc(db, 'photos', dragged.id);
            const targetRef = doc(db, 'photos', target.id);
            await updateDoc(draggedRef, { createdAt: target.createdAt });
            await updateDoc(targetRef, { createdAt: dragged.createdAt });
            showToast('순서가 변경되었습니다.');
          } catch (error) {
            console.error("Reorder failed", error);
            showToast('순서 변경에 실패했습니다.');
          }
        }
      } else if (!isDragging.current) {
        // 드래그 없이 손만 떼었으면 제자리 편집(삭제버튼) 모드 활성화
        setEditPhotoId(photo.id);
        justLongPressed.current = true;
        setTimeout(() => { justLongPressed.current = false; }, 300);
      }
    }

    // 상태 초기화
    isLongPress.current = false;
    isDragging.current = false;
    setDraggedPhotoId(null);
    setTargetPhotoId(null);
  };

  const handlePressCancel = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (!isDragging.current) {
      isLongPress.current = false;
      setDraggedPhotoId(null);
    }
  };

  const handleClick = (e, photo) => {
    e.stopPropagation();
    
    if (justLongPressed.current) return; // 롱프레스 직후 터치 이벤트 무시 (확대 방지)
    
    if (editPhotoId === photo.id) {
       return; // 삭제버튼이 떠 있는 본인을 터치해도 무시 (삭제는 마이너스 버튼 전용)
    }
    
    if (editPhotoId) {
      setEditPhotoId(null); // 다른 사진이나 빈 공간 클릭 시 편집 모드 즉시 해제
      return; 
    }
    
    setSelectedPhoto(photo);
  };

  const handleMainClick = () => {
    // 사진 외부(배경/여백) 터치 시 편집 모드 즉시 해제
    if (editPhotoId) setEditPhotoId(null); 
  };

  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&family=Cinzel:wght@400;500;600;700&family=Montserrat:wght@200;300;400;500;600&family=Noto+Serif+KR:wght@200;300;400;500;600&display=block');
    
    .font-cute { font-family: 'Fredoka', sans-serif; }
    .font-cinzel { font-family: 'Cinzel', serif; }
    .font-serif-kr { font-family: 'Noto Serif KR', serif; }
    .font-montserrat { font-family: 'Montserrat', sans-serif; }
    
    @keyframes cinematicEntrance {
      0% { opacity: 0; filter: blur(30px); transform: scale(1.15); }
      100% { opacity: 1; filter: blur(0); transform: scale(1); }
    }
    .animate-cinematic-text { animation: cinematicEntrance 3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
    
    @keyframes letterShimmer {
      0% { text-shadow: 0 0 0px rgba(255,255,255,0); }
      50% { text-shadow: 0 0 20px rgba(255,255,255,0.4); }
      100% { text-shadow: 0 0 0px rgba(255,255,255,0); }
    }
    .animate-shimmer { animation: letterShimmer 5s ease-in-out infinite; }

    @keyframes grain {
      0%, 100% { transform:translate(0, 0) }
      10% { transform:translate(-5%, -10%) }
      30% { transform:translate(3%, -15%) }
      50% { transform:translate(12%, 9%) }
      70% { transform:translate(9%, 4%) }
      90% { transform:translate(-1%, 7%) }
    }
    .noise-bg {
      position: fixed; top: -50%; left: -50%; width: 200%; height: 200%;
      background: url('https://grainy-gradients.vercel.app/noise.svg');
      opacity: 0.12; pointer-events: none; animation: grain 8s steps(10) infinite;
    }

    @keyframes slideUpFade {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-up { animation: slideUpFade 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

    @keyframes cinematicToast {
      0% { opacity: 0; transform: translate(-50%, 40px) scale(0.9); filter: blur(8px); }
      100% { opacity: 1; transform: translate(-50%, 0) scale(1); filter: blur(0); }
    }
    .animate-cinematic-toast {
      animation: cinematicToast 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes jiggle {
      0% { transform: rotate(-1deg); }
      50% { transform: rotate(1.5deg); }
      100% { transform: rotate(-1deg); }
    }
    .animate-jiggle {
      animation: jiggle 0.25s infinite;
    }

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
      /* 롱프레스 시 모바일 브라우저 고유 메뉴 및 텍스트 선택 완벽 차단 */
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    
    @keyframes fadeUpItem {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .hover-scale { transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
    .masonry-item:hover .hover-scale { transform: scale(1.05); }

    .blink { animation: blink 3s infinite; }
    @keyframes blink { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.1; } }
  `;

  if (view === 'intro') {
    return (
      <div 
        className={`fixed inset-0 bg-black flex flex-col items-center justify-center z-50 cursor-pointer select-none overflow-hidden transition-opacity duration-1000 ${isFontReady ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => isFontReady && setView('auth')}
      >
        <style>{globalStyles}</style>
        <div className="noise-bg" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none" />

        {isFontReady && (
          <div className="flex flex-col items-center text-center relative z-10">
            <h1 className="text-6xl md:text-8xl text-white font-cute tracking-[-0.07em] font-semibold drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] animate-cinematic-text animate-shimmer">
              GGURUK
            </h1>
            <div className="flex justify-center w-full px-4 overflow-hidden">
              <p className="text-zinc-500 mt-6 tracking-[0.6em] text-xs md:text-sm uppercase font-montserrat indent-[0.6em] opacity-0 animate-cinematic-text delay-[1000ms]">
                Cinematic Archive
              </p>
            </div>
            <div className="mt-32 text-zinc-700 text-[10px] tracking-[0.5em] uppercase blink font-montserrat opacity-0 animate-cinematic-text delay-[2000ms]">
              Touch to Archive
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 sm:p-8 relative">
        <style>{globalStyles}</style>

        {/* 인스톨 버튼 위치를 카드 내측 우측 상단으로 완벽히 원상복구했습니다 */}
        <div className="w-full max-w-5xl flex flex-col md:flex-row bg-[#0f0f0f] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl animate-slide-up mt-8 md:mt-0 relative">
          
          <div className="absolute top-6 right-6 md:top-10 md:right-10 z-50 flex items-center h-10">
            <button 
              onClick={handleInstallClick}
              className="flex items-center space-x-2 bg-zinc-900/80 hover:bg-white hover:text-black border border-zinc-700 text-zinc-300 px-5 py-2.5 rounded-full transition-all duration-300 shadow-lg backdrop-blur-md group"
            >
              <Download className="w-4 h-4 group-hover:text-black transition-colors" />
              <span className="font-montserrat font-medium text-sm tracking-widest uppercase">Install</span>
            </button>
          </div>

          <div className="w-full md:w-28 p-6 md:p-10 relative overflow-hidden flex flex-col justify-start items-start md:items-center bg-[#0d0d0d]">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-zinc-800 to-black z-0"></div>
            <div className="absolute -top-32 -left-32 w-[30rem] h-[30rem] bg-white/5 rounded-full blur-[120px] z-0"></div>
            <div className="relative z-10 px-2 h-10 flex items-center">
              <PawPrint className="text-white w-8 h-8" strokeWidth={1.5} />
            </div>
          </div>

          <div className="w-full md:flex-1 p-8 md:p-14 flex flex-col justify-center bg-[#0a0a0a] backdrop-blur-md">
            <h3 className="text-4xl text-white font-cute font-bold mb-6 tracking-tighter uppercase">
              {isLoginMode ? 'GGURUK in' : 'GGURUK create'}
            </h3>
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
                {isLoginMode && (
                  <div className="flex items-center space-x-2 mt-3 px-1">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 cursor-pointer accent-zinc-500"
                    />
                    <label htmlFor="rememberMe" className="text-zinc-500 text-xs font-serif-kr cursor-pointer select-none hover:text-zinc-400 transition-colors">
                      아이디와 비밀번호 기억하기
                    </label>
                  </div>
                )}
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
                className="w-full bg-white text-black font-cute font-bold rounded-xl px-4 py-4 hover:bg-zinc-200 transition-all flex items-center justify-center space-x-2 mt-6 disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)] text-lg tracking-widest uppercase"
              >
                {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                <span>{isLoginMode ? 'ENTER' : 'CREATE'}</span>
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
                className="text-zinc-500 hover:text-white text-sm transition-colors font-serif-kr underline underline-offset-4"
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
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white/30 relative" onClick={handleMainClick}>
      <style>{globalStyles}</style>
      
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 z-50 bg-[#111111]/95 backdrop-blur-xl text-white px-10 py-4 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] border border-white/10 flex items-center space-x-3 animate-cinematic-toast font-serif-kr font-light tracking-wide whitespace-nowrap min-w-max">
          <Info className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
      
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/10 px-6 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center space-x-4">
          <PawPrint className="text-white w-8 h-8" strokeWidth={1.5} />
          <h1 className="text-2xl font-cute font-bold tracking-tighter uppercase hidden sm:block">GGURUK</h1>
        </div>
        <div className="flex items-center space-x-6">
          <span className="hidden md:flex items-center space-x-2 text-zinc-400 text-sm border border-zinc-800 px-4 py-2 rounded-full font-montserrat tracking-wide bg-zinc-900/50">
            <Lock className="w-3 h-3 text-white" />
            <span>ALBUM : <strong className="text-white font-medium">{activeAlbum}</strong></span>
          </span>
          <button onClick={() => setIsLogoutConfirmOpen(true)} className="flex items-center space-x-2 text-zinc-400 hover:text-white transition-colors uppercase text-xs">
            <span className="hidden sm:inline">Close</span>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 space-y-6 md:space-y-0">
          <div>
            <h2 className="text-4xl md:text-5xl font-cute font-bold mb-4 tracking-tighter uppercase">GGURUK</h2>
            <p className="text-zinc-400 font-serif-kr font-light text-lg">우리가 함께한 반짝이는 순간들</p>
          </div>
          <div className="flex items-center space-x-4 w-full md:w-auto">
            {isUploading && (
              <div className="flex items-center space-x-3 bg-zinc-900 rounded-xl px-5 py-3 border border-zinc-700">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span className="text-sm text-zinc-300 font-montserrat">UPLOADING... {uploadProgress}%</span>
              </div>
            )}
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
            
            {photos.length > 0 && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full md:w-auto bg-white text-black px-8 py-4 rounded-xl font-cute font-bold flex items-center justify-center space-x-3 hover:bg-zinc-200 transition-colors shadow-lg text-lg tracking-wider"
              >
                <Upload className="w-5 h-5" />
                <span>Add Photo</span>
              </button>
            )}
          </div>
        </div>
        {photos.length === 0 ? (
          <div className="pt-20 pb-40 flex flex-col items-center justify-center">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="group flex items-center justify-center space-x-2 transition-all duration-300 bg-transparent border-none outline-none"
            >
              <span className="font-montserrat font-bold text-zinc-500 group-hover:text-white text-xs tracking-[0.2em] uppercase transition-colors duration-300">
                Add Photo
              </span>
              <span className="font-montserrat font-bold text-zinc-500 group-hover:text-white text-sm transition-colors duration-300">
                +
              </span>
            </button>
          </div>
        ) : (
          <div className="masonry-container">
            {photos.map((photo) => (
              <div 
                key={photo.id} 
                data-id={photo.id}
                onTouchStart={(e) => handlePressStart(e.touches[0].clientX, e.touches[0].clientY, photo)}
                onTouchMove={(e) => handlePressMove(e.touches[0].clientX, e.touches[0].clientY)}
                onTouchEnd={() => handlePressEnd(photo)}
                onTouchCancel={handlePressCancel}
                onMouseDown={(e) => handlePressStart(e.clientX, e.clientY, photo)}
                onMouseMove={(e) => handlePressMove(e.clientX, e.clientY)}
                onMouseUp={() => handlePressEnd(photo)}
                onMouseLeave={handlePressCancel}
                onClick={(e) => handleClick(e, photo)}
                onContextMenu={(e) => { e.preventDefault(); return false; }} 
                style={{ 
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: draggedPhotoId === photo.id ? 'none' : 'auto' 
                }} 
                className={`masonry-item relative group cursor-pointer overflow-hidden rounded-xl bg-zinc-900 shadow-2xl transition-all duration-300
                  ${editPhotoId === photo.id ? 'animate-jiggle ring-2 ring-white/50 z-30' : ''}
                  ${draggedPhotoId === photo.id ? 'opacity-50 scale-105 z-50' : ''}
                  ${targetPhotoId === photo.id ? 'ring-4 ring-white z-40' : ''}
                `}
              >
                {editPhotoId === photo.id && (
                  <button
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      e.preventDefault(); 
                      handleDeletePhoto(photo.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePhoto(photo.id);
                    }}
                    className="absolute top-4 right-4 z-40 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                  >
                    <Minus className="w-5 h-5" strokeWidth={3} />
                  </button>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 pointer-events-none"></div>
                <img src={photo.url} alt="꾸루" loading="lazy" className="w-full h-auto object-cover hover-scale pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500 z-20 pointer-events-none">
                  <p className="text-white text-base font-serif-kr font-light">{new Date(photo.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-[#111111] border border-zinc-800 p-8 rounded-2xl shadow-2xl text-center max-w-sm w-full mx-4 animate-[slideUpFade_0.3s_ease-out]">
            <PawPrint className="w-8 h-8 text-zinc-500 mx-auto mb-4" strokeWidth={1.5} />
            <h3 className="text-xl text-white font-serif-kr font-light mb-8 tracking-wide">정말로 앨범에서<br/>나가시겠습니까?</h3>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors font-montserrat text-sm tracking-widest uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-3 rounded-xl bg-white text-black font-montserrat font-bold hover:bg-zinc-200 transition-colors text-sm tracking-widest uppercase"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/98 backdrop-blur-2xl" onClick={() => setSelectedPhoto(null)}>
          <div className="absolute top-0 right-0 p-6">
            <button className="p-4 text-zinc-400 hover:text-white"><X className="w-8 h-8" /></button>
          </div>
          <img src={selectedPhoto.url} className="max-w-[90vw] max-h-[85vh] object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="absolute bottom-0 left-0 right-0 p-10 flex justify-between items-end">
            <div className="text-white">
              <p className="text-2xl font-serif-kr font-light">{new Date(selectedPhoto.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
