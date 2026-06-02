Page({
  data: {
    isAdmin: false,
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
    this.checkAdmin()
    this.loadRecords()
  },

  onShow() {
    this.checkAdmin()
    this.loadRecords()
  },

  async checkAdmin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'checkAdmin' }
      })
      this.setData({ isAdmin: res.result.success && res.result.isAdmin })
    } catch (e) {
      this.setData({ isAdmin: false })
    }
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

  // 解析接龙文本
  parseText(text) {
    const lines = text.split('\n').filter(l => l.trim())
    let date = ''
    let names = []
    let isFirstLine = true
    let foundSignup = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (/接龙/.test(line)) {
        foundSignup = true
        continue
      }

      if (foundSignup) {
        // 提取日期：支持 6月3日、6.3、6.3 周几 等格式
        if (!date) {
          let dm = null
          dm = line.match(/(\d{1,2})月(\d{1,2})日?/)
          if (dm) {
            date = `2026-${String(dm[1]).padStart(2,'0')}-${String(dm[2]).padStart(2,'0')}`
          } else {
            dm = line.match(/^(\d{1,2})\.(\d{1,2})(?:\D|$)/)
            if (dm) {
              date = `2026-${String(dm[1]).padStart(2,'0')}-${String(dm[2]).padStart(2,'0')}`
            }
          }
          if (date) continue
        }

        const numbered = line.match(/^\s*\d+[\.、\)]\s+(.+)/)
        if (!numbered) continue
        let content = numbered[1].trim()
        if (!content) continue

        // 第一行带序号的是场地/截止信息，跳过
        if (isFirstLine) { isFirstLine = false; continue }  // 第一行序号跳过

        // 去掉时间段
        content = content.replace(/\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*$/g, '').trim()
        content = content.replace(/(\D)\s+(\d+)$/g, '$1$2').trim()  // 安妮 2 → 安妮2
        content = content.replace(/[\(（]\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*\s*[\)）]/g, '').trim()

        if (!content || content === '#') continue
        if (/接龙|统计|记录|截止|报名|替补|候补|总数|请接龙|场地|号场|禁止|谢绝|未按要求|[闭关]/.test(content)) continue

        // 展开 +数字（如 苏苏 +1 → 苏苏、苏苏1、苏苏2）
        const plusMatch = content.match(/^(.+?)\s*\+(\d+)\s*$/)
        if (plusMatch) {
          const base = plusMatch[1].trim()
          const count = parseInt(plusMatch[2])
          // 不添加本人（已在前面出现），只展开 +1 +2
          for (let j = 1; j <= count; j++) {
            names.push(base + j)
          }
        } else {
          names.push(content)
        }
      }
    }

    return { date, names }
  },

  async submit() {
    const { parsedDate, parsedNames, signupText } = this.data
    if (!parsedDate) { this.showToast('未能识别出日期'); return }
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
          return { ...r, previewText: names.length > 5 ? preview + ' …等' + names.length + '人' : preview }
        })
        this.setData({ records })
      }
    } catch (e) { console.error(e) }
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
              name: 'badminton', data: { type: 'deleteRecord', data: { _id: id } }
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
