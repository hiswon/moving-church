import React, { useState, useEffect, useMemo } from 'react'
import './App.css'
import { db } from './firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import frontPic from './assets/1.jpg';

export const ACTIVE_COUNTRIES = ['태국', '캄보디아', '미얀마', '방글라데시'] as const
export const PLANNED_COUNTRIES = ['인도네시아', '베트남'] as const
export const ALL_COUNTRIES = [...ACTIVE_COUNTRIES, ...PLANNED_COUNTRIES, '한국']

export type CountryType = string

export const HOPE_LEVELS: Record<number, { title: string; desc: string }> = {
  5: { title: 'Hope 5', desc: '예배를 잘 드림' },
  4: { title: 'Hope 4', desc: '드린적 있지만 요즘 잘 안드림' },
  3: { title: 'Hope 3', desc: '한번씩은 만날 수 있음' },
  2: { title: 'Hope 2', desc: '예배/만남 소망 있음' },
  1: { title: 'Hope 1', desc: '만났지만 다음에 만날 가망성 별로 없음' }
}

export interface MemberNote {
  id: string
  author: string
  content: string
  createdAt: string
}

export interface Member {
  id: string
  name: string
  country: CountryType
  hopeLevel: number
  birthday?: string
  gifts?: string // 선물기입란
  phone?: string
  email?: string
  address?: string
  familyStatus?: string
  faithStatus?: string
  photoUrl?: string
  isVisitationTarget: boolean
  isRegularTarget: boolean
  notes?: MemberNote[]
  createdAt: string
}

