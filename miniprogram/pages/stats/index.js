Page({
  data: {
    stats: [],
    totalRecords: 0,
    totalPlayers: 0,
    totalAttendance: 0,
    maxCount: 0,
    loading: false
  },

  onLoad() {
    this.loadStats()
  },

  onShow() {
    this.loadStats()
  },

  async loadStats() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'getPlayerStats' }
      })

      if (res.result.success) {
        const stats = res.result.data
        const maxCount = stats.length > 0 ? stats[0].count : 0

        this.setData({
          stats,
          maxCount,
          totalRecords: res.result.totalRecords,
          totalPlayers: res.result.totalPlayers,
          totalAttendance: res.result.totalAttendance
        })
      }
    } catch (e) {
      console.error(e)
    }
    this.setData({ loading: false })
  }
})
