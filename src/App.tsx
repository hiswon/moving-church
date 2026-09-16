import React, { useState, useEffect, useMemo } from 'react'
import './App.css'
import { db } from './firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

export const ACTIVE_COUNTRIES = ['태국', '캄보디아', '미얀마', '방글라데시'] as const
export const PLANNED_COUNTRIES = ['인도네시아', '베트남'] as const
export const ALL_COUNTRIES = [...ACTIVE_COUNTRIES, ...PLANNED_COUNTRIES, '한국']

export type CountryType = typeof ALL_COUNTRIES[number]

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
  faithStatus: string
  isVisitationTarget: boolean // 심방예배 대상자 여부
  isRegularTarget: boolean    // 정시예배 대상자 여부
  createdAt: string
}

export interface VisitationRecord {
  id: string
  memberId: string
  memberName: string
  weekKey: string        // YYYY-MM-W (예: 2026-08-W1)
  weekLabel: string      // 화면 표시용 (예: 8월 1주째)
  visitedAt: string      // 시간 포함 (예: 8/2[일] 14:30)
  title?: string
  notes?: string
  timestamp: number
}

export interface RegularWorshipRecord {
  id: string
  memberId: string
  memberName: string
  weekKey: string
  weekLabel: string
  timestamp: number
}

export interface Sermon {
  id: string
  authorId: string
  title: string
  scripture: string
  content: string
  date: string
  createdAt: string
}

export interface IntroData {
  churchIntro: string
  worshipSchedule: string
}

const HEADER_BG = 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=1200&auto=format&fit=crop'

// --- 날짜 & 주차 계산 유틸리티 ---
// 8월 첫째주 일요일 기준, 그 전 6일(월~토)을 같은 1주차로 계산
function getCustomWeekInfo(dateInput: Date = new Date()) {
  const d = new Date(dateInput)
  const day = d.getDay() // 0: 일, 1: 월 ... 6: 토
  
  // 주일(일요일)을 주 기준일로 설정 (월~토는 이번 주 일요일로 날짜를 맞춤)
  const sunday = new Date(d)
  const diffToSunday = day === 0 ? 0 : (7 - day)
  sunday.setDate(d.getDate() + diffToSunday)

  const year = sunday.getFullYear()
  const month = sunday.getMonth() + 1 // 1 ~ 12월
  const sundayDate = sunday.getDate()

  // 해당 월의 첫 번째 일요일 찾기
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const firstDayOfWeek = firstDayOfMonth.getDay()
  const firstSundayDate = firstDayOfWeek === 0 ? 1 : (7 - firstDayOfWeek + 1)

  // 몇 주차인지 산정 (첫 일요일 전 6일도 1주차에 포함)
  let weekNum = 1
  if (sundayDate > firstSundayDate) {
    weekNum = Math.floor((sundayDate - firstSundayDate) / 7) + 1
  }

  const weekKey = `${year}-${String(month).padStart(2, '0')}-W${weekNum}`
  const weekLabel = `${month}월 ${weekNum}주째`

  return { year, month, weekNum, weekKey, weekLabel, sunday }
}

