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


  toggleCollapse() {
    this.setData({ collapsed: !this.data.collapsed })
  },

  showToast(msg) {
    this.setData({ toastMsg: msg, showToast: true })
    setTimeout(() => { this.setData({ showToast: false }) }, 2000)
  }
})
