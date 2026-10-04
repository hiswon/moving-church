import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import './MissionMapGraph.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type MissionaryCategory = '예배자' | '보는자' | '만난자' | '통로자';

interface MissionaryData {
  id: string;
  name: string;          
  alias?: string;        
  country: string;       
  region: '아시아' | '아프리카' | '아메리카' | '유럽' | '오세아니아' | '기타';
  category: MissionaryCategory; 
  prayerPoints: string;  
  memo?: string;         
  lat: number;
  lng: number;
}

const CATEGORY_COLORS: Record<MissionaryCategory, { bg: string; border: string; textColor: string }> = {
  '예배자': { bg: '#e74c3c', border: '#2c3e50', textColor: '#ffffff' },  
  '보는자': { bg: '#f1c40f', border: '#2c3e50', textColor: '#2c3e50' },  
  '만난자': { bg: '#2ecc71', border: '#2c3e50', textColor: '#ffffff' },  
  '통로자': { bg: '#acacac', border: '#2c3e50', textColor: '#f1f1f1' },  
};

const createColoredIcon = (category: MissionaryCategory) => {
  const colorInfo = CATEGORY_COLORS[category] || CATEGORY_COLORS['예배자'];
  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="
      background-color: ${colorInfo.bg};
      border: 2px solid ${colorInfo.border};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
};

const BIBLICAL_NAMES = [
  '요한', '베드로', '바울', '다니엘', '누가', '모세', '아브라함', 
  '다윗', '사무엘', '이사야', '예레미야', '마태', '마가', '디모데', '바나바', '느헤미야'
];

const getRandomBiblicalName = () => {
  const randomIndex = Math.floor(Math.random() * BIBLICAL_NAMES.length);
  return BIBLICAL_NAMES[randomIndex];
};

const INITIAL_MISSIONARIES: MissionaryData[] = [
  { id: 'm1', name: '린', alias: '소망이', country: '태국', region: '아시아', category: '예배자', prayerPoints: '하나님 사랑으로 힘을 얻도록', memo: '', lat: 13.7563, lng: 100.5018 },
  { id: 'm2', name: '엘샤이', alias: '믿음이', country: '태국', region: '아시아', category: '예배자', prayerPoints: '하나님 사랑으로 힘을 얻도록', memo: '연락 원활함', lat: 18.7883, lng: 98.9853 },
  { id: 'm3', name: '웰', alias: '기쁨이', country: '태국', region: '아시아', category: '예배자', prayerPoints: '하나님 사랑으로 힘을 얻도록', memo: '작년에 단기 방문으로 만남', lat: 15.8700, lng: 100.9925 },
  { id: 'm4', name: '최다니엘', alias: '평화', country: '캄보디아', region: '아시아', category: '통로자', prayerPoints: '우물 도우미 및 현지 신학교 운영', memo: '현재 국내 복귀 후 협력 중', lat: 11.5564, lng: 104.9282 },
  { id: 'm5', name: '정누가', alias: '참빛', country: '베트남', region: '아시아', category: '예배자', prayerPoints: '가정 교회 지도자 양성 교육', memo: '', lat: 21.0285, lng: 105.8542 },
  { id: 'm6', name: '오모세', alias: '믿음', country: '베트남', region: '아시아', category: '보는자', prayerPoints: '남부 지역 의료 봉사 및 제자훈련', memo: '', lat: 10.8231, lng: 106.6297 },
  { id: 'm7', name: '한브리지', alias: '사랑', country: '미얀마', region: '아시아', category: '만난자', prayerPoints: '난민 구호 및 어린이 급식 사역', memo: '', lat: 19.7633, lng: 96.0785 },
  { id: 'm8', name: '배아브라함', alias: '축복', country: '케냐', region: '아프리카', category: '통로자', prayerPoints: '마사이족 마을 우물 파기 사업', memo: '', lat: -1.2921, lng: 36.8219 },
  { id: 'm9', name: '홍필립', alias: '희망', country: '페루', region: '아메리카', category: '예배자', prayerPoints: '아마존 부족 마을 성경 번역 사역', memo: '', lat: -12.0464, lng: -77.0428 },
  { id: 'm10', name: '숨삭', alias: '밝음', country: '태국', region: '아시아', category: '통로자', prayerPoints: '우상을 버리고 주님만 섬기도록', memo: '추석전주 본국으로 귀향', lat: 14.8, lng: 101.6 },

];

