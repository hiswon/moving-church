import React, { useState, useEffect, useMemo } from 'react'
import './App.css'
import { db } from './firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import bgImage from './assets/2.jpg'

// 국가 목록
export const ACTIVE_COUNTRIES = ['태국', '캄보디아', '미얀마', '방글라데시'] as const
export const PLANNED_COUNTRIES = ['인도네시아', '베트남'] as const
export const ALL_COUNTRIES = [...ACTIVE_COUNTRIES, ...PLANNED_COUNTRIES, '한국']

export type CountryType = typeof ALL_COUNTRIES[number]

// Hope 레벨 정의 (5 ~ 1점)
export const HOPE_LEVELS: Record<number, { title: string; desc: string }> = {
  5: { title: 'Hope 5', desc: '예배를 잘 드림' },
  4: { title: 'Hope 4', desc: '드린적 있지만 요즘 잘 안드림' },
  3: { title: 'Hope 3', desc: '한번씩은 만날 수 있음' },
  2: { title: 'Hope 2', desc: '예배/만남 소망 있음' },
  1: { title: 'Hope 1', desc: '만났지만 다음에 만날 가망성 별로 없음' }
}

export interface Member {
  id: string
  name: string
  country: CountryType
  hopeLevel: number
  age: number
  birthday: string
  address: string
  familyStatus: string
  faithStatus: string // 불교, 힌두교, 기독교 등
  visitationChecked: boolean // 심방예배 참석 여부
  regularChecked: boolean // 정시예배 참석 여부
  createdAt: string
}

export interface VisitationRecord {
  id: string
  memberId: string
  memberName: string
  weekNumber: string // YYYY-Www
  visitedAt: string // YYYY-MM-DD HH:mm
  title: string // 말씀 제목
  notes: string // 특이사항
  timestamp: number
}

export interface RegularWorshipRecord {
  id: string
  weekNumber: string // YYYY-Www
  date: string // YYYY-MM-DD
  attendeeIds: string[] // 참석 교인 ID 목록
  sermonTitle: string
  notes: string
  timestamp: number
}

export interface Sermon {
  id: string
  authorId: string // won 또는 wha
  title: string
  scripture: string // 성경 구절
  content: string // 말씀 본문
  date: string // YYYY-MM-DD
  createdAt: string
}

export interface IntroData {
  churchIntro: string
  worshipSchedule: string
}

const HEADER_BG = bgImage

