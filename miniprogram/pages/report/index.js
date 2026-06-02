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
    loading: false,
    viewMode: 'month',
    yearReport: []
  },

  onLoad() {
    const now = new Date()
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 })
    this.loadReport()
  },

  onShow() {
    if (this.data.viewMode === 'month') this.loadReport()
  },

  switchView(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ viewMode: mode })
    if (mode === 'year') {
      this.loadYearReport()
    } else {
      this.loadReport()
    }
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

  prevYear() {
    this.setData({ year: this.data.year - 1 })
    if (this.data.viewMode === 'year') this.loadYearReport()
    else this.loadReport()
  },

  nextYear() {
    this.setData({ year: this.data.year + 1 })
    if (this.data.viewMode === 'year') this.loadYearReport()
    else this.loadReport()
  },

  async loadReport() {
    const { year, month } = this.data
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'getActivities', data: { year, month } }
      })
      if (res.result.success) {
        const activities = res.result.data
        const result = this.computeReport(activities, year, month)
        this.setData({ ...result, loading: false })
      } else {
        this.setData({ loading: false })
      }
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
    const dateLabels = allDates.map(d => d.slice(8, 10) + '日')
    const matrix = report.map(person => {
      const daySet = new Set(person.days)
      return { ...person, attendance: allDates.map(d => daySet.has(d)) }
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
  },

  async loadYearReport() {
    this.setData({ loading: true })
    try {
      const year = this.data.year
      const report = []
      let totalActivities = 0
      let totalAttendance = 0
      const allPlayerIds = new Set()

      for (let m = 1; m <= 12; m++) {
        const res = await wx.cloud.callFunction({
          name: 'badminton',
          data: { type: 'getActivities', data: { year, month: m } }
        })
        if (res.result.success) {
          const acts = res.result.data
          const attendance = acts.reduce((s, a) => s + (a.signups || []).length, 0)
          report.push({ month: m, monthName: m + '月', count: acts.length, attendance })
          totalActivities += acts.length
          totalAttendance += attendance
          for (const act of acts) {
            for (const s of (act.signups || [])) {
              if (s.playerId) allPlayerIds.add(s.playerId)
            }
          }
        }
      }
      this.setData({
        yearReport: report,
        report: [],
        totalActivities,
        totalPlayers: allPlayerIds.size,
        totalAttendance,
        maxCount: 0,
        loading: false
      })
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  },

  viewPlayer(e) {
    const name = e.currentTarget.dataset.name
    const player = this.data.report.find(s => s.playerId === e.currentTarget.dataset.playerid)
    if (player) {
      wx.showModal({ title: name, content: '本月出勤：' + player.count + ' 次', showCancel: false })
    } else {
      wx.showModal({ title: name, content: '暂无数据', showCancel: false })
    }
  }
})