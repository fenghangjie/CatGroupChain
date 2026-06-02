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
        this.setData({ players: res.result.data })
      }
    } catch (e) {
      console.error(e)
    }
    this.setData({ loading: false })
  }
})
