Page({
  data: {
    newDate: '',
    newTitle: '',
    activities: [],
    loading: false,
    creating: false,
    showSignupModal: false,
    signupActivity: null,
    signupText: '',
    submitting: false,
    showToast: false,
    toastMsg: ''
  },

  onLoad() {
    // 默认今天日期
    const today = new Date()
    const ds = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    this.setData({ newDate: ds })
    this.loadActivities()
  },

  onShow() {
    this.loadActivities()
  },

  onDateChange(e) {
    this.setData({ newDate: e.detail.value })
  },

  onTitleInput(e) {
    this.setData({ newTitle: e.detail.value })
  },

  onSignupInput(e) {
    this.setData({ signupText: e.detail.value })
  },

  // 发布活动
  async createActivity() {
    const { newDate, newTitle } = this.data
    if (!newDate) {
      this.showToast('请选择日期')
      return
    }
    this.setData({ creating: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: {
          type: 'createActivity',
          data: { date: newDate, title: newTitle || `${newDate} 羽毛球` }
        }
      })
      if (res.result.success) {
        this.showToast('✅ 活动已发布')
        this.setData({ newTitle: '' })
        this.loadActivities()
      } else {
        this.showToast(res.result.errMsg || '发布失败')
      }
    } catch (e) {
      this.showToast('发布失败，请检查云函数')
    }
    this.setData({ creating: false })
  },

  // 加载活动列表
  async loadActivities() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'getActivities' }
      })
      if (res.result.success) {
        this.setData({ activities: res.result.data })
      }
    } catch (e) {
      console.error(e)
    }
    this.setData({ loading: false })
  },

  // 显示录入弹窗
  showSignupInput(e) {
    const activity = e.currentTarget.dataset.activity
    this.setData({
      showSignupModal: true,
      signupActivity: activity,
      signupText: ''
    })
  },

  // 隐藏录入弹窗
  hideSignupInput() {
    this.setData({
      showSignupModal: false,
      signupActivity: null,
      signupText: ''
    })
  },

  // 提交接龙数据
  async submitSignups() {
    const { signupActivity, signupText } = this.data
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
          data: {
            activityId: signupActivity._id,
            signupText: signupText
          }
        }
      })

      if (res.result.success) {
        const d = res.result.data
        this.showToast(`✅ 录入成功！共${d.total}人参与`)
        this.hideSignupInput()
        this.loadActivities()
      } else {
        this.showToast(res.result.errMsg || '录入失败')
      }
    } catch (e) {
      this.showToast('录入失败')
    }
    this.setData({ submitting: false })
  },

  // 删除活动
  deleteActivity(e) {
    const { id, date } = e.currentTarget.dataset
    const that = this
    wx.showModal({
      title: '确认删除',
      content: `确定删除 ${date} 的活动吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await wx.cloud.callFunction({
              name: 'badminton',
              data: { type: 'deleteActivity', data: { _id: id } }
            })
            that.showToast('已删除')
            that.loadActivities()
          } catch (e) {
            that.showToast('删除失败')
          }
        }
      }
    })
  },

  showToast(msg) {
    this.setData({ toastMsg: msg, showToast: true })
    setTimeout(() => { this.setData({ showToast: false }) }, 2000)
  }
})
