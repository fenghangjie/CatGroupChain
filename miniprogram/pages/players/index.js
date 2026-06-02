Page({
  data: {
    collapsed: true,
    players: [],
    loading: false,
    showToast: false,
    toastMsg: ''
  },

  onLoad() {
    this.loadPlayers()
  },

  onShow() {
    this.loadPlayers()
  },

  async loadPlayers() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: {
    collapsed: true, type: 'getPlayers' }
      })
      if (res.result.success) {
        const players = (res.result.data || []).map(p => ({
          ...p,
          avatarChar: (p.nickname || '?').slice(0, 1),
          aliasesText: p.aliases && p.aliases.length > 1 ? p.aliases.join('、') : ''
        }))
        this.setData({ players })
      }
    } catch (e) { console.error(e) }
    this.setData({ loading: false })
  },

  clearAllData() {
    const that = this
    wx.showModal({
      title: '⚠️ 确认清除',
      content: '确定要清除所有接龙记录和成员数据吗？此操作不可恢复！',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清除中...' })
          try {
            const r = await wx.cloud.callFunction({
              name: 'badminton',
              data: {
    collapsed: true, type: 'clearAll' }
            })
            wx.hideLoading()
            if (r.result.success) {
              that.showToast('✅ ' + r.result.message)
              that.loadPlayers()
            } else {
              that.showToast('清除失败')
            }
          } catch (e) {
            wx.hideLoading()
            that.showToast('清除失败')
          }
        }
      }
    })
  },

  toggleCollapse() {
    this.setData({ collapsed: !this.data.collapsed })
  },

  showToast(msg) {
    this.setData({ toastMsg: msg, showToast: true })
    setTimeout(() => { this.setData({ showToast: false }) }, 2000)
  }
})
