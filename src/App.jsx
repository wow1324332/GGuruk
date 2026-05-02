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
  Minus,
  Check,
  Trash2
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
  const [rememberMe, setRememberMe] = useState(false);
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
  
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // 다중 선택 모드 상태
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(new Set());

  // 드래그 앤 드롭 및 롱프레스를 위한 상태와 Refs
  const [draggedPhotoId, setDraggedPhotoId] = useState(null);
  const [targetPhotoId, setTargetPhotoId] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 }); 
  
  const pressTimerRef = useRef(null);
  const touchPos = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 }); 
  const ghostSize = useRef({ width: 0, height: 0 }); 
  const ghostImage = useRef(null); 
  const isLongPress = useRef(false);
  const isDragging = useRef(false);
  const justLongPressed = useRef(false);

  // 뷰어용 확대/축소 상태 (Pinch Zoom)
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerPos, setViewerPos] = useState({ x: 0, y: 0 });
  const viewerTouchStartDist = useRef(0);
  const viewerTouchStartScale = useRef(1);
  const viewerLastPos = useRef({ x: 0, y: 0 });
  const isDraggingViewer = useRef(false);
  const [viewerDeleteTarget, setViewerDeleteTarget] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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

  // 뷰어 열릴 때 줌/위치 초기화
  useEffect(() => {
    if (selectedPhoto) {
      setViewerScale(1);
      setViewerPos({ x: 0, y: 0 });
    }
  }, [selectedPhoto]);

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
    setIsSelectionMode(false);
    setSelectedPhotoIds(new Set());
  };

  /**
   * 고화질 유지를 위한 스마트 압축 로직
   * Firestore 1MB 제한(약 1,048,576 byte)을 피하면서 최대 해상도 유지
   */
  const smartCompressImage = (file, isHighQuality = false) => {
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
          
          // 고화질 원본 백업용: 최대 2400px (4K 근접) / 품질 0.9 (거의 무손실)
          // 화면 표시(썸네일)용: 최대 800px / 품질 0.65
          const maxWidth = isHighQuality ? 2400 : 800;
          const maxHeight = isHighQuality ? 2400 : 800;
          let quality = isHighQuality ? 0.9 : 0.65;

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

          // Firestore 1MB 제한 방어 로직 수정: 
          // 썸네일(약 150KB) + 원본(약 800KB) + 메타데이터 합이 1,048,576 Bytes 이내여야 함.
          const getSafeDataUrl = () => {
            const targetLimit = isHighQuality ? 800000 : 150000;
            let dataUrl = canvas.toDataURL('image/jpeg', quality);
            
            // 품질과 해상도를 같이 낮추어 더 공격적으로 용량을 깎음
            while (dataUrl.length > targetLimit && quality > 0.2) {
              quality -= 0.1;
              width = Math.round(width * 0.85);
              height = Math.round(height * 0.85);
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            return dataUrl;
          };

          resolve(getSafeDataUrl());
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
      // 1. 화면 렌더링을 위한 썸네일 생성 (빠르고 용량 작음)
      const thumbBase64 = await smartCompressImage(file, false);
      setUploadProgress(40);
      
      // 2. 다운로드 보관을 위한 고화질 이미지 생성 (1MB 리밋 내에서 최대한 원본 유지)
      const highResBase64 = await smartCompressImage(file, true);
      setUploadProgress(70);

      // Firestore에 썸네일과 고화질 데이터 둘 다 저장
      await addDoc(collection(db, 'photos'), {
        url: thumbBase64,
        originalUrl: highResBase64, // 고화질 데이터
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
      showToast('업로드에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleDeleteSelected = async () => {
    if (!isAuthReady || !user || selectedPhotoIds.size === 0) return;
    try {
      const deletePromises = Array.from(selectedPhotoIds).map(async (id) => {
        return deleteDoc(doc(db, 'photos', id));
      });
      await Promise.all(deletePromises);
      setIsSelectionMode(false);
      setSelectedPhotoIds(new Set());
      showToast(`${deletePromises.length}장의 사진이 삭제되었습니다.`);
    } catch (error) {
      console.error("Error deleting photos:", error);
      showToast('삭제 중 오류가 발생했습니다.');
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
      showToast('삭제 중 오류가 발생했습니다.');
    }
  };

  // Base64 데이터를 다운로드 가능한 파일로 변환하여 다운로드 처리
  const handleDownloadOriginal = (e, photo) => {
    e.stopPropagation();
    try {
      showToast('고화질 이미지를 다운로드 중입니다...');
      const targetUrl = photo.originalUrl || photo.url; 
      
      const link = document.createElement('a');
      link.href = targetUrl;
      link.download = photo.fileName || `gguruk_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Download failed:', error);
      showToast('다운로드에 실패했습니다.');
    }
  };

  // --- 모바일 호환 완벽한 부드러운 드래그 앤 드롭 & 다중 선택 핸들러 ---
  const handlePressStart = (e, clientX, clientY, photo) => {
    if (isSelectionMode) return; 
    
    const rect = e.currentTarget.getBoundingClientRect();
    ghostSize.current = { width: rect.width, height: rect.height };
    dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top };
    ghostImage.current = photo.url;

    touchPos.current = { x: clientX, y: clientY };
    isLongPress.current = false;
    isDragging.current = false;
    justLongPressed.current = false;

    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    
    pressTimerRef.current = setTimeout(() => {
      isLongPress.current = true;
      setDraggedPhotoId(photo.id);
      setDragPos({ x: clientX, y: clientY });
      if (navigator.vibrate) navigator.vibrate(50);
    }, 400); 
  };

  const handlePressMove = (e, clientX, clientY) => {
    const dx = Math.abs(clientX - touchPos.current.x);
    const dy = Math.abs(clientY - touchPos.current.y);

    if (!isLongPress.current && pressTimerRef.current) {
      if (dx > 10 || dy > 10) {
        clearTimeout(pressTimerRef.current);
        setDraggedPhotoId(null);
      }
    } else if (isLongPress.current) {
      if (!isDragging.current && (dx > 10 || dy > 10)) {
        isDragging.current = true;
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
      }
      
      if (isDragging.current) {
        setDragPos({ x: clientX, y: clientY });

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
    }
  };

  const handlePressEnd = async (photo) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);

    if (isLongPress.current) {
      if (isDragging.current) {
        if (targetPhotoId) {
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
        }
      } else {
        setIsSelectionMode(true);
        setSelectedPhotoIds(new Set([photo.id]));
        justLongPressed.current = true;
        setTimeout(() => { justLongPressed.current = false; }, 300);
      }
    }

    isLongPress.current = false;
    isDragging.current = false;
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    setDraggedPhotoId(null);
    setTargetPhotoId(null);
  };

  const handlePressCancel = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (isDragging.current) {
       document.body.style.overflow = '';
       document.body.style.touchAction = '';
    }
    isLongPress.current = false;
    isDragging.current = false;
    setDraggedPhotoId(null);
    setTargetPhotoId(null);
  };

  const handleClick = (e, photo) => {
    e.stopPropagation();
    
    if (justLongPressed.current) return;
    
    if (isSelectionMode) {
      const newSet = new Set(selectedPhotoIds);
      if (newSet.has(photo.id)) {
        newSet.delete(photo.id);
      } else {
        newSet.add(photo.id);
      }
      setSelectedPhotoIds(newSet);
      return; 
    }
    
    setSelectedPhoto(photo);
  };

  // --- 뷰어 핀치 줌 핸들러 ---
  const handleViewerTouchStart = (e) => {
    isDraggingViewer.current = true;
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      viewerTouchStartDist.current = dist;
      viewerTouchStartScale.current = viewerScale;
    } else if (e.touches.length === 1 && viewerScale > 1) {
       viewerLastPos.current = { x: e.touches[0].clientX - viewerPos.x, y: e.touches[0].clientY - viewerPos.y };
    }
  };

  const handleViewerTouchMove = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const newScale = Math.max(1, Math.min(viewerTouchStartScale.current * (dist / viewerTouchStartDist.current), 5));
      setViewerScale(newScale);
    } else if (e.touches.length === 1 && viewerScale > 1) {
       setViewerPos({
          x: e.touches[0].clientX - viewerLastPos.current.x,
          y: e.touches[0].clientY - viewerLastPos.current.y
       });
    }
  };

  const handleViewerTouchEnd = () => {
     isDraggingViewer.current = false;
     if (viewerScale < 1) setViewerScale(1);
     if (viewerScale === 1) setViewerPos({ x: 0, y: 0 });
  };

  const handleMainClick = () => {
    // 배경 클릭 시 동작 유지 (선택 모드는 하단 Cancel 버튼으로 명시적 취소)
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
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4 sm:p-8 relative">
        <style>{globalStyles}</style>

        <div className="w-full max-w-5xl flex flex-col md:flex-row bg-[#0f0f0f] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl animate-slide-up relative">
          
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

        <button 
          onClick={handleInstallClick}
          className="mt-8 flex items-center space-x-1.5 text-zinc-600 hover:text-white transition-colors duration-300"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="font-montserrat font-medium text-[10px] tracking-[0.2em] uppercase">Install App</span>
        </button>

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

      {/* 시네마틱 중앙 업로드 스피너 */}
      {isUploading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl animate-cinematic-entrance">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-24 h-24 border-t-2 border-b-2 border-white/20 rounded-full animate-spin"></div>
            <div className="absolute w-16 h-16 border-r-2 border-l-2 border-white/40 rounded-full animate-[spin_2s_linear_infinite_reverse]"></div>
            <Loader2 className="w-8 h-8 animate-spin text-white drop-shadow-[0_0_15px_rgba(255,255,255,1)]" />
          </div>
          <span className="mt-8 text-white font-montserrat tracking-[0.4em] text-xs uppercase animate-pulse drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
            Uploading {uploadProgress}%
          </span>
        </div>
      )}

      {/* 자유로운 드래그를 위한 고스트 이미지 레이어 */}
      {draggedPhotoId && isDragging.current && ghostImage.current && (
        <div
          className="fixed z-[100] pointer-events-none rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/50 opacity-90"
          style={{
            width: ghostSize.current.width,
            height: ghostSize.current.height,
            left: dragPos.x - dragOffset.current.x,
            top: dragPos.y - dragOffset.current.y,
            transform: 'scale(1.05)',
          }}
        >
          <img src={ghostImage.current} alt="dragging" className="w-full h-full object-cover" />
        </div>
      )}
      
      {/* 헤더 z-index 40 유지, 체크박스는 아래에서 z-30으로 설정하여 헤더 위로 스크롤되지 않도록 해결 */}
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
      
      <main className="max-w-[1600px] mx-auto px-6 py-12 pb-32 relative">
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 space-y-6 md:space-y-0">
          <div>
            <h2 className="text-4xl md:text-5xl font-cute font-bold mb-4 tracking-tighter uppercase">GGURUK</h2>
            <p className="text-zinc-400 font-serif-kr font-light text-lg">우리가 함께한 반짝이는 순간들</p>
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
                onTouchStart={(e) => handlePressStart(e, e.touches[0].clientX, e.touches[0].clientY, photo)}
                onTouchMove={(e) => handlePressMove(e, e.touches[0].clientX, e.touches[0].clientY)}
                onTouchEnd={() => handlePressEnd(photo)}
                onTouchCancel={handlePressCancel}
                onMouseDown={(e) => handlePressStart(e, e.clientX, e.clientY, photo)}
                onMouseMove={(e) => handlePressMove(e, e.clientX, e.clientY)}
                onMouseUp={() => handlePressEnd(photo)}
                onMouseLeave={handlePressCancel}
                onClick={(e) => handleClick(e, photo)}
                onContextMenu={(e) => { e.preventDefault(); return false; }} 
                className={`masonry-item relative group cursor-pointer overflow-hidden rounded-2xl bg-zinc-900 shadow-[0_20px_40px_rgba(0,0,0,0.9),0_5px_15px_rgba(0,0,0,0.8)] transition-all duration-500 ease-out transform-gpu
                  ${draggedPhotoId === photo.id ? 'opacity-70 scale-[0.97]' : ''}
                  ${targetPhotoId === photo.id && draggedPhotoId !== photo.id ? 'ring-4 ring-white z-40' : ''}
                `}
              >
                {/* 에폭시 코팅 1: 가장자리 찌꺼기 완벽 제거를 위한 1px 이너 섀도우 포함, 깊은 입체감 */}
                <div className="absolute inset-0 pointer-events-none z-[15] rounded-2xl shadow-[inset_0_4px_20px_rgba(255,255,255,0.3),inset_0_-10px_30px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(0,0,0,0.7)]"></div>
                {/* 에폭시 코팅 2: 사선으로 부드럽게 떨어지는 굴절 빛반사 */}
                <div className="absolute inset-0 pointer-events-none z-[15] bg-gradient-to-br from-white/30 via-transparent to-black/80 opacity-60 mix-blend-overlay rounded-2xl"></div>
                {/* 에폭시 코팅 3: 상단에 맺히는 극강의 곡선형 하이라이트 */}
                <div className="absolute top-0 inset-x-0 h-[50%] pointer-events-none z-[15] bg-gradient-to-b from-white/20 to-transparent rounded-t-2xl mix-blend-screen opacity-80"></div>

                {/* 다중 선택 모드 체크박스 */}
                <div className={`absolute top-4 right-4 z-30 transition-all duration-500 ease-out ${isSelectionMode ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}>
                  <div className={`w-8 h-8 rounded-full border-[1.5px] flex items-center justify-center backdrop-blur-md transition-all duration-500 shadow-xl ${selectedPhotoIds.has(photo.id) ? 'bg-white/20 border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'border-white/40 bg-black/40 hover:border-white/80 hover:bg-black/60'}`}>
                    <Check className={`w-5 h-5 text-white drop-shadow-[0_0_10px_rgba(255,255,255,1)] transition-all duration-300 ${selectedPhotoIds.has(photo.id) ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} strokeWidth={3} />
                  </div>
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 pointer-events-none"></div>
                
                <img src={photo.url} alt="꾸루" loading="lazy" className="w-full h-auto object-cover rounded-2xl hover-scale pointer-events-none" />
                
                <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500 z-20 pointer-events-none">
                  <p className="text-white text-base font-serif-kr font-light">{new Date(photo.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 우측 하단 플로팅 액션 버튼 (FAB) - 기포 제거, 시네마틱 폰트 적용된 입체 물방울 디자인 */}
      {photos.length > 0 && !isSelectionMode && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="fixed bottom-8 right-8 z-40 w-16 h-16 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-xl rounded-full flex items-center justify-center transition-all duration-500 ease-out disabled:opacity-50 group shadow-[0_15px_35px_rgba(0,0,0,0.8),inset_0_8px_15px_rgba(255,255,255,0.4),inset_0_-8px_15px_rgba(0,0,0,0.6),inset_0_0_10px_rgba(255,255,255,0.1)] hover:scale-110 hover:shadow-[0_20px_40px_rgba(0,0,0,0.9),inset_0_10px_20px_rgba(255,255,255,0.6),inset_0_-10px_20px_rgba(0,0,0,0.7),inset_0_0_15px_rgba(255,255,255,0.2)]"
        >
          {/* 시네마틱 세리프 폰트 적용된 '+' 마크 */}
          <span className="font-cinzel text-4xl font-normal leading-none relative top-[1px] drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)] group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,1)] transition-all duration-500 z-10 text-white/90">+</span>
        </button>
      )}

      {/* 다중 선택 시 하단 삭제 컨트롤 바 */}
      {isSelectionMode && (
        <div className="fixed bottom-8 left-0 right-0 z-50 flex justify-center animate-slide-up px-4 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-3xl border border-white/15 rounded-full px-5 py-3.5 flex items-center space-x-5 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] pointer-events-auto whitespace-nowrap">
            
            <span className="text-white font-cute text-sm tracking-wider whitespace-nowrap flex-shrink-0 drop-shadow-md">
              {selectedPhotoIds.size}장 선택됨
            </span>
            
            <div className="w-px h-4 bg-white/20 flex-shrink-0"></div>
            
            <button 
              onClick={() => { setIsSelectionMode(false); setSelectedPhotoIds(new Set()); }} 
              className="text-zinc-300 hover:text-white text-xs md:text-sm font-montserrat tracking-widest uppercase transition-colors whitespace-nowrap flex-shrink-0 drop-shadow-md"
            >
              Cancel
            </button>
            
            <button 
              onClick={handleDeleteSelected} 
              disabled={selectedPhotoIds.size === 0} 
              className="text-red-400 hover:text-red-300 text-xs md:text-sm font-montserrat tracking-widest uppercase disabled:opacity-50 flex items-center space-x-1.5 transition-colors whitespace-nowrap flex-shrink-0 drop-shadow-md"
            >
              <Minus className="w-4 h-4" />
              <span>Delete</span>
            </button>
            
          </div>
        </div>
      )}

      {/* 뷰어 삭제 전용 커스텀 모달 */}
      {viewerDeleteTarget && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-[#111111] border border-zinc-800 p-8 rounded-2xl shadow-2xl text-center max-w-sm w-full mx-4 animate-[slideUpFade_0.3s_ease-out]">
            <Trash2 className="w-8 h-8 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl text-white font-serif-kr font-light mb-8 tracking-wide">정말로 이 사진을<br/>삭제하시겠습니까?</h3>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => setViewerDeleteTarget(null)}
                className="flex-1 px-4 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors font-montserrat text-sm tracking-widest uppercase"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                   await handleDeletePhoto(viewerDeleteTarget);
                   setViewerDeleteTarget(null);
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-montserrat font-bold hover:bg-red-400 transition-colors text-sm tracking-widest uppercase"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 앱 로그아웃용 커스텀 모달 */}
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

      {/* 시네마틱 이미지 뷰어 (원본 다운로드 기능이 적용된 상태) */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-3xl animate-[cinematicEntrance_0.4s_ease-out]">
          
          <div className="absolute top-0 left-0 right-0 z-[210] flex justify-between items-center p-5 md:p-6 bg-gradient-to-b from-black/80 to-transparent">
            <p className="text-white font-serif-kr text-sm md:text-base font-light tracking-wider drop-shadow-md">
              {new Date(selectedPhoto.createdAt).toLocaleString()}
            </p>
            <div className="flex items-center space-x-3 md:space-x-4">
              <button 
                onClick={(e) => handleDownloadOriginal(e, selectedPhoto)} 
                className="p-2.5 md:p-3 text-zinc-300 hover:text-white transition-colors bg-white/10 rounded-full backdrop-blur-md hover:bg-white/20"
              >
                <Download className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button 
                onClick={() => setViewerDeleteTarget(selectedPhoto.id)} 
                className="p-2.5 md:p-3 text-red-400 hover:text-red-300 transition-colors bg-white/10 rounded-full backdrop-blur-md hover:bg-white/20"
              >
                <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button 
                onClick={() => setSelectedPhoto(null)} 
                className="p-2.5 md:p-3 text-zinc-300 hover:text-white transition-colors bg-white/10 rounded-full backdrop-blur-md hover:bg-white/20"
              >
                <X className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-hidden relative flex items-center justify-center touch-none"
            style={{ touchAction: 'none' }}
            onTouchStart={handleViewerTouchStart}
            onTouchMove={handleViewerTouchMove}
            onTouchEnd={handleViewerTouchEnd}
            onClick={() => { /* 배경 터치 시 줌 아웃이나 닫기 등을 원할 경우 추가 가능 */ }}
          >
            <img
              src={selectedPhoto.originalUrl || selectedPhoto.url}
              style={{
                transform: `translate(${viewerPos.x}px, ${viewerPos.y}px) scale(${viewerScale})`,
                transition: isDraggingViewer.current ? 'none' : 'transform 0.2s ease-out'
              }}
              className="max-w-[100vw] max-h-[100vh] object-contain shadow-2xl transform-gpu"
              alt="viewer"
              onClick={(e) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
