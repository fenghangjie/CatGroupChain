Page({
  data: {
    year: 0,
    month: 0,
    dates: [],
    dateLabels: [],
    report: [],
    totalActivities: 0,
    totalPlayers: 0,
    totalAttendance: 0,
    maxCount: 0,
    loading: false
  },

  onLoad() {
    const now = new Date()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1
    })
    this.loadReport()
  },

  onShow() {
    this.loadReport()
  },

  prevMonth() {
    let { year, month } = this.data
    month--
    if (month < 1) { month = 12; year-- }
    this.setData({ year, month })
    this.loadReport()
  },

  nextMonth() {
    let { year, month } = this.data
    month++
    if (month > 12) { month = 1; year++ }
    this.setData({ year, month })
    this.loadReport()
  },

  async loadReport() {
    const { year, month } = this.data
    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: {
          type: 'getActivities',
          data: { year, month }
        }
      })

      if (!res.result.success) {
        this.setData({ loading: false })
        return
      }

      const activities = res.result.data
      const result = this.computeReport(activities, year, month)

      this.setData({
        ...result,
        loading: false
      })
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  },

  computeReport(activities, year, month) {
    const attendanceMap = {}
    for (const act of activities) {
      const signups = act.signups || []
      for (const s of signups) {
        if (!s.playerId) continue
        if (!attendanceMap[s.playerId]) {
          attendanceMap[s.playerId] = { count: 0, days: [], wxId: '', nickname: '' }
        }
        attendanceMap[s.playerId].count += 1
        attendanceMap[s.playerId].days.push(act.date)
        if (s.wxId) attendanceMap[s.playerId].wxId = s.wxId
        if (s.nickname) attendanceMap[s.playerId].nickname = s.nickname
      }
    }

    const report = Object.entries(attendanceMap).map(([playerId, info]) => ({
      playerId,
      wxId: info.wxId,
      nickname: info.nickname || info.wxId || '未知',
      count: info.count,
      days: info.days.sort()
    }))
    report.sort((a, b) => b.count - a.count)
    report.forEach((item, i) => { item.rank = i + 1 })

    const allDates = [...new Set(activities.map(a => a.date))].sort()
    // 预处理日期标签（只显示日）
    const dateLabels = allDates.map(d => d.slice(8, 10) + '日')

    const matrix = report.map(person => {
      const daySet = new Set(person.days)
      return {
        ...person,
        attendance: allDates.map(d => daySet.has(d))
      }
    })

    const maxCount = report.length > 0 ? report[0].count : 0
    const totalAttendance = report.reduce((s, i) => s + i.count, 0)

    return {
      dates: allDates,
      dateLabels,
      report: matrix,
      totalActivities: activities.length,
      totalPlayers: report.length,
      totalAttendance,
      maxCount
    }
  }
})