export interface VisitationRecord {
  id: string
  memberId: string
  memberName: string
  weekKey: string
  weekLabel: string
  visitedAt: string
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

const HEADER_BG = frontPic

// 생일 입력값(1981,8,1 또는 81,8,1 또는 1981-08-01 등)으로 나이 자동 계산
function calculateAge(birthdayStr?: string): { age: number; formatted: string } | null {
  if (!birthdayStr || !birthdayStr.trim()) return null;

  const cleaned = birthdayStr.trim().replace(/[\.,\s\/-]+/g, '-');
  const parts = cleaned.split('-');

  if (parts.length < 3) return null;

  let year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  if (year < 100) {
    const currentYearShort = new Date().getFullYear() % 100;
    if (year <= currentYearShort) {
      year += 2000;
    } else {
      year += 1900;
    }
  }

  const today = new Date();
  const birthDate = new Date(year, month, day);

  if (isNaN(birthDate.getTime())) return null;

  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return { age: Math.max(0, age), formatted: `${year}.${month + 1}.${day}` };
}

function getCustomWeekInfo(dateInput: Date = new Date(), offsetWeeks: number = 0) {
  const d = new Date(dateInput)
  d.setDate(d.getDate() + offsetWeeks * 7)

  const day = d.getDay()
  const sunday = new Date(d)
  const diffToSunday = day === 0 ? 0 : (7 - day)
  sunday.setDate(d.getDate() + diffToSunday)

  const year = sunday.getFullYear()
  const month = sunday.getMonth() + 1
  const sundayDate = sunday.getDate()

  const firstDayOfMonth = new Date(year, month - 1, 1)
  const firstDayOfWeek = firstDayOfMonth.getDay()
  const firstSundayDate = firstDayOfWeek === 0 ? 1 : (7 - firstDayOfWeek + 1)

  let weekNum = 1
  if (sundayDate > firstSundayDate) {
    weekNum = Math.floor((sundayDate - firstSundayDate) / 7) + 1
  }

  const weekKey = `${year}-${String(month).padStart(2, '0')}-W${weekNum}`
  const weekLabel = `${year}년 ${month}월 ${weekNum}주`
  
  const sundayFormatted = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`

  return { year, month, weekNum, weekKey, weekLabel, sunday, sundayFormatted }
}

function getRecent5WeeksInfo(baseDate: Date = new Date()) {
  const weeks = []
  const labels = ['5주 전', '4주 전', '3주 전', '2주 전', '지난주']
  
  for (let i = 5; i >= 1; i--) {
    const info = getCustomWeekInfo(baseDate, -i)
    weeks.push({
      labelName: labels[5 - i],
      ...info
    })
  }
  return weeks
}

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

  const [visitationTargetDate, setVisitationTargetDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [regularTargetDate, setRegularTargetDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )

  const [expandedVisitationWeeks, setExpandedVisitationWeeks] = useState<Record<string, boolean>>({})
  const [expandedRegularWeeks, setExpandedRegularWeeks] = useState<Record<string, boolean>>({})

  const [selectedCountryTab, setSelectedCountryTab] = useState<string>('태국')
  const [showAddForm, setShowAddForm] = useState<boolean>(false)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [newNoteInput, setNewNoteInput] = useState<Record<string, string>>({})

  const [formCountry, setFormCountry] = useState<string>('태국')

  const [newMember, setNewMember] = useState({
    name: '',
    customCountry: '',
    hopeLevel: 5,
    birthday: '',
    gifts: '',
    phone: '',
    email: '',
    address: '',
    familyStatus: '',
    faithStatus: '',
    photoUrl: '',
    isVisitationTarget: true,
    isRegularTarget: true
  })

  const [editingMember, setEditingMember] = useState<Member | null>(null)

  const [sermonTitle, setSermonTitle] = useState('')
  const [sermonScripture, setSermonScripture] = useState('')
  const [sermonContent, setSermonContent] = useState('')
  const [editingSermon, setEditingSermon] = useState<Sermon | null>(null)

  useEffect(() => {
    if (adminUser) sessionStorage.setItem('church_admin_user', adminUser)
    else sessionStorage.removeItem('church_admin_user')
  }, [adminUser])

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
      const payload = JSON.parse(JSON.stringify({
        introData: iData,
        members: mList,
        visitations: vList,
        regularRecords: rList,
        sermons: sList
      }))
      await setDoc(doc(db, 'church', 'app_data'), payload)
    } catch (e) {
      console.error('Firebase 저장 상세 오류:', e)
      alert('데이터 저장 중 오류가 발생했습니다. 콘솔 창을 확인해주세요.')
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

  const getMember3WeekStats = (memberId: string, records: { memberId: string; weekKey: string }[]) => {
    const recent3 = [
      getCustomWeekInfo(new Date(), -3),
      getCustomWeekInfo(new Date(), -2),
      getCustomWeekInfo(new Date(), -1)
    ]
    
    const statusPattern = recent3.map(w => {
      const isAttended = records.some(r => r.memberId === memberId && r.weekKey === w.weekKey)
      return isAttended ? '1' : '0'
    }).join('/')

    return statusPattern
  }

  // 신상명세용 10주 심방 전체 현황 계산
  const getMember10WeekVisitationStats = (memberId: string) => {
    const totalCount = visitations.filter(v => v.memberId === memberId).length;

    let recent10Count = 0;
    for (let i = 1; i <= 10; i++) {
      const wInfo = getCustomWeekInfo(new Date(), -i);
      if (visitations.some(v => v.memberId === memberId && v.weekKey === wInfo.weekKey)) {
        recent10Count++;
      }
    }

    const pattern3 = getMember3WeekStats(memberId, visitations);

    return `전체: ${totalCount}회 / 최근10주: ${recent10Count}회 / 최근3주: ${pattern3}`;
  }

  // 신상명세용 10주 정시예배 전체 현황 계산
  const getMember10WeekRegularStats = (memberId: string) => {
    const totalCount = regularRecords.filter(r => r.memberId === memberId).length;

    let recent10Count = 0;
    for (let i = 1; i <= 10; i++) {
      const wInfo = getCustomWeekInfo(new Date(), -i);
      if (regularRecords.some(r => r.memberId === memberId && r.weekKey === wInfo.weekKey)) {
        recent10Count++;
      }
    }

    const pattern3 = getMember3WeekStats(memberId, regularRecords);

    return `전체: ${totalCount}회 / 최근10주: ${recent10Count}회 / 최근3주: ${pattern3}`;
  }

  const recent5WeeksData = useMemo(() => {
    return getRecent5WeeksInfo(new Date())
  }, [])

  const availableCountries = useMemo(() => {
    const customCountries = members.map(m => m.country).filter(c => !ALL_COUNTRIES.includes(c))
    return Array.from(new Set([...ALL_COUNTRIES, ...customCountries]))
  }, [members])

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const MAX_WIDTH = 800
        const MAX_HEIGHT = 800
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width)
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height)
            height = MAX_HEIGHT
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(img, 0, 0, width, height)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7)

        if (isEdit && editingMember) {
          setEditingMember({ ...editingMember, photoUrl: compressedBase64 })
        } else {
          setNewMember({ ...newMember, photoUrl: compressedBase64 })
        }
      }
      img.onerror = () => {
        alert('이미지를 불러오는 중 오류가 발생했습니다.')
      }
      img.src = event.target?.result as string
    }

    reader.readAsDataURL(file)
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newMember.name.trim()) {
      alert('이름을 입력해 주세요.')
      return
    }

    let finalCountry = formCountry
    if (formCountry === '기타') {
      if (newMember.customCountry.trim()) {
        finalCountry = newMember.customCountry.trim()
      } else {
        alert('국가명을 입력해 주세요.')
        return
      }
    }

    const member: Member = {
      id: Date.now().toString(),
      name: newMember.name.trim(),
      country: finalCountry,
      hopeLevel: newMember.hopeLevel,
      birthday: newMember.birthday.trim() || "",
      gifts: newMember.gifts.trim() || "",
      phone: newMember.phone.trim() || "",
      email: newMember.email.trim() || "",
      address: newMember.address.trim() || "",
      familyStatus: newMember.familyStatus.trim() || "",
      faithStatus: newMember.faithStatus.trim() || "",
      photoUrl: newMember.photoUrl || "",
      isVisitationTarget: newMember.isVisitationTarget,
      isRegularTarget: newMember.isRegularTarget,
      notes: [],
      createdAt: new Date().toISOString().split('T')[0]
    }

    const updatedMembers = [member, ...members]
    setMembers(updatedMembers)
    
    setSelectedCountryTab(finalCountry)
    
    setNewMember({
      name: '',
      customCountry: '',
      hopeLevel: 5,
      birthday: '',
      gifts: '',
      phone: '',
      email: '',
      address: '',
      familyStatus: '',
      faithStatus: '',
      photoUrl: '',
      isVisitationTarget: true,
      isRegularTarget: true
    })
    setFormCountry('태국')
    setShowAddForm(false)
    
    await saveDataToFirebase(introData, updatedMembers, visitations, regularRecords, sermons)
  }

  const handleUpdateMember = async () => {
    if (!editingMember) return
    const updated = members.map(m => m.id === editingMember.id ? editingMember : m)
    setMembers(updated)
    setEditingMember(null)
    await saveDataToFirebase(introData, updated, visitations, regularRecords, sermons)
  }

  const handleDeleteMember = async (id: string) => {
    if (window.confirm('정말 이 교인을 삭제하시겠습니까?')) {
      const updated = members.filter(m => m.id !== id)
      setMembers(updated)
      if (expandedMemberId === id) setExpandedMemberId(null)
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

  const handleAddMemberNote = async (memberId: string) => {
    const text = newNoteInput[memberId]?.trim()
    if (!text || !adminUser) return

    const now = new Date()
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const note: MemberNote = {
      id: Date.now().toString(),
      author: adminUser,
      content: text,
      createdAt: timeStr
    }

    const updated = members.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          notes: [...(m.notes || []), note]
        }
      }
      return m
    })

    setMembers(updated)
    setNewNoteInput({ ...newNoteInput, [memberId]: '' })
    await saveDataToFirebase(introData, updated, visitations, regularRecords, sermons)
  }

  const handleDeleteMemberNote = async (memberId: string, noteId: string) => {
    const updated = members.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          notes: (m.notes || []).filter(n => n.id !== noteId)
        }
      }
      return m
    })
    setMembers(updated)
    await saveDataToFirebase(introData, updated, visitations, regularRecords, sermons)
  }

  const handleToggleVisitationCheck = async (member: Member) => {
    const targetDate = visitationTargetDate ? new Date(visitationTargetDate) : new Date()
    const { weekKey, weekLabel } = getCustomWeekInfo(targetDate)

    const existingIndex = visitations.findIndex(
      v => v.memberId === member.id && v.weekKey === weekKey
    )

    let updatedVisitations = [...visitations]

    if (existingIndex !== -1) {
      updatedVisitations.splice(existingIndex, 1)
    } else {
      const month = targetDate.getMonth() + 1
      const date = targetDate.getDate()
      const dayKorean = getDayKorean(targetDate)
      const now = new Date()
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
        timestamp: targetDate.getTime()
      }
      updatedVisitations.unshift(newRec)
    }

    setVisitations(updatedVisitations)
    await saveDataToFirebase(introData, members, updatedVisitations, regularRecords, sermons)
  }

  const handleToggleRegularCheck = async (member: Member) => {
    const targetDate = regularTargetDate ? new Date(regularTargetDate) : new Date()
    const { weekKey, weekLabel } = getCustomWeekInfo(targetDate)

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
        timestamp: targetDate.getTime()
      }
      updatedRecords.unshift(newRec)
    }

    setRegularRecords(updatedRecords)
    await saveDataToFirebase(introData, members, visitations, updatedRecords, sermons)
  }

  const handleSaveSermon = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminUser || !sermonTitle.trim()) return

    const now = new Date()
    const fullDateStr = now.toISOString().split('T')[0]
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    if (editingSermon) {
      const updatedSermons = sermons.map(s => {
        if (s.id === editingSermon.id) {
          return {
            ...s,
            title: sermonTitle.trim(),
            scripture: sermonScripture.trim(),
            content: sermonContent.trim()
          }
        }
        return s
      })
      setSermons(updatedSermons)
      setEditingSermon(null)
      await saveDataToFirebase(introData, members, visitations, regularRecords, updatedSermons)
    } else {
      const newSermon: Sermon = {
        id: Date.now().toString(),
        authorId: adminUser,
        title: sermonTitle.trim(),
        scripture: sermonScripture.trim(),
        content: sermonContent.trim(),
        date: fullDateStr,
        createdAt: timeStr
      }

      const updated = [newSermon, ...sermons]
      setSermons(updated)
      await saveDataToFirebase(introData, members, visitations, regularRecords, updated)
    }

    setSermonTitle(''); setSermonScripture(''); setSermonContent('')
  }

  const handleStartEditSermon = (s: Sermon) => {
    setEditingSermon(s)
    setSermonTitle(s.title)
    setSermonScripture(s.scripture || '')
    setSermonContent(s.content)
  }

  const handleCancelEditSermon = () => {
    setEditingSermon(null)
    setSermonTitle('')
    setSermonScripture('')
    setSermonContent('')
  }

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
            <span className="badge-neon">WORLD VISION FIGHTING</span>
            <h1>Moving His Children</h1>
            <p className="subtitle">이들은 하나님의 자녀입니다.</p>
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
              <input type="text" placeholder="관리자 ID" value={loginId} onChange={e => setLoginId(e.target.value)} required />
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
          💒 교회소개
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
            <h2>💒 교회소개</h2>
            <div className="info-card">
              <h3>📖 교회소개</h3>
              <p>{introData.churchIntro}</p>
            </div>
            <div className="info-card">
              <h3>⏰ 예배일정</h3>
              <p>{introData.worshipSchedule}</p>
            </div>
            
            <div className="link-section">
              <h3>관련 링크</h3>
              <a href="https://my-church-web-chi.vercel.app/" target="_blank" rel="noopener noreferrer" className="link-btn">
                🌿 무빙처치
              </a>
              <a href="https://moving-thai.vercel.app/" target="_blank" rel="noopener noreferrer" className="link-btn">
                🌿 무빙타이
              </a>
              <a href="https://movingcambodia.vercel.app/" target="_blank" rel="noopener noreferrer" className="link-btn">
                🌿 무빙캄보디아
              </a>
            </div>
          </section>
        )}

        {/* 2. 교인명부 */}
        {activeTab === 'members' && adminUser && (
          <section className="tab-content text-left">
            <h2>📖 교인명부</h2>
            
            <div className="filter-tags">
              {availableCountries.map(c => (
                <button
                  key={c}
                  className={selectedCountryTab === c ? 'active' : ''}
                  onClick={() => setSelectedCountryTab(c)}
                >
                  {c} ({members.filter(m => m.country === c).length})
                </button>
              ))}
            </div>

            <div className="add-member-accordion-bar">
              <button 
                type="button"
                className={`btn-toggle-add ${showAddForm ? 'open' : ''}`}
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? '➖ 교인등록 폼 닫기' : '➕ 신규 교인 등록'}
              </button>
            </div>

            {showAddForm && (
              <div className="form-box accordion-content">
                <h3>➕ 신규 교인 등록</h3>
                <form onSubmit={handleAddMember}>
                  <div className="photo-upload-container mb-12">
                    <label className="photo-upload-label">
                      📷 프로필 사진 등록
                      <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, false)} style={{ display: 'none' }} />
                    </label>
                    {newMember.photoUrl && (
                      <div className="photo-preview">
                        <img src={newMember.photoUrl} alt="미리보기" />
                        <button type="button" onClick={() => setNewMember({ ...newMember, photoUrl: '' })}>삭제</button>
                      </div>
                    )}
                  </div>

                  <div className="form-grid mb-8">
                    <input type="text" placeholder="이름 *" value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} required />
                    
                    <select 
                      value={formCountry} 
                      onChange={e => setFormCountry(e.target.value)}
                    >
                      {ALL_COUNTRIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="기타">기타 (직접입력)</option>
                    </select>

                    {formCountry === '기타' && (
                      <input 
                        type="text" 
                        placeholder="국가명 직접 입력 *" 
                        value={newMember.customCountry} 
                        onChange={e => setNewMember({ ...newMember, customCountry: e.target.value })}
                        required
                      />
                    )}

                    <select value={newMember.hopeLevel} onChange={e => setNewMember({ ...newMember, hopeLevel: Number(e.target.value) })}>
                      {[5, 4, 3, 2, 1].map(lvl => (
                        <option key={lvl} value={lvl}>Hope {lvl} ({HOPE_LEVELS[lvl].desc})</option>
                      ))}
                    </select>

                    <input type="text" placeholder="생일 (예: 1981,8,1 또는 81,8,1)" value={newMember.birthday} onChange={e => setNewMember({ ...newMember, birthday: e.target.value })} />
                    <input type="text" placeholder="선물기입란 (교회 선물 내역)" value={newMember.gifts} onChange={e => setNewMember({ ...newMember, gifts: e.target.value })} />

                    <input type="text" placeholder="전화번호" value={newMember.phone} onChange={e => setNewMember({ ...newMember, phone: e.target.value })} />
                    <input type="email" placeholder="이메일" value={newMember.email} onChange={e => setNewMember({ ...newMember, email: e.target.value })} />

                    <input type="text" placeholder="가족현황" value={newMember.familyStatus} onChange={e => setNewMember({ ...newMember, familyStatus: e.target.value })} />
                    <input type="text" placeholder="기존신앙(불교,힌두교 등)" value={newMember.faithStatus} onChange={e => setNewMember({ ...newMember, faithStatus: e.target.value })} />
                  </div>
                  <input type="text" placeholder="주소 (구글 맵 클릭용)" className="input-full mb-12" value={newMember.address} onChange={e => setNewMember({ ...newMember, address: e.target.value })} />
                  <button type="submit" className="btn-primary">교인 등록 저장</button>
                </form>
              </div>
            )}

            <div className="member-list">
              {members.filter(m => m.country === selectedCountryTab).map(m => {
                const isExpanded = expandedMemberId === m.id
                const visitationStats = getMember3WeekStats(m.id, visitations)
                const regularStats = getMember3WeekStats(m.id, regularRecords)
                const calculatedAgeInfo = calculateAge(m.birthday)

                return (
                  <div key={m.id} className="member-card">
                    <div className="member-header">
                      <div className="member-basic-info" onClick={() => setExpandedMemberId(isExpanded ? null : m.id)}>
                        {m.photoUrl ? (
                          <img src={m.photoUrl} alt={m.name} className="member-avatar" />
                        ) : (
                          <div className="member-avatar-placeholder">{m.name.substring(0, 1)}</div>
                        )}
                        <strong className="member-name">{m.name}</strong>
                        <span className="country-badge">{m.country}</span>
                        <span className={`hope-badge hope-${m.hopeLevel}`}>{HOPE_LEVELS[m.hopeLevel].title}</span>
                        {calculatedAgeInfo && <span className="info-chip">만 {calculatedAgeInfo.age}세</span>}
                        
                        {m.isVisitationTarget && (
                          <span className="stat-tag visitation">심방: {visitationStats}</span>
                        )}
                        {m.isRegularTarget && (
                          <span className="stat-tag regular">정시: {regularStats}</span>
                        )}
                      </div>

                      <div>
                        <button 
                          className="btn-edit-sm" 
                          onClick={() => setExpandedMemberId(isExpanded ? null : m.id)}
                        >
                          {isExpanded ? '접기 ▲' : '신상보기 ▼'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="member-expanded-details">
                        <div className="member-expanded-profile mb-12">
                          {m.photoUrl ? (
                            <img src={m.photoUrl} alt={m.name} className="expanded-avatar" />
                          ) : (
                            <div className="expanded-avatar-placeholder">{m.name.substring(0, 1)}</div>
                          )}
                          <div className="expanded-profile-info">
                            <h3 className="expanded-profile-name">{m.name}</h3>
                            <span className="country-badge">{m.country}</span>
                          </div>
                        </div>

                        <div className="detail-rows mb-12">
                          <p><strong>Hope:</strong> {HOPE_LEVELS[m.hopeLevel].desc}</p>
                          {m.birthday && (
                            <p>
                              <strong>생일:</strong> {m.birthday} 
                              {calculatedAgeInfo && <span style={{ color: '#38bdf8', marginLeft: '6px' }}>(만 {calculatedAgeInfo.age}세)</span>}
                            </p>
                          )}
                          {/* 심방전체 10주 출력 */}
                          <p><strong>심방참석:</strong> <span style={{ color: '#a78bfa' }}>{getMember10WeekVisitationStats(m.id)}</span></p>
                          
                          {/* 정시전체 10주 출력 추가 */}
                          <p><strong>정시참석:</strong> <span style={{ color: '#836296' }}>{getMember10WeekRegularStats(m.id)}</span></p>

                          {/* 선물기입란 표시 */}
                          <p><strong>선물기록:</strong> {m.gifts ? <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{m.gifts}</span> : <span style={{ color: '#64748b' }}>기록 없음</span>}</p>

                          {m.phone && <p><strong>전화번호:</strong> <a href={`tel:${m.phone}`} className="phone-link">{m.phone}</a></p>}
                          {m.email && <p><strong>이메일:</strong> <a href={`mailto:${m.email}`} className="email-link">{m.email}</a></p>}
                          {m.familyStatus && <p><strong>가족현황:</strong> {m.familyStatus}</p>}
                          {m.faithStatus && <p><strong>기존신앙:</strong> {m.faithStatus}</p>}
                          {m.address && (
                            <p>
                              <strong>주소:</strong> {m.address}
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.address)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="map-link"
                              >
                                🗺️ 구글 지도
                              </a>
                            </p>
                          )}
                        </div>

                        <div className="checkbox-group mb-12">
                          <label className="checkbox-label">
                            <input 
                              type="checkbox" 
                              checked={m.isVisitationTarget} 
                              onChange={() => handleToggleTarget(m.id, 'visitation')} 
                            />
                            심방예배 대상자 등록
                          </label>
                          <label className="checkbox-label">
                            <input 
                              type="checkbox" 
                              checked={m.isRegularTarget} 
                              onChange={() => handleToggleTarget(m.id, 'regular')} 
                            />
                            정시예배 대상자 등록
                          </label>
                        </div>

                        <div className="member-notes-container">
                          <h4>💬 성도기록 (누적 관리)</h4>
                          <div className="notes-chat-list">
                            {(!m.notes || m.notes.length === 0) ? (
                              <p className="no-notes">기록된 성도 정보가 없습니다.</p>
                            ) : (
                              m.notes.slice().reverse().map(note => (
                                <div key={note.id} className="note-chat-bubble">
                                  <div className="note-bubble-header">
                                    <span className="note-author">👤 {note.author}</span>
                                    <span className="note-time">{note.createdAt}</span>
                                    <button 
                                      className="btn-note-del" 
                                      onClick={() => handleDeleteMemberNote(m.id, note.id)}
                                      title="기록 삭제"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <div className="note-bubble-content">{note.content}</div>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="note-input-row">
                            <input
                              type="text"
                              placeholder="성도에 대한 기록 입력..."
                              value={newNoteInput[m.id] || ''}
                              onChange={e => setNewNoteInput({ ...newNoteInput, [m.id]: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleAddMemberNote(m.id)
                              }}
                            />
                            <button 
                              type="button" 
                              className="btn-secondary"
                              onClick={() => handleAddMemberNote(m.id)}
                            >
                              기록
                            </button>
                          </div>
                        </div>

                        <div className="expanded-actions">
                          <button className="btn-secondary-sm" onClick={() => setEditingMember(m)}>
                            ✏️ 정보 수정
                          </button>
                          <button className="btn-danger-sm" onClick={() => handleDeleteMember(m.id)}>
                            🗑️ 교인 삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 3. 심방예배 */}
        {activeTab === 'visitation' && adminUser && (
          <section className="tab-content text-left">
            <h2>🏃‍♂️심방예배 (주 1회 체크)</h2>

            <div className="info-card">
              <h3>📊최근 5주 심방현황</h3>
              <div className="recent-5weeks-grid">
                {recent5WeeksData.map((w) => {
                  const count = visitations.filter(v => v.weekKey === w.weekKey).length
                  return (
                    <div key={w.weekKey} className="week-stat-box">
                      <span className="week-tag">{w.labelName} ({w.weekLabel})</span>
                      <span className="week-sunday-date">📅 {w.sundayFormatted} (일)</span>
                      <span className="week-count">{count}명</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="form-box">
              {(() => {
                const selectedDateObj = visitationTargetDate ? new Date(visitationTargetDate) : new Date()
                const selectedWeekInfo = getCustomWeekInfo(selectedDateObj)
                const visitationTargets = members.filter(m => m.isVisitationTarget)

                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <h3>대상날짜 선택:</h3>
                      <input
                        type="date"
                        value={visitationTargetDate}
                        onChange={(e) => setVisitationTargetDate(e.target.value)}
                        style={{ width: 'auto', padding: '6px 12px' }}
                      />
                      <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>
                        [{selectedWeekInfo.weekLabel}] 심방 참석 체크
                      </span>
                    </div>
                    <p className="subtitle mb-12">
                      선택한 날짜({visitationTargetDate}) 기준으로 출석을 체크합니다.
                    </p>

                    {availableCountries.map(countryName => {
                      const countryMembers = visitationTargets.filter(m => m.country === countryName)
                      if (countryMembers.length === 0) return null

                      return (
                        <div key={countryName} style={{ marginBottom: '16px' }}>
                          <h4 style={{ color: '#38bdf8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '8px' }}>
                            🌏 {countryName}
                          </h4>
                          <div className="filter-tags">
                            {countryMembers.map(m => {
                              const isChecked = visitations.some(
                                v => v.memberId === m.id && v.weekKey === selectedWeekInfo.weekKey
                              )
                              const stats = getMember3WeekStats(m.id, visitations)

                              return (
                                <button
                                  key={m.id}
                                  className={isChecked ? 'active' : ''}
                                  onClick={() => handleToggleVisitationCheck(m)}
                                  style={{ padding: '8px 14px', fontSize: '0.88rem' }}
                                >
                                  {isChecked ? '✅ ' : '➕ '}{m.name} ({stats})
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )
              })()}
            </div>

            <h3>📜 주별 심방 명단 리스트</h3>
            <div className="visitation-list">
              {groupedVisitations.length === 0 ? (
                <p className="subtitle">기록된 심방 내역이 없습니다.</p>
              ) : (
                groupedVisitations.map(([wKey, group]) => {
                  const isOpen = expandedVisitationWeeks[wKey] || false
                  return (
                    <div key={wKey} className="accordion-week-card">
                      <button
                        className="accordion-week-btn"
                        onClick={() =>
                          setExpandedVisitationWeeks(prev => ({ ...prev, [wKey]: !prev[wKey] }))
                        }
                      >
                        <div className="accordion-btn-header">
                          <span className="week-title">🗓️ {group.weekLabel} ({group.records.length}명)</span>
                          <span className="toggle-icon">{isOpen ? '▲' : '▼'}</span>
                        </div>
                        <div className="accordion-inline-names">
                          {group.records.map(r => r.memberName).join(', ')}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="accordion-week-content">
                          <div className="member-list">
                            {group.records.map(r => (
                              <div key={r.id} className="visitation-record-box">
                                <div className="visitation-record-header">
                                  <span>
                                    👤 <strong>{r.memberName}</strong> ({r.visitedAt})
                                  </span>
                                  <button className="btn-danger-sm" onClick={() => {
                                    const updated = visitations.filter(v => v.id !== r.id)
                                    setVisitations(updated)
                                    saveDataToFirebase(introData, members, updated, regularRecords, sermons)
                                  }}>취소</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        )}

        {/* 4. 주일 정시예배 */}
        {activeTab === 'regular' && adminUser && (
          <section className="tab-content text-left">
            <h2>⛪ 주일 정시예배 (주일 11시)</h2>

            <div className="info-card">
              <h3>📊 최근 5주 정시예배 출석 현황</h3>
              <div className="recent-5weeks-grid">
                {recent5WeeksData.map((w) => {
                  const count = regularRecords.filter(r => r.weekKey === w.weekKey).length
                  return (
                    <div key={w.weekKey} className="week-stat-box">
                      <span className="week-tag">{w.labelName} ({w.weekLabel})</span>
                      <span className="week-sunday-date">📅 {w.sundayFormatted} (일)</span>
                      <span className="week-count">{count}명</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="form-box">
              {(() => {
                const selectedDateObj = regularTargetDate ? new Date(regularTargetDate) : new Date()
                const selectedWeekInfo = getCustomWeekInfo(selectedDateObj)
                const regularTargets = members.filter(m => m.isRegularTarget)

                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <h3>📅 대상 날짜 선택:</h3>
                      <input
                        type="date"
                        value={regularTargetDate}
                        onChange={(e) => setRegularTargetDate(e.target.value)}
                        style={{ width: 'auto', padding: '6px 12px' }}
                      />
                      <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>
                        [{selectedWeekInfo.weekLabel}] 정시예배 참석 체크
                      </span>
                    </div>
                    <p className="subtitle mb-12">
                      선택한 날짜({regularTargetDate}) 기준으로 출석을 체크합니다.
                    </p>

                    {availableCountries.map(countryName => {
                      const countryMembers = regularTargets.filter(m => m.country === countryName)
                      if (countryMembers.length === 0) return null

                      return (
                        <div key={countryName} style={{ marginBottom: '16px' }}>
                          <h4 style={{ color: '#38bdf8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '8px' }}>
                            🌏 {countryName}
                          </h4>
                          <div className="filter-tags">
                            {countryMembers.map(m => {
                              const isChecked = regularRecords.some(
                                r => r.memberId === m.id && r.weekKey === selectedWeekInfo.weekKey
                              )
                              const stats = getMember3WeekStats(m.id, regularRecords)

                              return (
                                <button
                                  key={m.id}
                                  className={isChecked ? 'active' : ''}
                                  onClick={() => handleToggleRegularCheck(m)}
                                  style={{ padding: '8px 14px', fontSize: '0.88rem' }}
                                >
                                  {isChecked ? '✅ ' : '➕ '}{m.name} ({stats})
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )
              })()}
            </div>

            <h3>📜 주별 정시예배 명단</h3>
            <div className="visitation-list">
              {groupedRegulars.length === 0 ? (
                <p className="subtitle">기록된 정시예배 내역이 없습니다.</p>
              ) : (
                groupedRegulars.map(([wKey, group]) => {
                  const isOpen = expandedRegularWeeks[wKey] || false
                  return (
                    <div key={wKey} className="accordion-week-card">
                      <button
                        className="accordion-week-btn"
                        onClick={() =>
                          setExpandedRegularWeeks(prev => ({ ...prev, [wKey]: !prev[wKey] }))
                        }
                      >
                        <div className="accordion-btn-header">
                          <span className="week-title">🗓️ {group.weekLabel} 참석자 ({group.records.length}명)</span>
                          <span className="toggle-icon">{isOpen ? '▲' : '▼'}</span>
                        </div>
                        <div className="accordion-inline-names">
                          {group.records.map(r => r.memberName).join(', ')}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="accordion-week-content">
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {group.records.map(r => (
                              <span
                                key={r.id}
                                className="country-badge"
                                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                              >
                                👤 {r.memberName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        )}

        {/* 5. 말씀 저장 */}
        {activeTab === 'sermons' && adminUser && (
          <section className="tab-content text-left">
            <h2>📜 말씀 저장소</h2>
            <div className="form-box">
              <h3>{editingSermon ? '✏️ 말씀 수정' : `✍️ 말씀작성 (${adminUser})`}</h3>
              <form onSubmit={handleSaveSermon}>
                <input type="text" placeholder="말씀 제목" className="input-full mb-8" value={sermonTitle} onChange={e => setSermonTitle(e.target.value)} required />
                <input type="text" placeholder="성경 구절" className="input-full mb-8" value={sermonScripture} onChange={e => setSermonScripture(e.target.value)} />
                <textarea placeholder="본문 내용 입력..." className="input-full mb-12" rows={5} value={sermonContent} onChange={e => setSermonContent(e.target.value)} required />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn-primary">
                    {editingSermon ? '수정 완료' : '말씀 저장'}
                  </button>
                  {editingSermon && (
                    <button type="button" className="btn-secondary" onClick={handleCancelEditSermon}>
                      취소
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="sermon-list">
              {sermons.map(s => (
                <article key={s.id} className="sermon-card">
                  <div className="sermon-header">
                    <div>
                      <h3>{s.title}</h3>
                      <span>
                        👤 <strong>{s.authorId}</strong> ( {s.date}{s.createdAt ? `/ ${s.createdAt}` : ''})
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-secondary-sm" onClick={() => handleStartEditSermon(s)}>
                        ✏️ 수정
                      </button>
                      <button className="btn-danger-sm" onClick={() => {
                        const updated = sermons.filter(item => item.id !== s.id)
                        setSermons(updated)
                        saveDataToFirebase(introData, members, visitations, regularRecords, updated)
                      }}>삭제</button>
                    </div>
                  </div>
                  {s.scripture && <p style={{ color: '#38bdf8', fontWeight: 'bold' }}>📖 {s.scripture}</p>}
                  <p style={{ whiteSpace: 'pre-wrap', marginTop: '6px' }}>{s.content}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 교인 수정 모달 */}
      {editingMember && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>✏️ 교인 정보 수정</h3>

            <div className="photo-upload-container mb-12">
              <label className="photo-upload-label">
                📷 프로필 사진 변경
                <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, true)} style={{ display: 'none' }} />
              </label>
              {editingMember.photoUrl && (
                <div className="photo-preview">
                  <img src={editingMember.photoUrl} alt="미리보기" />
                  <button type="button" onClick={() => setEditingMember({ ...editingMember, photoUrl: '' })}>삭제</button>
                </div>
              )}
            </div>

            <input type="text" value={editingMember.name} onChange={e => setEditingMember({ ...editingMember, name: e.target.value })} placeholder="이름" />
            
            <input type="text" value={editingMember.country} onChange={e => setEditingMember({ ...editingMember, country: e.target.value })} placeholder="국가" />

            <select value={editingMember.hopeLevel} onChange={e => setEditingMember({ ...editingMember, hopeLevel: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map(lvl => (
                <option key={lvl} value={lvl}>Hope {lvl} - {HOPE_LEVELS[lvl].desc}</option>
              ))}
            </select>
            
            <input type="text" value={editingMember.birthday || ''} onChange={e => setEditingMember({ ...editingMember, birthday: e.target.value })} placeholder="생일 (예: 1981,8,1 또는 81,8,1)" />
            
            <input type="text" value={editingMember.gifts || ''} onChange={e => setEditingMember({ ...editingMember, gifts: e.target.value })} placeholder="선물기입란 (교회 선물 내역)" />

            <input type="text" value={editingMember.phone || ''} onChange={e => setEditingMember({ ...editingMember, phone: e.target.value })} placeholder="전화번호" />
            <input type="email" value={editingMember.email || ''} onChange={e => setEditingMember({ ...editingMember, email: e.target.value })} placeholder="이메일" />

            <input type="text" value={editingMember.address || ''} onChange={e => setEditingMember({ ...editingMember, address: e.target.value })} placeholder="주소" />
            <input type="text" value={editingMember.familyStatus || ''} onChange={e => setEditingMember({ ...editingMember, familyStatus: e.target.value })} placeholder="가족현황" />
            <input type="text" value={editingMember.faithStatus || ''} onChange={e => setEditingMember({ ...editingMember, faithStatus: e.target.value })} placeholder="기존신앙" />
            
            <div className="modal-buttons">
              <button className="btn-confirm" onClick={handleUpdateMember}>저장</button>
              <button className="btn-cancel" onClick={() => setEditingMember(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>© 2026 Moving Church Management System. All rights reserved.</p>
      </footer>
    </div>
  )
}