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

interface MissionaryData {
  id: string;
  name: string;          // 선교사 실명
  alias?: string;        // 🌟 가명 항목 추가
  country: string;       // 소속 국가 (예: 태국)
  region: '아시아' | '아프리카' | '아메리카' | '유럽' | '오세아니아' | '기타';
  prayerPoints: string;  // 주요 기도제목 또는 사역 내용
  lat: number;
  lng: number;
}

// 🌟 무작위 동물 이름 배열 (가명이 없을 때 랜덤 부여용)
const RANDOM_NICKNAME = [
  '좋아', '가자', '곰', '여우', '토끼', '다람쥐', '팬더', '코알라', 
  '수달', '펭귄', '돌고래', '부엉이', '알파카', '햄스터', '쿼카', '기린'
];

const getRandomName = () => {
  const randomIndex = Math.floor(Math.random() * RANDOM_NICKNAME.length);
  return RANDOM_NICKNAME[randomIndex];
};

const INITIAL_MISSIONARIES: MissionaryData[] = [
  { id: 'm1', name: '김요한', alias: '푸른사자', country: '태국', region: '아시아', prayerPoints: '청소년 센터 건립 및 유치원 사역', lat: 13.7563, lng: 100.5018 },
  { id: 'm2', name: '이베드로', alias: '행복토끼', country: '태국', region: '아시아', prayerPoints: '방콕 북부 지역 개척 교회 사역', lat: 18.7883, lng: 98.9853 },
  { id: 'm3', name: '박바울', alias: '참다람쥐', country: '태국', region: '아시아', prayerPoints: '산지족 어린이 교육 및 급식 지원', lat: 15.8700, lng: 100.9925 },
  { id: 'm4', name: '최다니엘', alias: '용감한곰', country: '캄보디아', region: '아시아', prayerPoints: '우물 도우미 및 현지 신학교 운영', lat: 11.5564, lng: 104.9282 },
  { id: 'm5', name: '정누가', alias: '친절한수달', country: '베트남', region: '아시아', prayerPoints: '가정 교회 지도자 양성 교육', lat: 21.0285, lng: 105.8542 },
  { id: 'm6', name: '오모세', alias: '바른펭귄', country: '베트남', region: '아시아', prayerPoints: '남부 지역 의료 봉사 및 제자훈련', lat: 10.8231, lng: 106.6297 },
  { id: 'm7', name: '한브리지', alias: '맑은돌고래', country: '미얀마', region: '아시아', prayerPoints: '난민 구호 및 어린이 급식 사역', lat: 19.7633, lng: 96.0785 },
  { id: 'm8', name: '배아브라함', alias: '든든한코알라', country: '케냐', region: '아프리카', prayerPoints: '마사이족 마을 우물 파기 사업', lat: -1.2921, lng: 36.8219 },
  { id: 'm9', name: '홍필립', alias: '재주넘는팬더', country: '페루', region: '아메리카', prayerPoints: '아마존 부족 마을 성경 번역 사역', lat: -12.0464, lng: -77.0428 },
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
  const [missionaries, setMissionaries] = useState<MissionaryData[]>(INITIAL_MISSIONARIES);
  const [selectedMissionary, setSelectedMissionary] = useState<MissionaryData>(INITIAL_MISSIONARIES[0]);
  
  // 🌟 관리자 모드 여부 상태 (true일 때 실명 및 관리 버튼 노출)
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);

  // 대륙별 아코디언 토글 상태
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
    prayerPoints: '',
    lat: 13.7563,
    lng: 100.5018,
  });

  useEffect(() => {
    const fetchFirestoreData = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "missionaries"));
        const firebaseData: MissionaryData[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          firebaseData.push({ 
            id: doc.id, 
            name: data.name || '',
            alias: data.alias || getRandomName(), // 가명이 없으면 동물 이름 자동 부여
            country: data.country || '기타',
            region: data.region || '기타',
            prayerPoints: data.prayerPoints || '',
            lat: data.lat || 0,
            lng: data.lng || 0
          });
        });
        if (firebaseData.length > 0) {
          setMissionaries([...INITIAL_MISSIONARIES, ...firebaseData]);
        }
      } catch (error) {
        console.error("Firestore 데이터 로딩 실패:", error);
      }
    };
    fetchFirestoreData();
  }, []);

  const regions = ['전체', '아시아', '아프리카', '아메리카', '유럽', '오세아니아', '기타'];

  const allExistingCountries = Array.from(new Set(missionaries.map(m => m.country)));

  const availableCountries = selectedRegion === '전체'
    ? allExistingCountries
    : Array.from(new Set(missionaries.filter(m => m.region === selectedRegion).map(m => m.country)));

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
      const target = missionaries.find(m => m.country === country);
      if (target) {
        setMapView({ center: [target.lat, target.lng], zoom: 6 });
      }
    }
  };

  const filteredMissionaries = missionaries.filter((item) => {
    const matchesRegion = selectedRegion === '전체' || item.region === selectedRegion;
    const matchesCountry = selectedCountryFilter === '전체' || item.country === selectedCountryFilter;
    return matchesRegion && matchesCountry;
  });

  const totalMissionariesCount = missionaries.length;

  const countryStatsMap = missionaries.reduce((acc, curr) => {
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
    const mInContinent = missionaries.filter(i => i.region === continent);
    const count = mInContinent.length;
    const percent = totalMissionariesCount > 0 ? Math.round((count / totalMissionariesCount) * 100) : 0;
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

  // 🌟 인증 요청 (추가 또는 수정용)
  const requestAuth = (action: 'add' | 'edit') => {
    setPendingAction(action);
    setPasswordInput('');
    setIsAuthModalOpen(true);
  };

  // 🌟 관리자 모드 토글 (버튼을 따로 두거나 타이틀 클릭 등으로 진입할 때 활용 가능)
  const requestAdminModeToggle = () => {
    if (isAdminMode) {
      setIsAdminMode(false);
      alert('관리자 모드가 해제되었습니다.');
    } else {
      setPendingAction(null); // 일반 관리 모드 진입
      setPasswordInput('');
      setIsAuthModalOpen(true);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '123456') {
      setIsAuthModalOpen(false);
      setIsAdminMode(true); // 인증 성공 시 관리자 모드 활성화

      if (pendingAction === 'add') {
        openAddModalDirect();
      } else if (pendingAction === 'edit' && selectedMissionary) {
        openEditModalDirect(selectedMissionary);
      } else {
        alert('관리자 권한이 확인되었습니다. 이제 실명 및 관리 메뉴가 표시됩니다.');
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
      alias: getRandomName(), // 기본값으로 랜덤 동물 가명 자동 세팅
      country: initialCountry,
      isCustomCountry: false,
      region: selectedRegion !== '전체' ? (selectedRegion as any) : '아시아',
      prayerPoints: '',
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
      alias: missionary.alias || getRandomName(),
      country: missionary.country,
      isCustomCountry: !isExisting,
      region: missionary.region,
      prayerPoints: missionary.prayerPoints,
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

    // 가명이 비어있으면 랜덤 동물 이름 자동 지정
    const finalAlias = formData.alias.trim() ? formData.alias.trim() : getRandomName();

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
            prayerPoints: formData.prayerPoints,
            lat: Number(formData.lat),
            lng: Number(formData.lng),
          });
          setMissionaries(prev => prev.map(item => item.id === currentId ? { id: currentId, ...formData, alias: finalAlias } : item));
          if (selectedMissionary.id === currentId) {
            setSelectedMissionary({ id: currentId, ...formData, alias: finalAlias });
          }
        }
        alert('선교사 정보가 성공적으로 수정되었습니다!');
      } else {
        const docRef = await addDoc(collection(db, "missionaries"), {
          name: formData.name,
          alias: finalAlias,
          country: formData.country,
          region: formData.region,
          prayerPoints: formData.prayerPoints,
          lat: Number(formData.lat),
          lng: Number(formData.lng),
        });

        const newItem: MissionaryData = {
          id: docRef.id,
          name: formData.name,
          alias: finalAlias,
          country: formData.country,
          region: formData.region,
          prayerPoints: formData.prayerPoints,
          lat: formData.lat,
          lng: formData.lng,
        };
        setMissionaries(prev => [...prev, newItem]);
        setSelectedMissionary(newItem);
        alert('새로운 선교사가 추가되었습니다!');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("저장 실패:", error);
      alert('처리 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!currentId) return;
    if (!window.confirm(`정말 선교사 정보를 삭제하시겠습니까?`)) return;

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

  // 🌟 렌더링용 이름 표시 헬퍼 함수 (평소엔 가명만, 관리자 모드면 '실명 (가명)')
  const formatMissionaryName = (item: MissionaryData) => {
    const currentAlias = item.alias || getRandomName();
    if (isAdminMode) {
      return `${item.name || '무명'} (${currentAlias})`;
    }
    return currentAlias;
  };

  return (
    <div className="mission-map-container">
      {/* 상단 통계 카드 및 관리자 모드 진입 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-0.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {isAdminMode ? '🔓 관리자 모드 활성화됨' : '🔒 일반 사용자 모드 (프라이버시 보호 중)'}
        </div>
        <button 
          onClick={requestAdminModeToggle}
          style={{ background: 'none', border: 'none', fontSize: '0.7rem', color: 'var(--accent-earth)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }}
        >
          {isAdminMode ? '관리자 모드 잠금' : '관리자 암호 입력'}
        </button>
      </div>

      <div className="stats-summary-grid">
        <div className="stat-card">
          <div className="stat-label">파송 국가</div>
          <div className="stat-value">{countryStatsList.length}<span className="stat-unit">개국</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">전체 선교사</div>
          <div className="stat-value">{totalMissionariesCount}<span className="stat-unit">명</span></div>
        </div>
      </div>

      {/* 세계 지도 카드 */}
      <div className="world-map-card">
        <div className="map-section-header">
          <div className="map-title">
            🌐 세계 선교 현황 지도 (개인별 핀 분포)
          </div>
          {/* 🌟 관리자 모드일 때만 '+ 추가' 버튼 노출 */}
          {isAdminMode && (
            <button className="add-country-btn" onClick={() => requestAuth('add')}>
              + 추가
            </button>
          )}
        </div>

        {/* 대륙 필터 */}
        <div className="region-filter-bar">
          {regions.map((reg) => (
            <button
              key={reg}
              className={`filter-chip ${selectedRegion === reg ? 'active' : ''}`}
              onClick={() => handleRegionChange(reg)}
            >
              {reg}
            </button>
          ))}
        </div>

        {/* 국가별 세부 필터 */}
        <div className="region-filter-bar" style={{ marginTop: '-0.3rem' }}>
          <button
            className={`filter-chip-sub ${selectedCountryFilter === '전체' ? 'active' : ''}`}
            onClick={() => handleCountryFilterChange('전체')}
          >
            전체 국가 보기
          </button>
          {availableCountries.map((countryName) => (
            <button
              key={countryName}
              className={`filter-chip-sub ${selectedCountryFilter === countryName ? 'active' : ''}`}
              onClick={() => handleCountryFilterChange(countryName)}
            >
              {countryName} ({missionaries.filter(m => m.country === countryName).length}명)
            </button>
          ))}
        </div>

        <div className="leaflet-map-container">
          <MapContainer center={mapView.center} zoom={mapView.zoom} style={{ height: '100%', width: '100%', borderRadius: '0.875rem' }} scrollWheelZoom={true}>
            <ChangeMapView center={mapView.center} zoom={mapView.zoom} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filteredMissionaries.map((item) => (
              <Marker
                key={item.id}
                position={[item.lat, item.lng]}
                eventHandlers={{
                  click: () => handleMissionarySelect(item),
                }}
              >
                <Popup>
                  <strong>{formatMissionaryName(item)}</strong> ({item.country})<br />
                  {item.prayerPoints}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {selectedMissionary && (
          <div className="mission-detail-card">
            <div className="detail-top-row">
              <div className="detail-country-title">
                👤 {formatMissionaryName(selectedMissionary)} ({selectedMissionary.country})
              </div>
              <div className="detail-header-actions">
                <span className="detail-badge">{selectedMissionary.region}</span>
                {/* 🌟 관리자 모드일 때만 '수정 / 관리' 버튼 노출 */}
                {isAdminMode && (
                  <button className="action-btn-sm" onClick={() => requestAuth('edit')}>수정 / 관리</button>
                )}
              </div>
            </div>

            <div className="prayer-box">
              <span className="metric-label">기도제목 / 사역</span>
              <p className="metric-content">{selectedMissionary.prayerPoints}</p>
            </div>
          </div>
        )}
      </div>

      {/* 대륙별 및 국가별 합계 통계 카드 */}
      <div className="chart-card">
        <div className="map-title">
          📊 대륙별 및 국가별 선교사 분포 현황 (터치하여 펼치기)
        </div>
        <div className="chart-list">
          {computedContinentStats.map((stat) => {
            const isExpanded = !!expandedContinents[stat.name];
            return (
              <div key={stat.name} className="chart-item">
                <div 
                  className="chart-label-row continent-accordion-header" 
                  onClick={() => toggleContinentAccordion(stat.name)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.75rem', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                    {stat.name}
                  </span>
                  <span>총 <strong>{stat.count}명</strong> ({stat.percent}%)</span>
                </div>

                <div className="chart-bar-bg">
                  <div
                    className="chart-bar-fill"
                    style={{ width: `${stat.percent}%` }}
                  />
                </div>

                {isExpanded && stat.countries.length > 0 ? (
                  <div className="continent-countries-list">
                    {stat.countries.map((c) => {
                      const countryPercent = totalMissionariesCount > 0 ? Math.round((c.count / totalMissionariesCount) * 100) : 0;
                      return (
                        <div key={c.country} className="country-group-card">
                          <div className="country-group-header">
                            <span className="country-name-bold">📍 {c.country}</span>
                            <span className="country-chip-count">{c.count}명 ({countryPercent}%)</span>
                          </div>
                          
                          <div className="chart-bar-bg" style={{ height: '0.35rem', margin: '0.15rem 0 0.3rem 0' }}>
                            <div
                              className="chart-bar-fill"
                              style={{ width: `${countryPercent}%`, background: 'linear-gradient(90deg, #9e522b 0%, #bd734c 100%)' }}
                            />
                          </div>

                          <div className="country-missionaries-names">
                            {c.missionaries.map((m) => (
                              <span 
                                key={m.id} 
                                className="missionary-name-tag"
                                onClick={() => handleMissionarySelect(m)}
                              >
                                {formatMissionaryName(m)}
                              </span>
                            ))}
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
          <div className="modal-content" style={{ maxWidth: '340px' }}>
            <div className="modal-header">
              <span>관리자 암호 확인</span>
              <button className="modal-close-btn" onClick={() => setIsAuthModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label>관리자 암호를 입력하세요 (123456)</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="비밀번호"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel-btn" onClick={() => setIsAuthModalOpen(false)}>취소</button>
                <button type="submit" className="modal-submit-btn">확인</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 선교사 추가 및 수정 모달 */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span>{isEditing ? '선교사 정보 수정 및 삭제' : '새로운 선교사 추가'}</span>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="form-group">
                  <label>선교사 실명 (관리자 전용)</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="예: 홍길동"
                  />
                </div>
                
                {/* 🌟 가명 입력 항목 (비워두면 랜덤 동물 이름 자동 부여) */}
                <div className="form-group">
                  <label>가명 (공백시 랜덤 동물)</label>
                  <input
                    type="text"
                    value={formData.alias}
                    onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                    placeholder="예: 푸른사자 (선택사항)"
                  />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>파송 국가</label>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--accent-earth, #9e522b)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    onClick={() => setFormData({ ...formData, isCustomCountry: !formData.isCustomCountry, country: '' })}
                  >
                    {formData.isCustomCountry ? '목록에서 선택하기' : '+ 새로운 국가 직접 입력'}
                  </button>
                </div>

                {formData.isCustomCountry ? (
                  <input
                    type="text"
                    required
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="예: 영국"
                  />
                ) : (
                  <select
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  >
                    {allExistingCountries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label>대륙 선택</label>
                <select
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value as any })}
                >
                  <option value="아시아">아시아</option>
                  <option value="아프리카">아프리카</option>
                  <option value="아메리카">아메리카</option>
                  <option value="유럽">유럽</option>
                  <option value="오세아니아">오세아니아</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              <div className="form-group">
                <label>위치 지정 (미니 지도를 클릭해 정확한 사역지 위치를 찍어보세요)</label>
                <div style={{ width: '100%', height: '150px', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
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
                <div className="form-group">
                  <label>위도 (Lat)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>경도 (Lng)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.lng}
                    onChange={(e) => setFormData({ ...formData, lng: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>주요 기도제목 / 사역 내용</label>
                <textarea
                  rows={2}
                  required
                  value={formData.prayerPoints}
                  onChange={(e) => setFormData({ ...formData, prayerPoints: e.target.value })}
                  placeholder="기도제목을 입력하세요"
                />
              </div>

              <div className="modal-actions">
                {isEditing && (
                  <button type="button" className="modal-delete-btn" onClick={handleDelete}>
                    삭제
                  </button>
                )}
                <button type="button" className="modal-cancel-btn" onClick={() => setIsModalOpen(false)}>취소</button>
                <button type="submit" className="modal-submit-btn">{isEditing ? '수정 완료' : '저장하기'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};