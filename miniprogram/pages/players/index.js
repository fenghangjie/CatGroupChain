Page({
  data: {
    players: [],
    loading: false
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
        data: { type: 'getPlayers' }
      })
      if (res.result.success) {
        const players = (res.result.data || []).map(p => ({
          ...p,
          avatarChar: (p.nickname || '?').slice(0, 1),
          aliasesText: p.aliases && p.aliases.length > 1 ? p.aliases.join('、') : ''
        }))
        this.setData({ players })
      }
    } catch (e) {
      console.error(e)
    }
    this.setData({ loading: false })
  }
})
