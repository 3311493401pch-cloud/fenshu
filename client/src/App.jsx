import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// ====== 类别列表 ======
const CATEGORIES = [
  { key: 'normal', label: '普通批次·成绩登记', desc: '填写高数、理论、实操、外语成绩' },
  { key: 'admission', label: '普通批次·录取结果登记', desc: '登记录取院校和专业', disabled: true },
  { key: 'retired', label: '退役批次·成绩登记', desc: '退役大学生士兵专项', disabled: true },
  { key: 'admission_retired', label: '退役批次·录取结果登记', desc: '退役批次录取登记', disabled: true },
]

const SCORE_LIMITS = {
  high_math: { label: '高数', min: 0, max: 150 },
  theory: { label: '理论', min: 0, max: 150 },
  practical: { label: '实操', min: 0, max: 80 },
  english: { label: '外语（折算后）', min: 0, max: 120 },
}

const calcTotal = (form) =>
  (parseFloat(form.high_math) || 0) +
  (parseFloat(form.theory) || 0) +
  (parseFloat(form.practical) || 0) +
  (parseFloat(form.english) || 0)

const PAGES = {
  SELECT: 'select',
  FORM: 'form',
  BOARD: 'board',
  ADMIN_LOGIN: 'admin_login',
  ADMIN_DASHBOARD: 'admin_dashboard',
}

