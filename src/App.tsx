import { useState, useEffect } from 'react'
import './App.css'
import { db } from './firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import headerImg from './assets/header.jpg'
import worshipImg from './assets/worship.jpg'
import locationImg from './assets/location.jpg'

const DRIVE_IMG_1 = 'https://lh3.googleusercontent.com/d/1pyi9KbaXypMf-muLxYqokAAcDMic0u1z'
const DRIVE_IMG_2 = 'https://lh3.googleusercontent.com/d/1vHwBaAGw3T3i_dyNLFS6ipjLQCx8RIBA'
const DRIVE_IMG_3 = 'https://lh3.googleusercontent.com/d/1nlC3fAIZr2BZN741agezvQGvcpWFidOD'

interface ScheduleData {
  monthly: string
  ministry: string
  yearly: string
  members: string
}

type TabType = 'about' | 'monthly' | 'ministry' | 'yearly' | 'members'

const defaultMonthly = `1월/ 전도
찬양
;
2월/ 기도
섬김
;
3월/ 예배
교제`

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('monthly')

  // 데이터 관리
  const [scheduleData, setScheduleData] = useState<ScheduleData>({
    monthly: defaultMonthly,
    ministry: '',
    yearly: '',
    members: ''
  })

  // 관리자 관련 상태
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false)
  const [passwordInput, setPasswordInput] = useState<string>('')

  // 수정용 폼 상태
  const [editForm, setEditForm] = useState<ScheduleData>(scheduleData)

  // 1. Firebase에서 데이터 불러오기
  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, 'church', 'schedule')
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const fetched = docSnap.data() as Partial<ScheduleData>
          const loadedData: ScheduleData = {
            monthly: fetched.monthly || defaultMonthly,
            ministry: fetched.ministry || '',
            yearly: fetched.yearly || '',
            members: fetched.members || ''
          }
          setScheduleData(loadedData)
          setEditForm(loadedData)
        }
      } catch (error) {
        console.error('Firebase 데이터 로딩 오류:', error)
      }
    }
    fetchData()
  }, [])

  // 2. 비밀번호 확인
  const handleAdminLogin = () => {
    if (passwordInput === '1234') {
      setIsAdmin(true)
      setShowPasswordModal(false)
      setPasswordInput('')
      alert('관리자 모드로 로그인되었습니다.')
    } else {
      alert('비밀번호가 올바르지 않습니다.')
    }
  }

  // 3. Firebase에 수정 데이터 저장하기
  const handleSaveData = async () => {
    try {
      await setDoc(doc(db, 'church', 'schedule'), editForm)
      setScheduleData(editForm)
      alert('성공적으로 저장되었습니다!')
    } catch (error) {
      console.error('저장 실패:', error)
      alert('저장 중 오류가 발생했습니다.')
    }
  }

  // 제목(/) 및 줄바꿈/항목(;) 단위 파싱 함수
  const renderScheduleContent = (text: string) => {
    if (!text) return <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>등록된 내용이 없습니다.</p>

    // 세미콜론(;) 기준으로 세션 블록 분할
    const blocks = text.split(';').map(b => b.trim()).filter(Boolean)

    return (
      <div className="schedule-block-container">
        {blocks.map((block, idx) => {
          if (!block) return null

          // / 기준으로 제목과 본문을 분리
          const slashIndex = block.indexOf('/')
          let title = ''
          let body = block

          if (slashIndex !== -1) {
            title = block.substring(0, slashIndex).trim()
            body = block.substring(slashIndex + 1).trim()
          }

          // 엔터(줄바꿈) 단위로 세부 줄 분할
          const lines = body
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)

          return (
            <div key={idx} className="date-group-card">
              {title && <div className="date-header">🌱 {title}</div>}
              <div className="date-content-list">
                {lines.map((line, lineIdx) => (
                  <div key={lineIdx} className="content-line item-tagged">
                    <span className="detail-badge">{line}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="church-container">
      {/* 헤더 */}
      <header className="church-header">
        <img src={headerImg} alt="Moving Church 메인" className="header-img" />
        <h1>Moving Church</h1>
        <p className="subtitle">하나님의 당신을 사랑하십니다.</p>

        {/* 관리자 모드 접속 버튼 */}
        <div className="admin-bar">
          {!isAdmin ? (
            <button className="admin-btn" onClick={() => setShowPasswordModal(true)}>
              🔒 관리자 로그인
            </button>
          ) : (
            <button className="admin-btn logout" onClick={() => setIsAdmin(false)}>
              🔓 관리자 로그아웃
            </button>
          )}
        </div>
      </header>

      {/* 비밀번호 입력 모달 */}
      {showPasswordModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>관리자 비밀번호 입력</h3>
            <input
              type="password"
              placeholder="비밀번호"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
            />
            <div className="modal-buttons">
              <button style={{ background: '#f472b6', color: '#fff', border: 'none' }} onClick={handleAdminLogin}>확인</button>
              <button onClick={() => setShowPasswordModal(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 네비게이션 탭 */}
      <nav className="church-nav">
        <button className={activeTab === 'about' ? 'active' : ''} onClick={() => setActiveTab('about')}>
          교회소개
        </button>
        <button className={activeTab === 'monthly' ? 'active' : ''} onClick={() => setActiveTab('monthly')}>
          이번달일정
        </button>
        <button className={activeTab === 'ministry' ? 'active' : ''} onClick={() => setActiveTab('ministry')}>
          사역내용
        </button>
        <button className={activeTab === 'yearly' ? 'active' : ''} onClick={() => setActiveTab('yearly')}>
          2026주요사업
        </button>
        <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>
          멤버
        </button>
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="church-content">
        {/* 관리자 모드 데이터 수정 폼 */}
        {isAdmin && (
          <div className="admin-editor-box">
            <h3 style={{ marginBottom: '8px' }}>✏️ 관리자 내용 수정하기</h3>
            <p className="admin-tip">
              💡 작성 방법:<br />
              - 제목: <code>1월/</code><br />
              - 내용을 줄바꿈(엔터)하면 화면에도 다음 줄로 표시됩니다.<br />
              - 블록 끝 구분: <code>;</code> 기호 입력
            </p>
            <label>
              <strong>이번 달 일정:</strong>
              <textarea
                rows={6}
                value={editForm.monthly}
                onChange={(e) => setEditForm({ ...editForm, monthly: e.target.value })}
              />
            </label>
            <label>
              <strong>사역 내용:</strong>
              <textarea
                rows={6}
                value={editForm.ministry}
                onChange={(e) => setEditForm({ ...editForm, ministry: e.target.value })}
              />
            </label>
            <label>
              <strong>2026 주요 사업:</strong>
              <textarea
                rows={6}
                value={editForm.yearly}
                onChange={(e) => setEditForm({ ...editForm, yearly: e.target.value })}
              />
            </label>
            <label>
              <strong>멤버 목록:</strong>
              <textarea
                rows={6}
                value={editForm.members}
                onChange={(e) => setEditForm({ ...editForm, members: e.target.value })}
              />
            </label>
            <button className="save-btn" onClick={handleSaveData}>
              💾 저장하기
            </button>
          </div>
        )}

        {/* 1. 교회소개 */}
        {activeTab === 'about' && (
          <section className="tab-content">
            <h2>✨ 당신은 예수님을 믿어야 합니다.</h2>
            <div className="video-container">
              <iframe
                src="https://www.youtube.com/embed/L-wvdG55Ot4"
                title="Who is Jesus? (Inspiration video) Billy Graham"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>

            <p style={{ marginTop: '16px', lineHeight: '1.6', color: '#0369a1', background: '#f0f9ff', padding: '12px 16px', borderRadius: '12px', borderLeft: '4px solid #38bdf8' }}>
              '예수께서 이르시되 내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라' (요 14:6)
            </p>

            <div style={{ margin: '30px 0 16px' }}>
              <h2>🙏 예배 안내</h2>
              <img src={worshipImg} alt="예배 모습" className="content-img" />
            </div>

            <div style={{ margin: '30px 0 16px' }}>
              <h2>📍 오시는 길</h2>
              <img src={locationImg} alt="약도" className="content-img" />
            </div>

            {/* 링크 버튼 섹션 */}
            <div className="link-section">
              <h3>관련 링크</h3>
              <a 
                href="https://moving-thai.vercel.app/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="link-btn"
              >
                🌿 무빙타이
              </a>
              <a 
                href="https://movingcambodia.vercel.app/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="link-btn"
              >
                🌿 무빙캄보디아
              </a>
            </div>
          </section>
        )}

        {/* 2. 이번달일정 */}
        {activeTab === 'monthly' && (
          <section className="tab-content text-left">
            <h2>🗓️ 이번 달 일정</h2>
            <img src={DRIVE_IMG_1} alt="이번달 일정" className="content-img" />
            {renderScheduleContent(scheduleData.monthly)}
          </section>
        )}

        {/* 3. 사역내용 */}
        {activeTab === 'ministry' && (
          <section className="tab-content text-left">
            <h2>🤝 사역 내용</h2>
            <img src={DRIVE_IMG_2} alt="사역 내용" className="content-img" />
            {renderScheduleContent(scheduleData.ministry)}
          </section>
        )}

        {/* 4. 2026주요사업 */}
        {activeTab === 'yearly' && (
          <section className="tab-content text-left">
            <h2>📌 2026 주요 사업</h2>
            <img src={DRIVE_IMG_3} alt="2026 주요 사업" className="content-img" />
            {renderScheduleContent(scheduleData.yearly)}
          </section>
        )}

        {/* 5. 멤버 */}
        {activeTab === 'members' && (
          <section className="tab-content text-left">
            <h2>👥 멤버 소개</h2>
            {renderScheduleContent(scheduleData.members)}
          </section>
        )}
      </main>

      <footer className="church-footer">
        <p>© 2026 Moving Church. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default App