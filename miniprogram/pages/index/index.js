Page({
  data: {
    signupDate: '',
    signupText: '',
    parsedDate: '',
    parsedNames: [],
    records: [],
    loading: false,
    submitting: false,
    showToast: false,
    toastMsg: ''
  },

  onLoad() {
    this.loadRecords()
  },

  onShow() {
    this.loadRecords()
  },

  onInput(e) {
    const text = e.detail.value
    this.setData({ signupText: text })
    const { date, names } = this.parseText(text)
    this.setData({ parsedDate: date, parsedNames: names })
  },

  clearInput() {
    this.setData({ signupText: '', parsedDate: '', parsedNames: [] })
  },

  // 解析接龙文本：提取日期、跳过场地行、提取参与人
  parseText(text) {
    const lines = text.split('\n').filter(l => l.trim())
    let date = ''
    let names = []
    let foundSignup = false // 是否找到"接龙"行

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // 找到包含"接龙"的行，下一行就是日期
      if (/接龙/.test(line)) {
        foundSignup = true
        // 尝试从本行提取日期（如 "6月2日 羽毛球接龙"）
        const dateMatch = line.match(/(\d{1,2})月(\d{1,2})日/)
        if (dateMatch) {
          const now = new Date()
          const year = now.getFullYear()
          date = `${year}-${String(dateMatch[1]).padStart(2, '0')}-${String(dateMatch[2]).padStart(2, '0')}`
        }
        continue
      }

      // 如果上一步没从"接龙"行提取到日期，尝试从下一行提取
      if (foundSignup && !date && /月/.test(line)) {
        const dateMatch = line.match(/(\d{1,2})月(\d{1,2})日/)
        if (dateMatch) {
          const now = new Date()
          const year = now.getFullYear()
          date = `${year}-${String(dateMatch[1]).padStart(2, '0')}-${String(dateMatch[2]).padStart(2, '0')}`
        } else {
          // 可能日期是单独一行，如 "6月2日"
          const m = line.match(/^(\d{1,2})月(\d{1,2})日$/)
          if (m) {
            const now = new Date()
            date = `${now.getFullYear()}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
          }
          // 已经过了日期行，后面继续处理人员
        }
        continue
      }

      // 数字序号开头的行
      const numbered = line.match(/^\s*\d+[\.、\)\s]\s*(.+)/)
      if (!numbered) continue

      let content = numbered[1].trim()
      if (!content) continue

      // 第一行序号是场地信息（如 "1. 1号场 8-10"），跳过
      if (names.length === 0 && /[场号]/.test(content)) {
        continue
      }

      // 过滤非人名行
      if (/接龙|统计|记录|截止|报名|替补|候补|总数|请接龙|场地|号场/.test(content)) continue

      // 去掉时间段
      content = content.replace(/\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*$/g, '').trim()
      content = content.replace(/[\(（]\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*\s*[\)）]/g, '').trim()
      content = content.replace(/\s*\d{1,2}\s*[点时]\s*$/g, '').trim()
      if (!content) continue

      // 提取微信号和昵称
      let wxId = ''
      let nickname = content

      const m1 = content.match(/^(.+?)[（\(](\w+)[）\)]$/)
      if (m1) { nickname = m1[1].trim(); wxId = m1[2].trim() }

      const m2 = content.match(/^(.+?)\s+(\w+)$/)
      if (m2 && !wxId) { nickname = m2[1].trim(); wxId = m2[2].trim() }

      const m3 = content.match(/微信号[：:]\s*(\w+)/)
      if (m3 && !wxId) { wxId = m3[1].trim(); nickname = content.replace(/微信号[：:]\s*\w+/, '').trim() }

      const displayName = nickname || wxId || content
      if (displayName && displayName.length <= 10) {
        names.push(displayName)
      }
    }

    return { date, names }
  },

  async submit() {
    const { parsedDate, parsedNames, signupText } = this.data
    if (!parsedDate) { this.showToast('未能识别出日期，请确保接龙中包含日期'); return }
    if (parsedNames.length === 0) { this.showToast('未能识别出参与人员'); return }

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: {
          type: 'addSignupsByDate',
          data: { date: parsedDate, signupText }
        }
      })

      if (res.result.success) {
        this.showToast(`✅ 保存成功！${res.result.data.total}人参与`)
        this.setData({ signupText: '', parsedDate: '', parsedNames: [] })
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
