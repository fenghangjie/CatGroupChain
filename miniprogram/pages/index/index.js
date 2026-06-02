Page({
  data: {
    signupDate: '',
    signupText: '',
    parsedNames: [],
    records: [],
    loading: false,
    submitting: false,
    showToast: false,
    toastMsg: ''
  },

  onLoad() {
    const today = new Date()
    const ds = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    this.setData({ signupDate: ds })
    this.loadRecords()
  },

  onShow() {
    this.loadRecords()
  },

  onDateChange(e) {
    this.setData({ signupDate: e.detail.value })
  },

  onInput(e) {
    const text = e.detail.value
    this.setData({ signupText: text })
    const names = this.parseNames(text)
    this.setData({ parsedNames: names })
  },

  clearInput() {
    this.setData({ signupText: '', parsedNames: [] })
  },

  // 解析接龙文本（去序号、去时间段、提取微信号）
  parseNames(text) {
    const lines = text.split('\n').filter(l => l.trim())
    const results = []

    for (const line of lines) {
      let content = line.trim().replace(/^\s*\d+[\.、\)\s]\s*/, '').trim()
      if (!content) continue
      if (/接龙|统计|记录|截止|报名|替补|候补|总数|请接龙/.test(content)) continue

      // 去掉时间段
      content = content.replace(/\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*$/g, '').trim()
      content = content.replace(/[\(（]\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*\s*[\)）]/g, '').trim()
      content = content.replace(/\s*\d{1,2}\s*[点时]\s*$/g, '').trim()

      // 提取微信号和昵称
      let wxId = ''
      let nickname = content

      const match1 = content.match(/^(.+?)[（\(](\w+)[）\)]$/)
      if (match1) { nickname = match1[1].trim(); wxId = match1[2].trim() }

      const match2 = content.match(/^(.+?)\s+(\w+)$/)
      if (match2 && !wxId) { nickname = match2[1].trim(); wxId = match2[2].trim() }

      const match3 = content.match(/微信号[：:]\s*(\w+)/)
      if (match3 && !wxId) { wxId = match3[1].trim(); nickname = content.replace(/微信号[：:]\s*\w+/, '').trim() }

      const displayName = nickname || wxId || content
      if (displayName && displayName.length <= 10) {
        results.push(displayName)
      }
    }

    return results
  },

  async submit() {
    const { signupDate, signupText } = this.data
    if (!signupDate) { this.showToast('请选择日期'); return }
    if (!signupText.trim()) { this.showToast('请粘贴接龙内容'); return }

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: {
          type: 'addSignupsByDate',
          data: { date: signupDate, signupText }
        }
      })

      if (res.result.success) {
        this.showToast(`✅ 保存成功！${res.result.data.total}人参与`)
        this.setData({ signupText: '', parsedNames: [] })
        this.loadRecords()
      } else {
        this.showToast(res.result.errMsg || '保存失败')
      }
    } catch (e) {
      this.showToast('保存失败，请检查云函数')
    }
    this.setData({ submitting: false })
  },

  async loadRecords() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'getRecords' }
      })
      if (res.result.success) {
        const records = (res.result.data || []).map(r => {
          const names = (r.signups || []).map(s => s.nickname || s.wxId || '?')
          const preview = names.slice(0, 5).join(' ')
          return {
            ...r,
            previewText: names.length > 5 ? preview + ' …等' + names.length + '人' : preview
          }
        })
        this.setData({ records })
      }
    } catch (e) {
      console.error(e)
    }
    this.setData({ loading: false })
  },

  deleteRecord(e) {
    const { id, date } = e.currentTarget.dataset
    wx.showModal({
      title: '确认删除',
      content: `确定删除 ${date} 的记录吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await wx.cloud.callFunction({
              name: 'badminton',
              data: { type: 'deleteRecord', data: { _id: id } }
            })
            this.showToast('已删除')
            this.loadRecords()
          } catch (e) { this.showToast('删除失败') }
        }
      }
    })
  },

  viewRecord(e) {
    const record = e.currentTarget.dataset.record
    const names = (record.signups || []).map(s => s.nickname || s.wxId || '?').join('、')
    wx.showModal({ title: record.date, content: names, showCancel: false })
  },

  showToast(msg) {
    this.setData({ toastMsg: msg, showToast: true })
    setTimeout(() => { this.setData({ showToast: false }) }, 2000)
  }
})