// 주차 계산 함수 (YYYY-Www)
function getWeekString(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'intro' | 'members' | 'visitation' | 'regular' | 'sermons'>('intro')

  // 파이어베이스 데이터 상태
  const [adminUser, setAdminUser] = useState<'won' | 'wha' | null>(() => {
    const saved = sessionStorage.getItem('church_admin_user')
    return (saved === 'won' || saved === 'wha') ? saved : null
  })

  const [introData, setIntroData] = useState<IntroData>({
    churchIntro: '외국인 교회에 오신 것을 환영합니다.\n태국, 캄보디아, 미얀마, 방글라데시, 인도네시아, 베트남 등 열방이 함께 예배합니다.',
    worshipSchedule: '주일 정시예배: 매주 일요일 오전 11:00\n평일 주중 심방예배: 각 가전 및 모임장소 (주별 방문)'
  })

  const [members, setMembers] = useState<Member[]>([])
  const [visitations, setVisitations] = useState<VisitationRecord[]>([])
  const [regularWorships, setRegularWorships] = useState<RegularWorshipRecord[]>([])
  const [sermons, setSermons] = useState<Sermon[]>([])

  // 모달 및 입력 폼 상태
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false)
  const [loginId, setLoginId] = useState('')
  const [loginPw, setLoginPw] = useState('')

  // 교인등록 폼
  const [selectedCountryTab, setSelectedCountryTab] = useState<CountryType>('태국')
  const [newMember, setNewMember] = useState<Omit<Member, 'id' | 'createdAt'>>({
    name: '',
    country: '태국',
    hopeLevel: 5,
    age: 0,
    birthday: '',
    address: '',
    familyStatus: '',
    faithStatus: '불교',
    visitationChecked: false,
    regularChecked: false
  })

  // 교인 수정 모달
  const [editingMember, setEditingMember] = useState<Member | null>(null)

  // 심방 체크 수정 모달
  const [editingVisRec, setEditingVisRec] = useState<VisitationRecord | null>(null)

  // 말씀 작성 / 수정
  const [sermonTitle, setSermonTitle] = useState('')
  const [sermonScripture, setSermonScripture] = useState('')
  const [sermonContent, setSermonContent] = useState('')
  const [editingSermon, setEditingSermon] = useState<Sermon | null>(null)

  // 소개 수정 폼
  const [editIntro, setEditIntro] = useState(introData)

  // 세션 유지
  useEffect(() => {
    if (adminUser) sessionStorage.setItem('church_admin_user', adminUser)
    else sessionStorage.removeItem('church_admin_user')
  }, [adminUser])

  // Firebase Firestore 데이터 로드
  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, 'church', 'app_data')
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const fetched = docSnap.data() as any
          if (fetched.introData) {
            setIntroData(fetched.introData)
            setEditIntro(fetched.introData)
          }
          if (fetched.members) setMembers(fetched.members)
          if (fetched.visitations) setVisitations(fetched.visitations)
          if (fetched.regularWorships) setRegularWorships(fetched.regularWorships)
          if (fetched.sermons) setSermons(fetched.sermons)
        }
      } catch (e) {
        console.error('Firebase 로딩 실패:', e)
      }
    }
    fetchData()
  }, [])

  // Firebase 저장 함수
  const saveDataToFirebase = async (
    iData = introData,
    mList = members,
    vList = visitations,
    rList = regularWorships,
    sList = sermons
  ) => {
    try {
      await setDoc(doc(db, 'church', 'app_data'), {
        introData: iData,
        members: mList,
        visitations: vList,
        regularWorships: rList,
        sermons: sList
      })
    } catch (e) {
      console.error('Firebase 저장 실패:', e)
    }
  }

  // 로그인 핸들러
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (loginId === 'won' && loginPw === '12345') {
      setAdminUser('won')
      setShowLoginModal(false)
      alert('won 관리자님 환영합니다.')
    } else if (loginId === 'wha' && loginPw === '67890') {
      setAdminUser('wha')
      setShowLoginModal(false)
      alert('wha 관리자님 환영합니다.')
    } else {
      alert('관리자 아이디 또는 비밀번호가 잘못되었습니다.')
    }
    setLoginId(''); setLoginPw('')
  }

  // 1. 교인 등록
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMember.name.trim()) {
      alert('이름을 입력해주세요.')
      return
    }

    const member: Member = {
      ...newMember,
      id: Date.now().toString(),
      country: selectedCountryTab,
      createdAt: new Date().toISOString().split('T')[0]
    }

    const updated = [member, ...members]
    setMembers(updated)
    setNewMember({
      name: '',
      country: selectedCountryTab,
      hopeLevel: 5,
      age: 0,
      birthday: '',
      address: '',
      familyStatus: '',
      faithStatus: '불교',
      visitationChecked: false,
      regularChecked: false
    })

    await saveDataToFirebase(introData, updated, visitations, regularWorships, sermons)
    alert('교인 명부에 등록되었습니다.')
  }

  // 교인 정보 수정
  const handleUpdateMember = async () => {
    if (!editingMember) return
    const updated = members.map(m => m.id === editingMember.id ? editingMember : m)
    setMembers(updated)
    setEditingMember(null)
    await saveDataToFirebase(introData, updated, visitations, regularWorships, sermons)
    alert('교인 정보가 수정되었습니다.')
  }

  // 교인 삭제
  const handleDeleteMember = async (id: string, name: string) => {
    if (window.confirm(`[${name}] 교인을 삭제하시겠습니까? 관련된 심방 내역도 유지/삭제 됩니다.`)) {
      const updated = members.filter(m => m.id !== id)
      setMembers(updated)
      await saveDataToFirebase(introData, updated, visitations, regularWorships, sermons)
    }
  }

  // 2. 심방예배 빠른 참석 체크/기록
  const handleToggleVisitation = async (member: Member) => {
    const currentWeek = getWeekString()
    const now = new Date()
    const formattedNow = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const isAlreadyChecked = member.visitationChecked

    // 교인 상태 업데이트
    const updatedMembers = members.map(m =>
      m.id === member.id ? { ...m, visitationChecked: !isAlreadyChecked } : m
    )
    setMembers(updatedMembers)

    let updatedVisitations = [...visitations]

    if (!isAlreadyChecked) {
      // 심방 기록 새로 생성
      const newRec: VisitationRecord = {
        id: Date.now().toString(),
        memberId: member.id,
        memberName: member.name,
        weekNumber: currentWeek,
        visitedAt: formattedNow,
        title: '가정 심방 예배',
        notes: '',
        timestamp: now.getTime()
      }
      updatedVisitations = [newRec, ...updatedVisitations]
    }

    setVisitations(updatedVisitations)
    await saveDataToFirebase(introData, updatedMembers, updatedVisitations, regularWorships, sermons)
  }

  // 심방 기록 상세 내용/시간 수정
  const handleSaveVisRecordEdit = async () => {
    if (!editingVisRec) return
    const updated = visitations.map(v => v.id === editingVisRec.id ? editingVisRec : v)
    setVisitations(updated)
    setEditingVisRec(null)
    await saveDataToFirebase(introData, members, updated, regularWorships, sermons)
    alert('심방 기록이 수정되었습니다.')
  }

  // 심방 기록 삭제
  const handleDeleteVisRecord = async (recId: string) => {
    if (window.confirm('이 심방 내역을 삭제하시겠습니까?')) {
      const updated = visitations.filter(v => v.id !== recId)
      setVisitations(updated)
      await saveDataToFirebase(introData, members, updated, regularWorships, sermons)
    }
  }

  // 3. 정시예배 참석 체크
  const handleToggleRegularCheck = async (memberId: string) => {
    const updatedMembers = members.map(m =>
      m.id === memberId ? { ...m, regularChecked: !m.regularChecked } : m
    )
    setMembers(updatedMembers)
    await saveDataToFirebase(introData, updatedMembers, visitations, regularWorships, sermons)
  }

  // 주일 정시예배 일괄 저장
  const handleSaveRegularWorship = async () => {
    const attendees = members.filter(m => m.regularChecked).map(m => m.id)
    if (attendees.length === 0) {
      alert('참석한 교인을 1명 이상 체크해주세요.')
      return
    }

    const sermon = prompt('오늘 드린 정시예배 말씀 제목을 입력하세요:', '주일 정시예배 말씀') || '주일 정시예배'
    const notes = prompt('특이사항 및 기도의 제목을 입력하세요:') || ''

    const newRec: RegularWorshipRecord = {
      id: Date.now().toString(),
      weekNumber: getWeekString(),
      date: new Date().toISOString().split('T')[0],
      attendeeIds: attendees,
      sermonTitle: sermon,
      notes: notes,
      timestamp: Date.now()
    }

    const updatedRegulars = [newRec, ...regularWorships]
    // 체크박스 초기화
    const resetMembers = members.map(m => ({ ...m, regularChecked: false }))

    setRegularWorships(updatedRegulars)
    setMembers(resetMembers)
    await saveDataToFirebase(introData, resetMembers, visitations, updatedRegulars, sermons)
    alert('정시예배 기록이 성공적으로 저장되었습니다.')
  }

  // 4. 말씀 저장 (Sermon)
  const handleSaveSermon = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminUser) return
    if (!sermonTitle.trim() || !sermonContent.trim()) {
      alert('말씀 제목과 내용을 입력해주세요.')
      return
    }

    const newSermon: Sermon = {
      id: Date.now().toString(),
      authorId: adminUser,
      title: sermonTitle.trim(),
      scripture: sermonScripture.trim(),
      content: sermonContent.trim(),
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }

    const updated = [newSermon, ...sermons]
    setSermons(updated)
    setSermonTitle(''); setSermonScripture(''); setSermonContent('')
    await saveDataToFirebase(introData, members, visitations, regularWorships, updated)
    alert('말씀이 등록되었습니다.')
  }

  // 말씀 수정
  const handleUpdateSermon = async () => {
    if (!editingSermon) return
    const updated = sermons.map(s => s.id === editingSermon.id ? editingSermon : s)
    setSermons(updated)
    setEditingSermon(null)
    await saveDataToFirebase(introData, members, visitations, regularWorships, updated)
    alert('말씀이 수정되었습니다.')
  }

  // 말씀 삭제
  const handleDeleteSermon = async (id: string) => {
    if (window.confirm('말씀을 삭제하시겠습니까?')) {
      const updated = sermons.filter(s => s.id !== id)
      setSermons(updated)
      await saveDataToFirebase(introData, members, visitations, regularWorships, updated)
    }
  }

  // 교회 소개 수정 저장
  const handleSaveIntro = async () => {
    setIntroData(editIntro)
    await saveDataToFirebase(editIntro, members, visitations, regularWorships, sermons)
    alert('교회 소개 및 예배 일정이 수정되었습니다.')
  }

  // 최근 4주간 심방 체크 빈도 계산 (심방 정렬용)
  const sortedMembersForVisitation = useMemo(() => {
    const counts: Record<string, number> = {}
    const now = Date.now()
    const fourWeeksMs = 28 * 24 * 60 * 60 * 1000

    visitations.forEach(v => {
      if (now - v.timestamp <= fourWeeksMs) {
        counts[v.memberId] = (counts[v.memberId] || 0) + 1
      }
    })

    return [...members].sort((a, b) => {
      const countA = counts[a.id] || 0
      const countB = counts[b.id] || 0
      return countB - countA // 최근 4주간 많이 체크된 사람 순서대로 나열
    })
  }, [members, visitations])

  // 통계 계산 (전체 / 최근 10주 / 최근 4주 / 전주)
  const calculateStats = (records: { timestamp: number }[]) => {
    const now = Date.now()
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000

    const total = records.length
    const last10Weeks = records.filter(r => now - r.timestamp <= 10 * oneWeekMs).length
    const last4Weeks = records.filter(r => now - r.timestamp <= 4 * oneWeekMs).length
    const lastWeek = records.filter(r => now - r.timestamp <= 1 * oneWeekMs).length

    return { total, last10Weeks, last4Weeks, lastWeek }
  }

  const visitationStats = useMemo(() => calculateStats(visitations), [visitations])
  const regularStats = useMemo(() => calculateStats(regularWorships), [regularWorships])

  return (
    <div className="app-container">
      {/* 헤더 */}
      <header className="app-header">
        <div className="header-banner" style={{ backgroundImage: `url(${HEADER_BG})` }}>
          <div className="banner-overlay">
            <span className="badge-neon">FOREIGN WORSHIP COMMUNITY</span>
            <h1>Moving Church People</h1>
            <p className="subtitle">태국 · 캄보디아 · 미얀마 · 방글라데시 · 인도네시아 · 베트남</p>
          </div>
        </div>

        <div className="admin-bar">
          {adminUser ? (
            <div className="user-info-bar">
              <span>🔑 관리자 접속 중: <strong>{adminUser}</strong></span>
              <button className="admin-btn logout" onClick={() => setAdminUser(null)}>로그아웃</button>
            </div>
          ) : (
            <button className="admin-btn" onClick={() => setShowLoginModal(true)}>🔑 관리자 로그인</button>
          )}
        </div>
      </header>

      {/* 관리자 로그인 모달 */}
      {showLoginModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>🔒 관리자 로그인</h3>
            <form onSubmit={handleLogin}>
              <input type="text" placeholder="관리자 ID (won 또는 wha)" value={loginId} onChange={e => setLoginId(e.target.value)} required />
              <input type="password" placeholder="비밀번호" value={loginPw} onChange={e => setLoginPw(e.target.value)} required />
              <div className="modal-buttons">
                <button type="submit" className="btn-confirm">로그인</button>
                <button type="button" className="btn-cancel" onClick={() => setShowLoginModal(false)}>취소</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 네비게이션 */}
      <nav className="app-nav">
        <button className={activeTab === 'intro' ? 'active' : ''} onClick={() => setActiveTab('intro')}>
          💒 교회소개 / 안내
        </button>
        {adminUser && (
          <>
            <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>
              📖 교인명부 ({members.length}명)
            </button>
            <button className={activeTab === 'visitation' ? 'active' : ''} onClick={() => setActiveTab('visitation')}>
              🏃‍♂️ 심방예배
            </button>
            <button className={activeTab === 'regular' ? 'active' : ''} onClick={() => setActiveTab('regular')}>
              ⛪ 정시예배
            </button>
            <button className={activeTab === 'sermons' ? 'active' : ''} onClick={() => setActiveTab('sermons')}>
              📜 말씀저장소
            </button>
          </>
        )}
      </nav>

      {/* 메인 콘텐츠 영역 */}
      <main>
        {/* 1. 교회소개 및 예배안내 (누구나 접근 가능) */}
        {activeTab === 'intro' && (
          <section className="tab-content text-left">
            <h2>💒 교회 소개 & 예배 일정 안내</h2>
            <div className="info-card">
              <h3>📖 교회 소개</h3>
              <p>{introData.churchIntro}</p>
            </div>
            <div className="info-card">
              <h3>⏰ 예배 일정</h3>
              <p>{introData.worshipSchedule}</p>
            </div>

            {adminUser && (
              <div className="form-box">
                <h3>✏️ [관리자] 교회소개 & 예배일정 수정 (Firebase 저장)</h3>
                <label className="checkbox-label mb-8">교회 소개 내용:</label>
                <textarea
                  className="input-full mb-12"
                  rows={4}
                  value={editIntro.churchIntro}
                  onChange={e => setEditIntro({ ...editIntro, churchIntro: e.target.value })}
                />
                <label className="checkbox-label mb-8">예배 일정 내용:</label>
                <textarea
                  className="input-full mb-12"
                  rows={3}
                  value={editIntro.worshipSchedule}
                  onChange={e => setEditIntro({ ...editIntro, worshipSchedule: e.target.value })}
                />
                <button className="btn-primary" onClick={handleSaveIntro}>💾 설정 수정 저장하기</button>
              </div>
            )}
          </section>
        )}

        {/* 2. 교인명부 (관리자 전용) */}
        {activeTab === 'members' && adminUser && (
          <section className="tab-content text-left">
            <h2>📖 전체 교인명부</h2>

            {/* 국가 선택 필터 */}
            <div className="filter-tags">
              {ALL_COUNTRIES.map(c => (
                <button
                  key={c}
                  className={selectedCountryTab === c ? 'active' : ''}
                  onClick={() => setSelectedCountryTab(c)}
                >
                  {c} ({members.filter(m => m.country === c).length})
                </button>
              ))}
            </div>

            {/* 교인 추가 폼 */}
            <div className="form-box">
              3. [{selectedCountryTab}] 교인 기입 등록
              <form onSubmit={handleAddMember} className="mt-8">
                <div className="form-grid">
                  <input
                    type="text"
                    placeholder="교인 이름"
                    value={newMember.name}
                    onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                    required
                  />
                  <select
                    value={newMember.hopeLevel}
                    onChange={e => setNewMember({ ...newMember, hopeLevel: Number(e.target.value) })}
                  >
                    {[5, 4, 3, 2, 1].map(lvl => (
                      <option key={lvl} value={lvl}>
                        Hope {lvl} ({HOPE_LEVELS[lvl].desc})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="나이"
                    value={newMember.age || ''}
                    onChange={e => setNewMember({ ...newMember, age: Number(e.target.value) })}
                  />
                  <input
                    type="text"
                    placeholder="생일 (예: 05-12)"
                    value={newMember.birthday}
                    onChange={e => setNewMember({ ...newMember, birthday: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="가족 현황"
                    value={newMember.familyStatus}
                    onChange={e => setNewMember({ ...newMember, familyStatus: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="신앙 현황 (예: 불교, 힌두교 등)"
                    value={newMember.faithStatus}
                    onChange={e => setNewMember({ ...newMember, faithStatus: e.target.value })}
                  />
                </div>
                <input
                  type="text"
                  placeholder="주소 (구글 맵 검색 가능한 주소)"
                  className="input-full mb-12"
                  value={newMember.address}
                  onChange={e => setNewMember({ ...newMember, address: e.target.value })}
                />
                <button type="submit" className="btn-primary">➕ [{selectedCountryTab}] 교인 등록하기</button>
              </form>
            </div>

            {/* 교인 리스트 */}
            <div className="member-list">
              {members.filter(m => m.country === selectedCountryTab).length === 0 ? (
                <p className="subtitle text-center">등록된 {selectedCountryTab} 교인이 없습니다.</p>
              ) : (
                members.filter(m => m.country === selectedCountryTab).map(m => (
                  <div key={m.id} className="member-card">
                    <div className="member-header">
                      <div>
                        <span className="member-name">{m.name}</span>
                        <span className="country-badge">{m.country}</span>
                        <span className={`hope-badge hope-${m.hopeLevel}`}>
                          {HOPE_LEVELS[m.hopeLevel].title}
                        </span>
                      </div>
                      <div>
                        <button className="btn-edit-sm" onClick={() => setEditingMember(m)}>수정</button>
                        <button className="btn-danger-sm" onClick={() => handleDeleteMember(m.id, m.name)}>삭제</button>
                      </div>
                    </div>

                    <div className="member-details">
                      <div>🎂 나이/생일: {m.age}세 / {m.birthday || '미입력'}</div>
                      <div>👨‍👩‍👧 가족: {m.familyStatus || '없음'}</div>
                      <div>🙏 신앙: {m.faithStatus}</div>
                      <div>
                        📍 주소: {m.address || '미입력'}
                        {m.address && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.address)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="map-link"
                          >
                            🗺️ Google 맵
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="checkbox-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={m.visitationChecked}
                          onChange={() => handleToggleVisitation(m)}
                        />
                        심방예배 참석
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={m.regularChecked}
                          onChange={() => handleToggleRegularCheck(m.id)}
                        />
                        정시예배 참석
                      </label>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 교인 수정 모달 */}
            {editingMember && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h3>✏️ 교인 정보 수정</h3>
                  <input
                    type="text"
                    value={editingMember.name}
                    onChange={e => setEditingMember({ ...editingMember, name: e.target.value })}
                  />
                  <select
                    value={editingMember.hopeLevel}
                    onChange={e => setEditingMember({ ...editingMember, hopeLevel: Number(e.target.value) })}
                  >
                    {[5, 4, 3, 2, 1].map(lvl => (
                      <option key={lvl} value={lvl}>Hope {lvl} - {HOPE_LEVELS[lvl].desc}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="주소"
                    value={editingMember.address}
                    onChange={e => setEditingMember({ ...editingMember, address: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="가족현황"
                    value={editingMember.familyStatus}
                    onChange={e => setEditingMember({ ...editingMember, familyStatus: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="신앙현황"
                    value={editingMember.faithStatus}
                    onChange={e => setEditingMember({ ...editingMember, faithStatus: e.target.value })}
                  />
                  <div className="modal-buttons">
                    <button className="btn-confirm" onClick={handleUpdateMember}>저장</button>
                    <button className="btn-cancel" onClick={() => setEditingMember(null)}>취소</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 3. 심방예배 (관리자 전용) */}
        {activeTab === 'visitation' && adminUser && (
          <section className="tab-content text-left">
            <h2>🏃‍♂️ 가정 심방예배 현황</h2>

            {/* 통계 요약 카드 */}
            <div className="stats-grid">
              <div className="stat-box">
                <span className="label">전체 심방</span>
                <span className="val">{visitationStats.total}회</span>
              </div>
              <div className="stat-box">
                <span className="label">최근 10주</span>
                <span className="val">{visitationStats.last10Weeks}회</span>
              </div>
              <div className="stat-box">
                <span className="label">최근 4주</span>
                <span className="val">{visitationStats.last4Weeks}회</span>
              </div>
              <div className="stat-box">
                <span className="label">전주 현황</span>
                <span className="val">{visitationStats.lastWeek}회</span>
              </div>
            </div>

            <p className="subtitle mb-12">
              💡 지난 4주 동안 가장 많이 방문/체크된 교인 순서대로 나열됩니다. 버튼을 누르면 즉시 체크 시간 및 내역이 누적됩니다.
            </p>

            {/* 빠른 체크 교인 목록 */}
            <div className="visitation-list mb-24">
              {sortedMembersForVisitation.map(m => {
                const rec = visitations.find(v => v.memberId === m.id)
                return (
                  <div key={m.id} className="visitation-card">
                    <div className="visitation-header">
                      <div>
                        <strong>{m.name}</strong> ({m.country})
                        <span className={`hope-badge hope-${m.hopeLevel} ml-6`}>
                          Hope {m.hopeLevel}
                        </span>
                      </div>
                      <button
                        className={`btn-secondary ${m.visitationChecked ? 'completed' : ''}`}
                        onClick={() => handleToggleVisitation(m)}
                      >
                        {m.visitationChecked ? '✅ 심방 완료' : '🏃‍♂️ 심방 체크'}
                      </button>
                    </div>

                    {rec && (
                      <div className="visitation-record-box">
                        <div className="visitation-record-header">
                          <span>⏰ 마지막 심방: {rec.visitedAt}</span>
                          <div>
                            <button className="btn-edit-sm" onClick={() => setEditingVisRec(rec)}>수정</button>
                            <button className="btn-danger-sm" onClick={() => handleDeleteVisRecord(rec.id)}>삭제</button>
                          </div>
                        </div>
                        <div>📖 말씀: {rec.title}</div>
                        {rec.notes && <div>📝 특이사항: {rec.notes}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 심방 상세 수정 모달 */}
            {editingVisRec && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h3>✏️ 심방 기록 수정</h3>
                  <label className="checkbox-label">방문 시간:</label>
                  <input
                    type="text"
                    value={editingVisRec.visitedAt}
                    onChange={e => setEditingVisRec({ ...editingVisRec, visitedAt: e.target.value })}
                  />
                  <label className="checkbox-label">말씀 제목:</label>
                  <input
                    type="text"
                    value={editingVisRec.title}
                    onChange={e => setEditingVisRec({ ...editingVisRec, title: e.target.value })}
                  />
                  <label className="checkbox-label">특이사항:</label>
                  <input
                    type="text"
                    value={editingVisRec.notes}
                    onChange={e => setEditingVisRec({ ...editingVisRec, notes: e.target.value })}
                  />
                  <div className="modal-buttons">
                    <button className="btn-confirm" onClick={handleSaveVisRecordEdit}>저장</button>
                    <button className="btn-cancel" onClick={() => setEditingVisRec(null)}>취소</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 4. 정시예배 (관리자 전용) */}
        {activeTab === 'regular' && adminUser && (
          <section className="tab-content text-left">
            <h2>⛪ 주일 11시 정시예배</h2>

            {/* 정시예배 통계 카드 */}
            <div className="stats-grid">
              <div className="stat-box">
                <span className="label">전체 정시예배</span>
                <span className="val">{regularStats.total}회</span>
              </div>
              <div className="stat-box">
                <span className="label">최근 10주</span>
                <span className="val">{regularStats.last10Weeks}회</span>
              </div>
              <div className="stat-box">
                <span className="label">최근 4주</span>
                <span className="val">{regularStats.last4Weeks}회</span>
              </div>
              <div className="stat-box">
                <span className="label">전주 현황</span>
                <span className="val">{regularStats.lastWeek}회</span>
              </div>
            </div>

            <div className="form-box">
              <h3>📌 정시예배 참석자 체크 & 저장</h3>
              <div className="member-list mb-12">
                {members.map(m => (
                  <label key={m.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={m.regularChecked}
                      onChange={() => handleToggleRegularCheck(m.id)}
                    />
                    <strong>{m.name}</strong> ({m.country})
                  </label>
                ))}
              </div>
              <button className="btn-primary" onClick={handleSaveRegularWorship}>
                💾 오늘 정시예배 현황 및 말씀 누적 저장
              </button>
            </div>

            <h3>📜 정시예배 누적 내역</h3>
            <div className="sermon-list">
              {regularWorships.length === 0 ? (
                <p className="subtitle">저장된 정시예배 기록이 없습니다.</p>
              ) : (
                regularWorships.map(r => (
                  <div key={r.id} className="visitation-card">
                    <div className="visitation-header">
                      <strong>📅 {r.date} ({r.weekNumber})</strong>
                      <span className="country-badge">참석자 {r.attendeeIds.length}명</span>
                    </div>
                    <div>📖 말씀 제목: {r.sermonTitle}</div>
                    {r.notes && <div>📝 기타 상황: {r.notes}</div>}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* 5. 말씀 저장 (관리자 전용) */}
        {activeTab === 'sermons' && adminUser && (
          <section className="tab-content text-left">
            <h2>📜 말씀 저장소</h2>

            <div className="form-box">
              <h3>✍️ 새 말씀 작성 (작성자: {adminUser})</h3>
              <form onSubmit={handleSaveSermon}>
                <input
                  type="text"
                  placeholder="말씀 제목"
                  className="input-full mb-8"
                  value={sermonTitle}
                  onChange={e => setSermonTitle(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="성경 구절 (예: 요한복음 3장 16절)"
                  className="input-full mb-8"
                  value={sermonScripture}
                  onChange={e => setSermonScripture(e.target.value)}
                />
                <textarea
                  placeholder="말씀 요약 및 본문 내용을 적어주세요..."
                  className="input-full mb-12"
                  rows={5}
                  value={sermonContent}
                  onChange={e => setSermonContent(e.target.value)}
                  required
                />
                <button type="submit" className="btn-primary">📌 말씀 저장하기</button>
              </form>
            </div>

            <div className="sermon-list">
              {sermons.length === 0 ? (
                <p className="subtitle">저장된 말씀이 없습니다.</p>
              ) : (
                sermons.map(s => (
                  <article key={s.id} className="sermon-card">
                    <div className="sermon-header">
                      <div>
                        <h3>{s.title}</h3>
                        <span className="subtitle">작성자: {s.authorId} · {s.date} {s.createdAt}</span>
                      </div>
                      <div>
                        <button className="btn-edit-sm" onClick={() => setEditingSermon(s)}>수정</button>
                        <button className="btn-danger-sm" onClick={() => handleDeleteSermon(s.id)}>삭제</button>
                      </div>
                    </div>
                    {s.scripture && <p className="text-left" style={{ color: '#38bdf8', fontWeight: 'bold' }}>📖 {s.scripture}</p>}
                    <p style={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>{s.content}</p>
                  </article>
                ))
              )}
            </div>

            {/* 말씀 수정 모달 */}
            {editingSermon && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h3>✏️ 말씀 수정</h3>
                  <input
                    type="text"
                    value={editingSermon.title}
                    onChange={e => setEditingSermon({ ...editingSermon, title: e.target.value })}
                  />
                  <input
                    type="text"
                    value={editingSermon.scripture}
                    onChange={e => setEditingSermon({ ...editingSermon, scripture: e.target.value })}
                  />
                  <textarea
                    rows={5}
                    value={editingSermon.content}
                    onChange={e => setEditingSermon({ ...editingSermon, content: e.target.value })}
                  />
                  <div className="modal-buttons">
                    <button className="btn-confirm" onClick={handleUpdateSermon}>저장</button>
                    <button className="btn-cancel" onClick={() => setEditingSermon(null)}>취소</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p>© 2026 Foreign Worship Church Management. All rights reserved.</p>
      </footer>
    </div>
  )
}