function ChangeMapView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  map.setView(center, zoom, { animate: true });
  return null;
}

function LocationPicker({ lat, lng, onSelectLocation }: { lat: number; lng: number; onSelectLocation: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelectLocation(Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4)));
    },
  });

  return lat && lng ? <Marker position={[lat, lng]} /> : null;
}

export const MissionMapGraph: React.FC = () => {
  const [selectedRegion, setSelectedRegion] = useState<string>('전체');
  const [selectedCountryFilter, setSelectedCountryFilter] = useState<string>('전체');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('전체');
  
  const [missionaries, setMissionaries] = useState<MissionaryData[]>(INITIAL_MISSIONARIES);
  const [selectedMissionary, setSelectedMissionary] = useState<MissionaryData>(INITIAL_MISSIONARIES[0]);
  
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);

  const [expandedContinents, setExpandedContinents] = useState<Record<string, boolean>>({
    '아시아': true,
    '아프리카': true,
  });

  const [mapView, setMapView] = useState<{ center: [number, number]; zoom: number }>({
    center: [15.0, 100.0],
    zoom: 3,
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingAction, setPendingAction] = useState<'add' | 'edit' | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    alias: '',
    country: '',
    isCustomCountry: false,
    region: '아시아' as MissionaryData['region'],
    category: '예배자' as MissionaryCategory,
    prayerPoints: '',
    memo: '',
    lat: 13.7563,
    lng: 100.5018,
  });

  useEffect(() => {
    const fetchFirestoreData = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "missionaries"));
        const firebaseData: MissionaryData[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data() as Omit<MissionaryData, 'id'>;
          const finalAlias = data.alias && data.alias.trim() !== '' ? data.alias : getRandomBiblicalName();
          const finalCategory = data.category || '예배자';
          firebaseData.push({ id: doc.id, ...data, alias: finalAlias, category: finalCategory });
        });
        
        const processedInitial = INITIAL_MISSIONARIES.map(m => ({
          ...m,
          alias: m.alias || getRandomBiblicalName(),
          category: m.category || '예배자'
        }));

        if (firebaseData.length > 0) {
          setMissionaries([...processedInitial, ...firebaseData]);
          setSelectedMissionary([...processedInitial, ...firebaseData][0]);
        } else {
          setMissionaries(processedInitial);
          setSelectedMissionary(processedInitial[0]);
        }
      } catch (error) {
        console.error("Firestore 데이터 로딩 실패:", error);
      }
    };
    fetchFirestoreData();
  }, []);

  const regions = ['전체', '아시아', '아프리카', '아메리카', '유럽', '오세아니아', '기타'];
  const categories: MissionaryCategory[] = ['예배자', '보는자', '만난자', '통로자'];

  // 🌟 카테고리 필터가 적용된 중간 집합 데이터 (국가 목록 및 대륙별 통계 계산 시 활용)
  const categoryFilteredMissionaries = missionaries.filter(item => {
    return selectedCategoryFilter === '전체' || item.category === selectedCategoryFilter;
  });

  const allExistingCountries = Array.from(new Set(missionaries.map(m => m.country)));

  // 🌟 국가 필터 버튼 목록도 현재 선택된 대륙 및 카테고리에 맞게 동적으로 구성
  const availableCountries = selectedRegion === '전체'
    ? Array.from(new Set(categoryFilteredMissionaries.map(m => m.country)))
    : Array.from(new Set(categoryFilteredMissionaries.filter(m => m.region === selectedRegion).map(m => m.country)));

  const categoryCounts = categories.reduce((acc, cat) => {
    acc[cat] = missionaries.filter(m => m.category === cat).length;
    return acc;
  }, {} as Record<MissionaryCategory, number>);

  const handleRegionChange = (reg: string) => {
    setSelectedRegion(reg);
    setSelectedCountryFilter('전체');

    if (reg === '아시아') {
      setMapView({ center: [25.0, 90.0], zoom: 3 });
    } else if (reg === '아프리카') {
      setMapView({ center: [2.0, 20.0], zoom: 3 });
    } else if (reg === '아메리카') {
      setMapView({ center: [-5.0, -60.0], zoom: 2 });
    } else if (reg === '유럽') {
      setMapView({ center: [50.0, 10.0], zoom: 4 });
    } else if (reg === '오세아니아') {
      setMapView({ center: [-25.0, 135.0], zoom: 3 });
    } else {
      setMapView({ center: [15.0, 100.0], zoom: 2 });
    }
  };

  const handleCountryFilterChange = (country: string) => {
    setSelectedCountryFilter(country);
    if (country === '전체') {
      handleRegionChange(selectedRegion);
    } else {
      const target = categoryFilteredMissionaries.find(m => m.country === country);
      if (target) {
        setMapView({ center: [target.lat, target.lng], zoom: 6 });
      }
    }
  };

  // 최종 화면/지도 표시 필터링 (지역 + 국가 + 카테고리 모두 만족)
  const filteredMissionaries = categoryFilteredMissionaries.filter((item) => {
    const matchesRegion = selectedRegion === '전체' || item.region === selectedRegion;
    const matchesCountry = selectedCountryFilter === '전체' || item.country === selectedCountryFilter;
    return matchesRegion && matchesCountry;
  });

  const totalMissionariesCount = missionaries.length;
  const currentFilteredCount = categoryFilteredMissionaries.length;

  // 🌟 국가별 통계 및 대륙별 통계를 'categoryFilteredMissionaries' 기준으로 계산하여 선택된 카테고리의 숫자만 반영되도록 수정
  const countryStatsMap = categoryFilteredMissionaries.reduce((acc, curr) => {
    if (!acc[curr.country]) {
      acc[curr.country] = { country: curr.country, region: curr.region, count: 0, missionaries: [] };
    }
    acc[curr.country].count += 1;
    acc[curr.country].missionaries.push(curr);
    return acc;
  }, {} as Record<string, { country: string; region: MissionaryData['region']; count: number; missionaries: MissionaryData[] }>);

  const countryStatsList = Object.values(countryStatsMap);
  const continentList: MissionaryData['region'][] = ['아시아', '아프리카', '아메리카', '유럽', '오세아니아', '기타'];

  const computedContinentStats = continentList.map((continent) => {
    const mInContinent = categoryFilteredMissionaries.filter(i => i.region === continent);
    const count = mInContinent.length;
    const percent = currentFilteredCount > 0 ? Math.round((count / currentFilteredCount) * 100) : 0;
    const countriesInContinent = countryStatsList.filter(c => c.region === continent);

    return {
      name: continent,
      count,
      percent,
      countries: countriesInContinent,
    };
  }).filter((stat) => stat.count > 0);

  const toggleContinentAccordion = (continentName: string) => {
    setExpandedContinents(prev => ({
      ...prev,
      [continentName]: !prev[continentName]
    }));
  };

  const handleMissionarySelect = (missionary: MissionaryData) => {
    setSelectedMissionary(missionary);
    setMapView({ center: [missionary.lat, missionary.lng], zoom: 6 });
  };

  const requestAuth = (action: 'add' | 'edit') => {
    if (isAdminMode) {
      if (action === 'add') {
        openAddModalDirect();
      } else if (action === 'edit' && selectedMissionary) {
        openEditModalDirect(selectedMissionary);
      }
    } else {
      setPendingAction(action);
      setPasswordInput('');
      setIsAuthModalOpen(true);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '12345') {
      setIsAdminMode(true);
      setIsAuthModalOpen(false);
      if (pendingAction === 'add') {
        openAddModalDirect();
      } else if (pendingAction === 'edit' && selectedMissionary) {
        openEditModalDirect(selectedMissionary);
      }
    } else {
      alert('비밀번호가 올바르지 않습니다.');
    }
  };

  const openAddModalDirect = () => {
    setIsEditing(false);
    setCurrentId(null);
    const initialCountry = allExistingCountries.length > 0 ? allExistingCountries[0] : '태국';
    setFormData({
      name: '',
      alias: getRandomBiblicalName(),
      country: initialCountry,
      isCustomCountry: false,
      region: selectedRegion !== '전체' ? (selectedRegion as any) : '아시아',
      category: selectedCategoryFilter !== '전체' ? (selectedCategoryFilter as MissionaryCategory) : '예배자',
      prayerPoints: '',
      memo: '',
      lat: 13.7563,
      lng: 100.5018,
    });
    setIsModalOpen(true);
  };

  const openEditModalDirect = (missionary: MissionaryData) => {
    setIsEditing(true);
    setCurrentId(missionary.id);
    const isExisting = allExistingCountries.includes(missionary.country);
    setFormData({
      name: missionary.name,
      alias: missionary.alias || getRandomBiblicalName(),
      country: missionary.country,
      isCustomCountry: !isExisting,
      region: missionary.region,
      category: missionary.category || '예배자',
      prayerPoints: missionary.prayerPoints,
      memo: missionary.memo || '',
      lat: missionary.lat,
      lng: missionary.lng,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.country.trim()) {
      alert('국가 이름을 입력해주세요.');
      return;
    }

    const finalAlias = formData.alias.trim() ? formData.alias.trim() : getRandomBiblicalName();

    try {
      if (isEditing && currentId) {
        if (!currentId.length || INITIAL_MISSIONARIES.some(i => i.id === currentId)) {
          setMissionaries(prev => prev.map(item => item.id === currentId ? { ...item, ...formData, alias: finalAlias } : item));
          if (selectedMissionary.id === currentId) {
            setSelectedMissionary({ id: currentId, ...formData, alias: finalAlias });
          }
        } else {
          const docRef = doc(db, "missionaries", currentId);
          await updateDoc(docRef, {
            name: formData.name,
            alias: finalAlias,
            country: formData.country,
            region: formData.region,
            category: formData.category,
            prayerPoints: formData.prayerPoints,
            memo: formData.memo,
            lat: Number(formData.lat),
            lng: Number(formData.lng),
          });
          setMissionaries(prev => prev.map(item => item.id === currentId ? { id: currentId, ...formData, alias: finalAlias } : item));
          if (selectedMissionary.id === currentId) {
            setSelectedMissionary({ id: currentId, ...formData, alias: finalAlias });
          }
        }
        alert('정보가 성공적으로 수정되었습니다!');
      } else {
        const docRef = await addDoc(collection(db, "missionaries"), {
          name: formData.name,
          alias: finalAlias,
          country: formData.country,
          region: formData.region,
          category: formData.category,
          prayerPoints: formData.prayerPoints,
          memo: formData.memo,
          lat: Number(formData.lat),
          lng: Number(formData.lng),
        });

        const newItem: MissionaryData = {
          id: docRef.id,
          name: formData.name,
          alias: finalAlias,
          country: formData.country,
          region: formData.region,
          category: formData.category,
          prayerPoints: formData.prayerPoints,
          memo: formData.memo,
          lat: formData.lat,
          lng: formData.lng,
        };
        setMissionaries(prev => [...prev, newItem]);
        setSelectedMissionary(newItem);
        alert('새로운 사람이 추가되었습니다!');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("저장 실패:", error);
      alert('처리 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!currentId) return;
    if (!window.confirm(`정말 "${formData.alias}" 정보를 삭제하시겠습니까?`)) return;

    try {
      if (!INITIAL_MISSIONARIES.some(i => i.id === currentId)) {
        await deleteDoc(doc(db, "missionaries", currentId));
      }
      setMissionaries(prev => prev.filter(item => item.id !== currentId));
      const remaining = missionaries.filter(item => item.id !== currentId);
      if (remaining.length > 0) {
        setSelectedMissionary(remaining[0]);
      }
      setIsModalOpen(false);
      alert('삭제되었습니다.');
    } catch (error) {
      console.error("삭제 실패:", error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="mission-map-container">

      {/* 🌟 프라이버시 주의사항 안내 박스 */}
      <div className="privacy-notice-box">
        <div className="privacy-notice-text phone-cut">
          아래 지도에 등록된 이름들은 프라이버시를 위해 가명임을 알려드립니다.
        </div>
      </div>
      {/* 상단 4가지 분류별 합계 통계 카드 */}
      <div className="stats-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: '0.5rem' }}>
        <div 
          className={`stat-card ${selectedCategoryFilter === '전체' ? 'active-stat-card' : ''}`}
          onClick={() => { setSelectedCategoryFilter('전체'); setSelectedCountryFilter('전체'); }}
          style={{ cursor: 'pointer', border: selectedCategoryFilter === '전체' ? '2px solid var(--accent-earth, #9e522b)' : undefined, padding: '0.5rem', textAlign: 'center' }}
        >
          <div className="stat-label" style={{ fontSize: '0.75rem' }}>전체 보기</div>
          <div className="stat-value" style={{ fontSize: '1.1rem' }}>{totalMissionariesCount}<span className="stat-unit" style={{ fontSize: '0.65rem' }}>명</span></div>
        </div>
        
        {categories.map((cat) => {
          const isSelected = selectedCategoryFilter === cat;
          const colorInfo = CATEGORY_COLORS[cat];
          return (
            <div
              key={cat}
              className={`stat-card ${isSelected ? 'active-stat-card' : ''}`}
              onClick={() => { setSelectedCategoryFilter(cat); setSelectedCountryFilter('전체'); }}
              style={{ cursor: 'pointer', border: isSelected ? '2px solid var(--accent-earth, #9e522b)' : undefined, padding: '0.5rem', textAlign: 'center' }}
            >
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', fontSize: '0.75rem' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: colorInfo.bg, border: '1px solid #999', display: 'inline-block' }}></span>
                {cat}
              </div>
              <div className="stat-value" style={{ fontSize: '1.1rem' }}>{categoryCounts[cat]}<span className="stat-unit" style={{ fontSize: '0.65rem' }}>명</span></div>
            </div>
          );
        })}
      </div>

      {/* 세계 지도 카드 */}
      <div className="world-map-card">
        <div className="map-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="map-title" style={{ fontSize: '0.9rem' }}>
            🌐 무빙처치 세계지도
            {selectedCategoryFilter !== '전체' && <span style={{ fontSize: '0.75rem', color: '#9e522b', fontWeight: 700, marginLeft: '0.3rem' }}>[{selectedCategoryFilter}]</span>}
            {isAdminMode && <span style={{ fontSize: '0.65rem', color: '#9e522b', fontWeight: 700, marginLeft: '0.3rem' }}>(관리자모드)</span>}
          </div>
          
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {isAdminMode ? (
              <>
                <button className="add-country-btn" onClick={() => requestAuth('add')} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                  + 추가
                </button>
                <button className="add-country-btn" onClick={() => setIsAdminMode(false)} style={{ background: '#555', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                  일반모드로 전환
                </button>
              </>
            ) : (
              <button className="add-country-btn" style={{ background: '#c0b9b4', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => requestAuth('add')}>
                관리자 전환
              </button>
            )}
          </div>
        </div>

        {/* 대륙 필터 */}
        <div className="region-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {regions.map((reg) => (
            <button
              key={reg}
              className={`filter-chip ${selectedRegion === reg ? 'active' : ''}`}
              onClick={() => handleRegionChange(reg)}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              {reg}
            </button>
          ))}
        </div>

        {/* 🌟 선택된 카테고리에 해당하는 국가와 인원수만 동적으로 표시되는 국가 필터 바 */}
        <div className="region-filter-bar" style={{ marginTop: '0.2rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          <button
            className={`filter-chip-sub ${selectedCountryFilter === '전체' ? 'active' : ''}`}
            onClick={() => handleCountryFilterChange('전체')}
            style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
          >
            전체 국가 보기 ({currentFilteredCount})
          </button>
          {availableCountries.map((countryName) => {
            const countInCountry = categoryFilteredMissionaries.filter(m => m.country === countryName).length;
            return (
              <button
                key={countryName}
                className={`filter-chip-sub ${selectedCountryFilter === countryName ? 'active' : ''}`}
                onClick={() => handleCountryFilterChange(countryName)}
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
              >
                {countryName} ({countInCountry})
              </button>
            );
          })}
        </div>

        <div className="leaflet-map-container" style={{ height: '300px', marginTop: '0.5rem' }}>
          <MapContainer center={mapView.center} zoom={mapView.zoom} style={{ height: '100%', width: '100%', borderRadius: '0.875rem' }} scrollWheelZoom={true}>
            <ChangeMapView center={mapView.center} zoom={mapView.zoom} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filteredMissionaries.map((item) => {
              const displayName = isAdminMode ? `${item.name} (${item.alias})` : item.alias;
              const customIcon = createColoredIcon(item.category);
              return (
                <Marker
                  key={item.id}
                  position={[item.lat, item.lng]}
                  icon={customIcon}
                  eventHandlers={{
                    click: () => handleMissionarySelect(item),
                  }}
                >
                  <Popup>
                    <strong>{displayName}</strong> ({item.country})<br />
                    <span style={{ color: CATEGORY_COLORS[item.category]?.bg || '#000', fontWeight: 'bold' }}>
                      [{item.category}]
                    </span> {item.prayerPoints}
                    {item.memo && (
                      <>
                        <br />
                        <span style={{ color: '#0b6b10', fontSize: '0.9em' }}>| {item.memo} |</span>
                      </>
                    )}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {selectedMissionary && (
          <div className="mission-detail-card" style={{ marginTop: '0.5rem', padding: '0.75rem' }}>
            <div className="detail-top-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
              <div className="detail-country-title" style={{ fontSize: '0.9rem' }}>
                👤 {isAdminMode ? `${selectedMissionary.name} (${selectedMissionary.alias})` : selectedMissionary.alias} ({selectedMissionary.country})
              </div>
              <div className="detail-header-actions" style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <span className="detail-badge" style={{ backgroundColor: CATEGORY_COLORS[selectedMissionary.category]?.bg, color: CATEGORY_COLORS[selectedMissionary.category]?.textColor, fontSize: '0.7rem', padding: '0.15rem 0.4rem', border: '1px solid #ccc' }}>
                  {selectedMissionary.category}
                </span>
                <span className="detail-badge" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>{selectedMissionary.region}</span>
                {isAdminMode && (
                  <button className="action-btn-sm" onClick={() => requestAuth('edit')} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}>
                    <span className="text-pc">수정 / 관리</span>
                    <span className="text-mo">수정</span>
                  </button>
                )}
              </div>
            </div>

            <div className="prayer-box" style={{ marginTop: '0.3rem' }}>
              <span className="metric-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>기도제목</span>
              <p className="metric-content" style={{ fontSize: '0.8rem', margin: '0.2rem 0' }}>{selectedMissionary.prayerPoints}</p>
              {selectedMissionary.memo && (
                <>
                  <span className="metric-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'block', marginTop: '0.3rem' }}>memory</span>
                  <p className="metric-content" style={{ fontSize: '0.8rem', margin: '0.2rem 0', color: '#555' }}>{selectedMissionary.memo}</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 대륙별 및 국가별 통계 카드 (선택된 카테고리에 연동됨) */}
      <div className="chart-card" style={{ marginTop: '0.75rem' }}>
        <div className="map-title phone-cut" style={{ fontSize: '0.85rem' }}>
          📊 대륙별 및 국가별 분포 현황 {selectedCategoryFilter !== '전체' && <span style={{ color: '#9e522b' }}>[{selectedCategoryFilter}]</span>} (터치하여 펼치기)
        </div>
        <div className="chart-list" style={{ marginTop: '0.5rem' }}>
          {computedContinentStats.map((stat) => {
            const isExpanded = !!expandedContinents[stat.name];
            return (
              <div key={stat.name} className="chart-item" style={{ marginBottom: '0.5rem' }}>
                <div 
                  className="chart-label-row continent-accordion-header" 
                  onClick={() => toggleContinentAccordion(stat.name)}
                  style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.8rem' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.65rem', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                    {stat.name}
                  </span>
                  <span>총 <strong>{stat.count}명</strong> ({stat.percent}%)</span>
                </div>

                <div className="chart-bar-bg" style={{ height: '0.3rem', background: '#eee', borderRadius: '3px', overflow: 'hidden', margin: '0.2rem 0' }}>
                  <div
                    className="chart-bar-fill"
                    style={{ width: `${stat.percent}%`, height: '100%', background: '#9e522b' }}
                  />
                </div>

                {isExpanded && stat.countries.length > 0 ? (
                  <div className="continent-countries-list" style={{ paddingLeft: '0.5rem', marginTop: '0.3rem' }}>
                    {stat.countries.map((c) => {
                      const countryPercent = currentFilteredCount > 0 ? Math.round((c.count / currentFilteredCount) * 100) : 0;
                      return (
                        <div key={c.country} className="country-group-card" style={{ marginBottom: '0.4rem' }}>
                          <div className="country-group-header" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                            <span className="country-name-bold">📍 {c.country}</span>
                            <span className="country-chip-count">{c.count}명 ({countryPercent}%)</span>
                          </div>
                          
                          <div className="chart-bar-bg" style={{ height: '0.25rem', margin: '0.1rem 0 0.2rem 0', background: '#eee', borderRadius: '2px' }}>
                            <div
                              className="chart-bar-fill"
                              style={{ width: `${countryPercent}%`, height: '100%', background: 'linear-gradient(90deg, #9e522b 0%, #bd734c 100%)' }}
                            />
                          </div>

                          <div className="country-missionaries-names" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
                            {c.missionaries.map((m) => {
                              const tagLabel = isAdminMode ? `${m.name}(${m.alias})` : (m.alias || '이름');
                              const catColor = CATEGORY_COLORS[m.category]?.bg || '#9e522b';
                              return (
                                <span 
                                  key={m.id} 
                                  className="missionary-name-tag"
                                  onClick={() => handleMissionarySelect(m)}
                                  style={{ borderLeft: `3px solid ${catColor}`, fontSize: '0.7rem', padding: '0.1rem 0.3rem', background: '#fafafa', border: '1px solid #ddd', borderRadius: '3px', cursor: 'pointer' }}
                                  title={`분류: ${m.category}`}
                                >
                                  {tagLabel}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* 비밀번호 인증 모달 */}
      {isAuthModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '305px', padding: '1rem' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
              <span>관리자 비밀번호 확인</span>
              <button className="modal-close-btn" onClick={() => setIsAuthModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>
            </div>
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ fontSize: '0.75rem', color: '#555' }}>관리자 비밀번호를 입력하세요</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="비밀번호"
                  style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                />
              </div>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                <button type="button" className="modal-cancel-btn" onClick={() => setIsAuthModalOpen(false)} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>취소</button>
                <button type="submit" className="modal-submit-btn" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>확인</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 사람 추가 및 수정 모달 */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px', width: '90%', maxHeight: '90vh', overflowY: 'auto', padding: '1rem' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
              <span>{isEditing ? '정보 수정 및 삭제' : '새로운 사람 추가'}</span>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>실제 이름 (관리자용)</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="예: 홍길동"
                    style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                  />
                </div>
                
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>가명 (화면 표시)</label>
                  <input
                    type="text"
                    value={formData.alias}
                    onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                    placeholder="공백시 성경인물 자동"
                    style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>대륙 선택</label>
                  <select
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value as any })}
                    style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                  >
                    <option value="아시아">아시아</option>
                    <option value="아프리카">아프리카</option>
                    <option value="아메리카">아메리카</option>
                    <option value="유럽">유럽</option>
                    <option value="오세아니아">오세아니아</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>관계 분류 (핀 색상)</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as MissionaryCategory })}
                    style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                  >
                    <option value="예배자">🔴 예배자</option>
                    <option value="보는자">🟡 보는자</option>
                    <option value="만난자">🟢 만난자</option>
                    <option value="통로자">⚪ 통로자</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>파송 국가</label>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--accent-earth, #9e522b)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    onClick={() => setFormData({ ...formData, isCustomCountry: !formData.isCustomCountry, country: '' })}
                  >
                    {formData.isCustomCountry ? '목록 선택' : '+ 직접 입력'}
                  </button>
                </div>

                {formData.isCustomCountry ? (
                  <input
                    type="text"
                    required
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="예: 영국"
                    style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                  />
                ) : (
                  <select
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                  >
                    {allExistingCountries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>위치 지정 (지도를 클릭하세요)</label>
                <div style={{ width: '100%', height: '130px', borderRadius: '0.4rem', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                  <MapContainer center={[formData.lat, formData.lng]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <LocationPicker
                      lat={formData.lat}
                      lng={formData.lng}
                      onSelectLocation={(lat, lng) => setFormData({ ...formData, lat, lng })}
                    />
                  </MapContainer>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.7rem' }}>위도 (Lat)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: Number(e.target.value) })}
                    style={{ fontSize: '0.8rem', padding: '0.25rem' }}
                  />
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.7rem' }}>경도 (Lng)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.lng}
                    onChange={(e) => setFormData({ ...formData, lng: Number(e.target.value) })}
                    style={{ fontSize: '0.8rem', padding: '0.25rem' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>주요 기도제목 / 사역 내용</label>
                <textarea
                  rows={2}
                  required
                  value={formData.prayerPoints}
                  onChange={(e) => setFormData({ ...formData, prayerPoints: e.target.value })}
                  placeholder="기도제목을 입력하세요"
                  style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>추가 메모 (선택)</label>
                <textarea
                  rows={2}
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  placeholder="기타 참고할 메모를 입력하세요"
                  style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                />
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.5rem' }}>
                {isEditing && (
                  <button type="button" className="modal-delete-btn" onClick={handleDelete} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '4px' }}>
                    삭제
                  </button>
                )}
                <button type="button" className="modal-cancel-btn" onClick={() => setIsModalOpen(false)} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>취소</button>
                <button type="submit" className="modal-submit-btn" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>{isEditing ? '수정 완료' : '저장하기'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};