export default function App() {
  const [page, setPage] = useState(PAGES.SELECT)
  const [scores, setScores] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', qq: '', high_math: '', theory: '', practical: '', english: '' })

  // 管理员状态
  const [adminToken, setAdminToken] = useState(localStorage.getItem('admin_token') || '')
  const [adminData, setAdminData] = useState({})
  const [adminTab, setAdminTab] = useState('normal')
  const [editRow, setEditRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [adminPassword, setAdminPassword] = useState('')

  // 普通用户查看排行榜
  const loadScores = useCallback(async () => {
    try {
      const { data } = await api.get('/scores')
      setScores(data)
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => {
    if (page === PAGES.BOARD) {
      loadScores()
      const timer = setInterval(loadScores, 5000)
      return () => clearInterval(timer)
    }
  }, [page, loadScores])

  // 管理员数据加载
  const loadAdminData = useCallback(async () => {
    if (!adminToken) return
    try {
      const { data } = await api.get('/admin/scores', {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      setAdminData(data)
    } catch (e) {
      if (e.response?.status === 401) {
        localStorage.removeItem('admin_token')
        setAdminToken('')
        setPage(PAGES.ADMIN_LOGIN)
      }
    }
  }, [adminToken])

  useEffect(() => {
    if (page === PAGES.ADMIN_DASHBOARD) {
      loadAdminData()
    }
  }, [page, loadAdminData])

  // 表单处理
  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const name = form.name.trim()
    const qq = form.qq.replace(/\D/g, '')
    if (!name) return setError('请输入真实姓名')
    if (!qq) return setError('请输入QQ号')
    for (const [key, { label, min, max }] of Object.entries(SCORE_LIMITS)) {
      const v = parseFloat(form[key])
      if (isNaN(v)) return setError(`请输入${label}成绩`)
      if (v < min || v > max) return setError(`${label}范围 ${min}~${max} 分`)
    }
    setSubmitting(true)
    try {
      await api.post('/scores', { name, qq, high_math: form.high_math, theory: form.theory, practical: form.practical, english: form.english })
      setForm({ name: '', qq: '', high_math: '', theory: '', practical: '', english: '' })
      setPage(PAGES.BOARD)
    } catch (err) {
      setError(err.response?.data?.error || '提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  // 管理员登录
  const handleAdminLogin = async () => {
    setError('')
    try {
      const { data } = await api.post('/admin/login', { password: adminPassword })
      localStorage.setItem('admin_token', data.token)
      setAdminToken(data.token)
      setAdminPassword('')
      setPage(PAGES.ADMIN_DASHBOARD)
    } catch (err) {
      setError(err.response?.data?.error || '登录失败')
    }
  }

  // 管理员编辑
  const startEdit = (row) => {
    setEditRow(row.id)
    setEditForm({
      name: row.name,
      qq: row.qq,
      high_math: row.high_math,
      theory: row.theory,
      practical: row.practical,
      english: row.english,
    })
  }

  const cancelEdit = () => { setEditRow(null); setEditForm({}) }

  const saveEdit = async (id) => {
    try {
      await api.put(`/admin/scores/${id}`, editForm, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      setEditRow(null)
      loadAdminData()
    } catch (err) {
      setError(err.response?.data?.error || '修改失败')
    }
  }

  const deleteRow = async (id) => {
    if (!window.confirm('确定删除这条记录？')) return
    try {
      await api.delete(`/admin/scores/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      loadAdminData()
    } catch (err) {
      setError(err.response?.data?.error || '删除失败')
    }
  }

  const handleEditChange = (e) => {
    const { name, value } = e.target
    setEditForm((prev) => ({ ...prev, [name]: value }))
  }

  const total = calcTotal(form)
  const BATCH_LABELS = {
    normal: '普通批次·成绩',
    admission: '普通批次·录取',
    retired: '退役批次·成绩',
    admission_retired: '退役批次·录取',
  }

  // ========== 类别选择 ==========
  if (page === PAGES.SELECT) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">分数线登记系统</h1>
        <p className="text-center text-gray-400 text-sm mb-10">请选择登记类别</p>
        <div className="space-y-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              disabled={cat.disabled}
              onClick={() => cat.key === 'normal' && setPage(PAGES.FORM)}
              className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
                cat.disabled
                  ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'border-blue-200 bg-white hover:border-blue-400 hover:shadow-md text-gray-700'
              }`}
            >
              <div className="font-semibold text-lg">{cat.label}</div>
              <div className={`text-sm mt-1 ${cat.disabled ? 'text-gray-300' : 'text-gray-400'}`}>
                {cat.desc}
                {cat.disabled && '（即将开放）'}
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={() => setPage(PAGES.ADMIN_LOGIN)}
          className="w-full mt-10 py-3 rounded-xl text-gray-400 hover:text-gray-600 transition-colors text-sm"
        >
          管理员入口
        </button>
      </div>
    )
  }

  // ========== 成绩录入 ==========
  if (page === PAGES.FORM) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <button onClick={() => setPage(PAGES.SELECT)} className="text-blue-500 text-sm mb-6 hover:underline">
          ← 返回选择类别
        </button>
        <h1 className="text-xl font-bold text-gray-800 mb-1">普通批次·成绩登记</h1>
        <p className="text-gray-400 text-sm mb-8">每人仅限提交一次，请认真核对后再提交</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">真实姓名</label>
            <input name="name" value={form.name} onChange={handleChange} placeholder="请输入真实姓名" maxLength={20}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">QQ号</label>
            <input name="qq" value={form.qq} onChange={handleChange} placeholder="请输入QQ号" maxLength={15} inputMode="numeric"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700" />
          </div>
          {Object.entries(SCORE_LIMITS).map(([key, { label, min, max }]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                {label}
                <span className="text-gray-300 font-normal ml-1">({min}~{max}分)</span>
              </label>
              <input name={key} type="number" value={form[key]} onChange={handleChange}
                placeholder={`${min}~${max}`} min={min} max={max} step="0.5"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700" />
            </div>
          ))}
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <span className="text-gray-500 text-sm">总分预览：</span>
            <span className="text-2xl font-bold text-blue-600 ml-2">{total}</span>
            <span className="text-gray-400 text-sm ml-1">分</span>
          </div>
          {error && <div className="bg-red-50 text-red-500 text-sm rounded-xl p-3 text-center">{error}</div>}
          <button type="submit" disabled={submitting}
            className="w-full py-4 rounded-xl bg-blue-500 text-white font-bold text-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
            {submitting ? '提交中...' : '确认提交'}
          </button>
        </form>
      </div>
    )
  }

  // ========== 排行榜（匿名化） ==========
  if (page === PAGES.BOARD) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => setPage(PAGES.SELECT)} className="text-blue-500 text-sm mb-6 hover:underline">
          ← 返回首页
        </button>
        <h1 className="text-xl font-bold text-gray-800 mb-1">普通批次排行榜</h1>
        <p className="text-gray-400 text-sm mb-6">按总分降序 · 每5秒自动刷新</p>
        {scores.length === 0 ? (
          <div className="text-center py-16 text-gray-300 text-lg">暂无成绩数据</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400">
                <th className="py-2 px-2 text-left w-12">排名</th>
                <th className="py-2 px-2 text-left">姓名</th>
                <th className="py-2 px-2 text-right">高数</th>
                <th className="py-2 px-2 text-right">理论</th>
                <th className="py-2 px-2 text-right">实操</th>
                <th className="py-2 px-2 text-right">外语</th>
                <th className="py-2 px-2 text-right">总分</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="py-2 px-2 text-gray-500">{row.rank}</td>
                  <td className="py-2 px-2 text-gray-800">{row.name}</td>
                  <td className="py-2 px-2 text-right text-gray-600">{row.high_math}</td>
                  <td className="py-2 px-2 text-right text-gray-600">{row.theory}</td>
                  <td className="py-2 px-2 text-right text-gray-600">{row.practical}</td>
                  <td className="py-2 px-2 text-right text-gray-600">{row.english}</td>
                  <td className="py-2 px-2 text-right font-medium">{row.total_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  // ========== 管理员登录 ==========
  if (page === PAGES.ADMIN_LOGIN) {
    return (
      <div className="max-w-sm mx-auto px-4 py-24">
        <h1 className="text-xl font-bold text-center text-gray-800 mb-8">管理员登录</h1>
        <input type="password" value={adminPassword} onChange={(e) => { setAdminPassword(e.target.value); setError('') }}
          placeholder="请输入管理员密码" onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700 mb-4" />
        {error && <div className="bg-red-50 text-red-500 text-sm rounded-xl p-3 text-center mb-4">{error}</div>}
        <button onClick={handleAdminLogin}
          className="w-full py-3 rounded-xl bg-gray-800 text-white font-medium hover:bg-gray-900 transition-colors">
          登录
        </button>
        <button onClick={() => { setPage(PAGES.SELECT); setError('') }}
          className="w-full mt-3 py-2 text-gray-400 text-sm hover:text-gray-600">
          ← 返回首页
        </button>
      </div>
    )
  }

  // ========== 管理员后台 ==========
  if (page === PAGES.ADMIN_DASHBOARD) {
    const currentList = adminData[adminTab] || []

    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-gray-800">管理员后台</h1>
          <button onClick={() => { localStorage.removeItem('admin_token'); setAdminToken(''); setPage(PAGES.SELECT) }}
            className="text-sm text-gray-400 hover:text-red-500">退出登录</button>
        </div>

        {/* 批次标签 */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {Object.entries(BATCH_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setAdminTab(key)}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                adminTab === key ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 text-red-500 text-sm rounded-xl p-3 mb-4">{error}</div>}

        {/* 数据表格 */}
        {currentList.length === 0 ? (
          <div className="text-center py-16 text-gray-300">暂无数据</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400 text-xs">
                <th className="py-2 px-1 text-left">ID</th>
                <th className="py-2 px-1 text-left">姓名</th>
                <th className="py-2 px-1 text-left">QQ</th>
                <th className="py-2 px-1 text-right">高数</th>
                <th className="py-2 px-1 text-right">理论</th>
                <th className="py-2 px-1 text-right">实操</th>
                <th className="py-2 px-1 text-right">外语</th>
                <th className="py-2 px-1 text-right">总分</th>
                <th className="py-2 px-1 text-right">时间</th>
                <th className="py-2 px-1 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((row) => (
                <tr key={row.id} className="border-b border-gray-50">
                  {editRow === row.id ? (
                    <>
                      <td className="py-1 px-1 text-gray-400 text-xs">{row.id}</td>
                      <td className="py-1 px-1"><input name="name" value={editForm.name} onChange={handleEditChange}
                        className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-1"><input name="qq" value={editForm.qq} onChange={handleEditChange}
                        className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-1"><input name="high_math" type="number" value={editForm.high_math} onChange={handleEditChange}
                        className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-1"><input name="theory" type="number" value={editForm.theory} onChange={handleEditChange}
                        className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-1"><input name="practical" type="number" value={editForm.practical} onChange={handleEditChange}
                        className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-1"><input name="english" type="number" value={editForm.english} onChange={handleEditChange}
                        className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-1 px-1 text-right text-sm text-gray-400">
                        {(parseFloat(editForm.high_math)||0)+(parseFloat(editForm.theory)||0)+(parseFloat(editForm.practical)||0)+(parseFloat(editForm.english)||0)}
                      </td>
                      <td className="py-1 px-1 text-xs text-gray-300">{row.created_at}</td>
                      <td className="py-1 px-1 text-center">
                        <button onClick={() => saveEdit(row.id)} className="text-green-500 text-xs mr-2">保存</button>
                        <button onClick={cancelEdit} className="text-gray-400 text-xs">取消</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-1 text-gray-400 text-xs">{row.id}</td>
                      <td className="py-2 px-1 text-gray-800">{row.name}</td>
                      <td className="py-2 px-1 text-gray-500 text-xs">{row.qq}</td>
                      <td className="py-2 px-1 text-right text-gray-600">{row.high_math}</td>
                      <td className="py-2 px-1 text-right text-gray-600">{row.theory}</td>
                      <td className="py-2 px-1 text-right text-gray-600">{row.practical}</td>
                      <td className="py-2 px-1 text-right text-gray-600">{row.english}</td>
                      <td className="py-2 px-1 text-right font-medium">{row.total_score}</td>
                      <td className="py-2 px-1 text-right text-xs text-gray-300">{row.created_at}</td>
                      <td className="py-2 px-1 text-center">
                        <button onClick={() => startEdit(row)} className="text-blue-500 text-xs mr-2">编辑</button>
                        <button onClick={() => deleteRow(row.id)} className="text-red-400 text-xs">删除</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  return null
}
