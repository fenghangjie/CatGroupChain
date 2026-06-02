Page({
  data: {
    activityId: '',
    activityDate: '',
    activityTitle: '',
    signupText: '',
    parsedNames: [],
    submitting: false,
    autoFocus: false,
    showToast: false,
    toastMsg: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        activityId: options.id,
        activityDate: options.date || '',
        activityTitle: options.title || `${options.date} 羽毛球`
      })
      // 延迟聚焦，让页面先渲染
      setTimeout(() => {
        this.setData({ autoFocus: true })
      }, 500)
    }
  },

  onInput(e) {
    const text = e.detail.value
    this.setData({ signupText: text })

    // 实时预览解析结果
    const names = this.parseNames(text)
    this.setData({ parsedNames: names })
  },

  parseNames(text) {
    const lines = text.split('\n').filter(l => l.trim())
    const names = []

    for (const line of lines) {
      let content = line.trim().replace(/^\s*\d+[\.、\)\s]\s*/, '').trim()
      if (!content) continue
      if (/接龙|统计|记录|截止|报名|替补|候补|总数|请接龙/.test(content)) continue

      // 尝试提取微信号
      let nickname = content
      const match1 = content.match(/^(.+?)[（\(](\w+)[）\)]$/)
      if (match1) nickname = match1[1].trim()

      const match2 = content.match(/^(.+?)\s+(\w+)$/)
      if (match2 && !match1) nickname = match2[1].trim()

      if (nickname && nickname.length <= 10) {
        names.push(nickname)
      }
    }

    return names
  },

  async submit() {
    const { activityId, signupText } = this.data
    if (!signupText.trim()) {
      this.showToast('请粘贴接龙内容')
      return
    }

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: {
          type: 'addSignups',
          data: { activityId, signupText }
        }
      })

      if (res.result.success) {
        this.showToast('✅ 录入成功！')
        setTimeout(() => {
          wx.navigateBack()
        }, 1000)
      } else {
        this.showToast(res.result.errMsg || '录入失败')
      }
    } catch (e) {
      this.showToast('录入失败，请检查云函数')
    }
    this.setData({ submitting: false })
  },

  goBack() {
    wx.navigateBack()
  },

  showToast(msg) {
    this.setData({ toastMsg: msg, showToast: true })
    setTimeout(() => { this.setData({ showToast: false }) }, 2000)
  }
})