// 요일 한글 표기
function getDayKorean(d: Date) {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return days[d.getDay()]
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'intro' | 'members' | 'visitation' | 'regular' | 'sermons'>('intro')

  const [adminUser, setAdminUser] = useState<'won' | 'wha' | null>(() => {
    const saved = sessionStorage.getItem('church_admin_user')
    return (saved === 'won' || saved === 'wha') ? saved : null
  })

  const [introData, setIntroData] = useState<IntroData>({
    churchIntro: '외국인 교회에 오신 것을 환영합니다.\n태국, 캄보디아, 미얀마, 방글라데시, 인도네시아, 베트남 교인이 함께 예배합니다.',
    worshipSchedule: '주일 정시예배: 매주 일요일 오전 11:00\n평일 심방예배: 각 가정 및 지정 모임장소'
  })

  const [members, setMembers] = useState<Member[]>([])
  const [visitations, setVisitations] = useState<VisitationRecord[]>([])
  const [regularRecords, setRegularRecords] = useState<RegularWorshipRecord[]>([])
  const [sermons, setSermons] = useState<Sermon[]>([])

  const [showLoginModal, setShowLoginModal] = useState<boolean>(false)
  const [loginId, setLoginId] = useState('')
  const [loginPw, setLoginPw] = useState('')

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
    isVisitationTarget: true,
    isRegularTarget: true
  })

  const [viewingMember, setViewingMember] = useState<Member | null>(null)
  const [editingMember, setEditingMember] = useState<Member | null>(null)

  // 말씀 폼
  const [sermonTitle, setSermonTitle] = useState('')
  const [sermonScripture, setSermonScripture] = useState('')
  const [sermonContent, setSermonContent] = useState('')
  // const [editingSermon, setEditingSermon] = useState<Sermon | null>(null)

  useEffect(() => {
    if (adminUser) sessionStorage.setItem('church_admin_user', adminUser)
    else sessionStorage.removeItem('church_admin_user')
  }, [adminUser])

  // 파이어베이스 로드
  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, 'church', 'app_data')
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const fetched = docSnap.data() as any
          if (fetched.introData) setIntroData(fetched.introData)
          if (fetched.members) setMembers(fetched.members)
          if (fetched.visitations) setVisitations(fetched.visitations)
          if (fetched.regularRecords) setRegularRecords(fetched.regularRecords)
          if (fetched.sermons) setSermons(fetched.sermons)
        }
      } catch (e) {
        console.error('Firebase 데이터 로딩 오류:', e)
      }
    }
    fetchData()
  }, [])

  const saveDataToFirebase = async (
    iData = introData,
    mList = members,
    vList = visitations,
    rList = regularRecords,
    sList = sermons
  ) => {
    try {
      await setDoc(doc(db, 'church', 'app_data'), {
        introData: iData,
        members: mList,
        visitations: vList,
        regularRecords: rList,
        sermons: sList
      })
    } catch (e) {
      console.error('Firebase 저장 실패:', e)
    }
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (loginId === 'won' && loginPw === '12345') {
      setAdminUser('won')
      setShowLoginModal(false)
    } else if (loginId === 'wha' && loginPw === '67890') {
      setAdminUser('wha')
      setShowLoginModal(false)
    } else {
      alert('아이디 또는 비밀번호가 잘못되었습니다.')
    }
    setLoginId(''); setLoginPw('')
  }

  // --- 개인별/전체 참석 통계 (최근10주 / 최근4주 / 지난주) ---
  const getMemberStats = (memberId: string, records: { memberId: string; timestamp: number }[]) => {
    const now = Date.now()
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    const myRecs = records.filter(r => r.memberId === memberId)

    const w10 = myRecs.filter(r => now - r.timestamp <= 10 * oneWeek).length
    const w4 = myRecs.filter(r => now - r.timestamp <= 4 * oneWeek).length
    const w1 = myRecs.filter(r => now - r.timestamp <= 1 * oneWeek).length

    return `${w10}/${w4}/${w1}`
  }

  const getTotalStats = (records: { timestamp: number }[]) => {
    const now = Date.now()
    const oneWeek = 7 * 24 * 60 * 60 * 1000

    const w10 = records.filter(r => now - r.timestamp <= 10 * oneWeek).length
    const w4 = records.filter(r => now - r.timestamp <= 4 * oneWeek).length
    const w1 = records.filter(r => now - r.timestamp <= 1 * oneWeek).length

    return `${w10}/${w4}/${w1}`
  }

  // --- 1. 교인 관리 ---
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMember.name.trim()) return

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
      isVisitationTarget: true,
      isRegularTarget: true
    })
    await saveDataToFirebase(introData, updated, visitations, regularRecords, sermons)
  }

  const handleUpdateMember = async () => {
    if (!editingMember) return
    const updated = members.map(m => m.id === editingMember.id ? editingMember : m)
    setMembers(updated)
    setViewingMember(editingMember)
    setEditingMember(null)
    await saveDataToFirebase(introData, updated, visitations, regularRecords, sermons)
  }

  const handleDeleteMember = async (id: string) => {
    if (window.confirm('정말 이 교인을 삭제하시겠습니까?')) {
      const updated = members.filter(m => m.id !== id)
      setMembers(updated)
      setViewingMember(null)
      await saveDataToFirebase(introData, updated, visitations, regularRecords, sermons)
    }
  }

  const handleToggleTarget = async (id: string, type: 'visitation' | 'regular') => {
    const updated = members.map(m => {
      if (m.id === id) {
        return type === 'visitation'
          ? { ...m, isVisitationTarget: !m.isVisitationTarget }
          : { ...m, isRegularTarget: !m.isRegularTarget }
      }
      return m
    })
    setMembers(updated)
    await saveDataToFirebase(introData, updated, visitations, regularRecords, sermons)
  }

  // --- 2. 심방예배 참석 토글 (버튼 클릭 시 이번 주 체크/취소) ---
  const handleToggleVisitationCheck = async (member: Member) => {
    const now = new Date()
    const { weekKey, weekLabel } = getCustomWeekInfo(now)

    // 이번 주에 이미 체크되었는지 확인
    const existingIndex = visitations.findIndex(
      v => v.memberId === member.id && v.weekKey === weekKey
    )

    let updatedVisitations = [...visitations]

    if (existingIndex !== -1) {
      // 이미 있으면 취소 (삭제)
      updatedVisitations.splice(existingIndex, 1)
    } else {
      // 없으면 추가 (날짜 및 시간 기록)
      const month = now.getMonth() + 1
      const date = now.getDate()
      const dayKorean = getDayKorean(now)
      const hours = String(now.getHours()).padStart(2, '0')
      const mins = String(now.getMinutes()).padStart(2, '0')
      const timeStr = `${month}/${date}[${dayKorean}] ${hours}:${mins}`

      const newRec: VisitationRecord = {
        id: Date.now().toString(),
        memberId: member.id,
        memberName: member.name,
        weekKey,
        weekLabel,
        visitedAt: timeStr,
        timestamp: now.getTime()
      }
      updatedVisitations.unshift(newRec)
    }

    setVisitations(updatedVisitations)
    await saveDataToFirebase(introData, members, updatedVisitations, regularRecords, sermons)
  }

  // --- 3. 정시예배 참석 토글 (시간 기록 없이 이름만 포함) ---
  const handleToggleRegularCheck = async (member: Member) => {
    const now = new Date()
    const { weekKey, weekLabel } = getCustomWeekInfo(now)

    const existingIndex = regularRecords.findIndex(
      r => r.memberId === member.id && r.weekKey === weekKey
    )

    let updatedRecords = [...regularRecords]

    if (existingIndex !== -1) {
      updatedRecords.splice(existingIndex, 1)
    } else {
      const newRec: RegularWorshipRecord = {
        id: Date.now().toString(),
        memberId: member.id,
        memberName: member.name,
        weekKey,
        weekLabel,
        timestamp: now.getTime()
      }
      updatedRecords.unshift(newRec)
    }

    setRegularRecords(updatedRecords)
    await saveDataToFirebase(introData, members, visitations, updatedRecords, sermons)
  }

  // --- 4. 말씀 저장 ---
  const handleSaveSermon = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminUser || !sermonTitle.trim()) return

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
    await saveDataToFirebase(introData, members, visitations, regularRecords, updated)
  }

  // 오늘 기준 현재 주차 정보
  const currentWeekInfo = useMemo(() => getCustomWeekInfo(new Date()), [])

  // 주별 그룹핑 데이터 (심방예배)
  const groupedVisitations = useMemo(() => {
    const map: Record<string, { weekLabel: string; records: VisitationRecord[] }> = {}
    visitations.forEach(v => {
      if (!map[v.weekKey]) {
        map[v.weekKey] = { weekLabel: v.weekLabel, records: [] }
      }
      map[v.weekKey].records.push(v)
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [visitations])

  // 주별 그룹핑 데이터 (정시예배)
  const groupedRegulars = useMemo(() => {
    const map: Record<string, { weekLabel: string; records: RegularWorshipRecord[] }> = {}
    regularRecords.forEach(r => {
      if (!map[r.weekKey]) {
        map[r.weekKey] = { weekLabel: r.weekLabel, records: [] }
      }
      map[r.weekKey].records.push(r)
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [regularRecords])

  return (
    <div className="app-container">
      {/* 헤더 */}
      <header className="app-header">
        <div className="header-banner" style={{ backgroundImage: `url(${HEADER_BG})` }}>
          <div className="banner-overlay">
            <span className="badge-neon">GLOBAL WORSHIP COMMUNITY</span>
            <h1>외국인 교인 관리 앱</h1>
            <p className="subtitle">태국 · 캄보디아 · 미얀마 · 방글라데시 · 인도네시아 · 베트남</p>
          </div>
        </div>

        <div className="admin-bar">
          {adminUser ? (
            <div className="user-info-bar">
              <span>🔑 관리자 접속: <strong>{adminUser}</strong></span>
              <button className="admin-btn logout" onClick={() => setAdminUser(null)}>로그아웃</button>
            </div>
          ) : (
            <button className="admin-btn" onClick={() => setShowLoginModal(true)}>🔑 관리자 로그인</button>
          )}
        </div>
      </header>

      {/* 로그인 모달 */}
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
          💒 교회소개/예배일정
        </button>
        {adminUser && (
          <>
            <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>
              📖 교인명부 ({members.length})
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

      <main>
        {/* 1. 교회소개 */}
        {activeTab === 'intro' && (
          <section className="tab-content text-left">
            <h2>💒 교회 소개 및 예배 일정</h2>
            <div className="info-card">
              <h3>📖 교회 소개</h3>
              <p>{introData.churchIntro}</p>
            </div>
            <div className="info-card">
              <h3>⏰ 예배 일정</h3>
              <p>{introData.worshipSchedule}</p>
            </div>
          </section>
        )}

        {/* 2. 교인명부 */}
        {activeTab === 'members' && adminUser && (
          <section className="tab-content text-left">
            <h2>📖 교인명부 (대상자 등록)</h2>
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

            <div className="form-box">
              <h3>➕ [{selectedCountryTab}] 교인 기입 등록</h3>
              <form onSubmit={handleAddMember}>
                <div className="form-grid">
                  <input type="text" placeholder="이름" value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} required />
                  <select value={newMember.hopeLevel} onChange={e => setNewMember({ ...newMember, hopeLevel: Number(e.target.value) })}>
                    {[5, 4, 3, 2, 1].map(lvl => (
                      <option key={lvl} value={lvl}>Hope {lvl} ({HOPE_LEVELS[lvl].desc})</option>
                    ))}
                  </select>
                  <input type="number" placeholder="나이" value={newMember.age || ''} onChange={e => setNewMember({ ...newMember, age: Number(e.target.value) })} />
                  <input type="text" placeholder="생일" value={newMember.birthday} onChange={e => setNewMember({ ...newMember, birthday: e.target.value })} />
                  <input type="text" placeholder="가족현황" value={newMember.familyStatus} onChange={e => setNewMember({ ...newMember, familyStatus: e.target.value })} />
                  <input type="text" placeholder="신앙현황(불교,힌두교)" value={newMember.faithStatus} onChange={e => setNewMember({ ...newMember, faithStatus: e.target.value })} />
                </div>
                <input type="text" placeholder="주소 (구글 맵 클릭용)" className="input-full mb-12" value={newMember.address} onChange={e => setNewMember({ ...newMember, address: e.target.value })} />
                <button type="submit" className="btn-primary">교인 등록</button>
              </form>
            </div>

            <div className="member-list">
              {members.filter(m => m.country === selectedCountryTab).map(m => (
                <div key={m.id} className="member-card">
                  <div className="member-header">
                    <div>
                      <strong className="member-name cursor-pointer" onClick={() => setViewingMember(m)}>
                        {m.name}
                      </strong>
                      <span className="country-badge">{m.country}</span>
                      <span className={`hope-badge hope-${m.hopeLevel}`}>{HOPE_LEVELS[m.hopeLevel].title}</span>
                    </div>
                    <div>
                      <button className="btn-edit-sm" onClick={() => setViewingMember(m)}>신상보기</button>
                    </div>
                  </div>

                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={m.isVisitationTarget} onChange={() => handleToggleTarget(m.id, 'visitation')} />
                      심방예배 대상자 등록
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={m.isRegularTarget} onChange={() => handleToggleTarget(m.id, 'regular')} />
                      정시예배 대상자 등록
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3. 심방예배 */}
        {activeTab === 'visitation' && adminUser && (
          <section className="tab-content text-left">
            <h2>🏃‍♂️ 심방예배 (주 1회 체크)</h2>

            <div className="info-card">
              <h3>📊 심방 전체 통계 (10주 / 4주 / 지난주)</h3>
              <p style={{ fontSize: '1.2rem', color: '#38bdf8', fontWeight: 'bold' }}>
                전체 누적: ({getTotalStats(visitations)})
              </p>
            </div>

            {/* 최상단: 이번 주차 및 대상 교인 이름 버튼 박스 */}
            <div className="form-box">
              <h3>📅 오늘 기준: {currentWeekInfo.weekLabel} 심방 참석 체크</h3>
              <p className="subtitle mb-12">이름 버튼을 클릭하면 이번 주 참석 명단에 추가/취소 토글됩니다.</p>
              
              <div className="filter-tags">
                {members.filter(m => m.isVisitationTarget).map(m => {
                  const isCheckedThisWeek = visitations.some(
                    v => v.memberId === m.id && v.weekKey === currentWeekInfo.weekKey
                  )
                  const stats = getMemberStats(m.id, visitations)

                  return (
                    <button
                      key={m.id}
                      className={isCheckedThisWeek ? 'active' : ''}
                      onClick={() => handleToggleVisitationCheck(m)}
                      style={{ padding: '8px 14px', fontSize: '0.88rem' }}
                    >
                      {isCheckedThisWeek ? '✅ ' : '➕ '}{m.name} ({stats})
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 하단: 주별 심방 리스트 */}
            <h3>📜 주별 심방 명단 리스트</h3>
            <div className="visitation-list">
              {groupedVisitations.length === 0 ? (
                <p className="subtitle">기록된 심방 내역이 없습니다.</p>
              ) : (
                groupedVisitations.map(([wKey, group]) => (
                  <div key={wKey} className="info-card">
                    <h4 style={{ color: '#38bdf8', borderBottom: '1px dashed #475569', paddingBottom: '6px', marginBottom: '8px' }}>
                      🗓️ {group.weekLabel} (총 {group.records.length}명)
                    </h4>
                    <div className="member-list">
                      {group.records.map(r => {
                        const m = members.find(mem => mem.id === r.memberId)
                        return (
                          <div key={r.id} className="visitation-record-box">
                            <div className="visitation-record-header">
                              <span
                                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={() => m && setViewingMember(m)}
                              >
                                👤 <strong>{r.memberName}</strong> ({r.visitedAt})
                              </span>
                              <button className="btn-danger-sm" onClick={() => {
                                const updated = visitations.filter(v => v.id !== r.id)
                                setVisitations(updated)
                                saveDataToFirebase(introData, members, updated, regularRecords, sermons)
                              }}>취소</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* 4. 주일 정시예배 */}
        {activeTab === 'regular' && adminUser && (
          <section className="tab-content text-left">
            <h2>⛪ 주일 정시예배 (주일 11시)</h2>

            <div className="info-card">
              <h3>📊 정시예배 전체 통계 (10주 / 4주 / 지난주)</h3>
              <p style={{ fontSize: '1.2rem', color: '#38bdf8', fontWeight: 'bold' }}>
                전체 누적: ({getTotalStats(regularRecords)})
              </p>
            </div>

            {/* 최상단: 버튼 박스 (토글) */}
            <div className="form-box">
              <h3>📅 오늘 기준: {currentWeekInfo.weekLabel} 정시예배 참석 체크</h3>
              <p className="subtitle mb-12">버튼을 눌러 참석자를 추가/취소하세요 (시간 표기 없이 이름만 기록).</p>
              
              <div className="filter-tags">
                {members.filter(m => m.isRegularTarget).map(m => {
                  const isCheckedThisWeek = regularRecords.some(
                    r => r.memberId === m.id && r.weekKey === currentWeekInfo.weekKey
                  )
                  const stats = getMemberStats(m.id, regularRecords)

                  return (
                    <button
                      key={m.id}
                      className={isCheckedThisWeek ? 'active' : ''}
                      onClick={() => handleToggleRegularCheck(m)}
                      style={{ padding: '8px 14px', fontSize: '0.88rem' }}
                    >
                      {isCheckedThisWeek ? '✅ ' : '➕ '}{m.name} ({stats})
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 주별 명단 리스트 (시간 없이 이름만 나열) */}
            <h3>📜 주별 정시예배 명단</h3>
            <div className="visitation-list">
              {groupedRegulars.length === 0 ? (
                <p className="subtitle">기록된 정시예배 내역이 없습니다.</p>
              ) : (
                groupedRegulars.map(([wKey, group]) => (
                  <div key={wKey} className="info-card">
                    <h4 style={{ color: '#38bdf8', borderBottom: '1px dashed #475569', paddingBottom: '6px', marginBottom: '8px' }}>
                      🗓️ {group.weekLabel} 참석자 ({group.records.length}명)
                    </h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {group.records.map(r => {
                        const m = members.find(mem => mem.id === r.memberId)
                        return (
                          <span
                            key={r.id}
                            className="country-badge"
                            style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '0.85rem' }}
                            onClick={() => m && setViewingMember(m)}
                          >
                            👤 {r.memberName}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* 5. 말씀 저장 */}
        {activeTab === 'sermons' && adminUser && (
          <section className="tab-content text-left">
            <h2>📜 말씀 저장소</h2>
            <div className="form-box">
              <h3>✍️ 말씀 작성 (작성자: {adminUser})</h3>
              <form onSubmit={handleSaveSermon}>
                <input type="text" placeholder="말씀 제목" className="input-full mb-8" value={sermonTitle} onChange={e => setSermonTitle(e.target.value)} required />
                <input type="text" placeholder="성경 구절" className="input-full mb-8" value={sermonScripture} onChange={e => setSermonScripture(e.target.value)} />
                <textarea placeholder="본문 내용 입력..." className="input-full mb-12" rows={5} value={sermonContent} onChange={e => setSermonContent(e.target.value)} required />
                <button type="submit" className="btn-primary">말씀 저장</button>
              </form>
            </div>

            <div className="sermon-list">
              {sermons.map(s => (
                <article key={s.id} className="sermon-card">
                  <div className="sermon-header">
                    <div>
                      <h3>{s.title}</h3>
                      <span className="subtitle">작성자: {s.authorId} · {s.date}</span>
                    </div>
                    <button className="btn-danger-sm" onClick={() => {
                      const updated = sermons.filter(item => item.id !== s.id)
                      setSermons(updated)
                      saveDataToFirebase(introData, members, visitations, regularRecords, updated)
                    }}>삭제</button>
                  </div>
                  {s.scripture && <p style={{ color: '#38bdf8', fontWeight: 'bold' }}>📖 {s.scripture}</p>}
                  <p style={{ whiteSpace: 'pre-wrap', marginTop: '6px' }}>{s.content}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 교인 신상 명세 확인 모달 (수정/삭제 가능) */}
      {viewingMember && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>👤 교인 신상명세서</h3>
            <div className="member-details mb-12" style={{ display: 'block', textAlign: 'left', lineHeight: '1.8' }}>
              <p><strong>이름:</strong> {viewingMember.name}</p>
              <p><strong>국적:</strong> {viewingMember.country}</p>
              <p><strong>Hope Level:</strong> Hope {viewingMember.hopeLevel} ({HOPE_LEVELS[viewingMember.hopeLevel].desc})</p>
              <p><strong>나이/생일:</strong> {viewingMember.age}세 / {viewingMember.birthday || '미입력'}</p>
              <p><strong>가족현황:</strong> {viewingMember.familyStatus || '없음'}</p>
              <p><strong>신앙현황:</strong> {viewingMember.faithStatus}</p>
              <p>
                <strong>주소:</strong> {viewingMember.address || '미입력'}
                {viewingMember.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(viewingMember.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="map-link"
                  >
                    🗺️ 구글 지도
                  </a>
                )}
              </p>
              <p><strong>심방 통계 (10주/4주/1주):</strong> {getMemberStats(viewingMember.id, visitations)}</p>
              <p><strong>정시예배 통계 (10주/4주/1주):</strong> {getMemberStats(viewingMember.id, regularRecords)}</p>
            </div>

            <div className="modal-buttons">
              <button className="btn-confirm" onClick={() => {
                setEditingMember(viewingMember)
                setViewingMember(null)
              }}>✏️ 정보 수정</button>
              <button className="btn-cancel" style={{ background: '#ef4444' }} onClick={() => handleDeleteMember(viewingMember.id)}>🗑️ 교인 삭제</button>
              <button className="btn-cancel" onClick={() => setViewingMember(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 교인 수정 모달 */}
      {editingMember && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>✏️ 교인 정보 수정</h3>
            <input type="text" value={editingMember.name} onChange={e => setEditingMember({ ...editingMember, name: e.target.value })} />
            <select value={editingMember.hopeLevel} onChange={e => setEditingMember({ ...editingMember, hopeLevel: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map(lvl => (
                <option key={lvl} value={lvl}>Hope {lvl} - {HOPE_LEVELS[lvl].desc}</option>
              ))}
            </select>
            <input type="number" value={editingMember.age} onChange={e => setEditingMember({ ...editingMember, age: Number(e.target.value) })} />
            <input type="text" value={editingMember.birthday} onChange={e => setEditingMember({ ...editingMember, birthday: e.target.value })} />
            <input type="text" value={editingMember.address} onChange={e => setEditingMember({ ...editingMember, address: e.target.value })} />
            <input type="text" value={editingMember.familyStatus} onChange={e => setEditingMember({ ...editingMember, familyStatus: e.target.value })} />
            <input type="text" value={editingMember.faithStatus} onChange={e => setEditingMember({ ...editingMember, faithStatus: e.target.value })} />
            <div className="modal-buttons">
              <button className="btn-confirm" onClick={handleUpdateMember}>저장</button>
              <button className="btn-cancel" onClick={() => setEditingMember(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>© 2026 Foreign Church Management System. All rights reserved.</p>
      </footer>
    </div>
  )
}