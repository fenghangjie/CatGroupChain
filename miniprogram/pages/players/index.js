Page({
  data: {
    collapsed: true,
    players: [],
    loading: false,
    showToast: false,
    toastMsg: '',
    isSuperAdmin: false,
    isAdmin: false,
    admins: [],
    generatedCode: '',
    inviteCode: ''
  },

  onLoad() {
    this.checkAdmin()
    this.loadPlayers()
  },

  onShow() {
    this.checkAdmin()
    this.loadPlayers()
  },

  async checkAdmin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'checkAdmin' }
      })
      if (res.result.success) {
        const r = res.result
        console.log('checkAdmin result:', r)
        this.setData({ isAdmin: r.isAdmin, isSuperAdmin: r.isSuperAdmin })
        if (r.isSuperAdmin) this.loadAdmins()
      }
    } catch (e) { console.error(e) }
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
    } catch (e) { console.error(e) }
    this.setData({ loading: false })
  },

  toggleCollapse() {
    this.setData({ collapsed: !this.data.collapsed })
  },

  // Invite code: super admin generates
  async genInviteCode() {
    wx.showLoading({ title: '生成中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'genInviteCode' }
      })
      wx.hideLoading()
      if (res.result.success) {
        this.setData({ generatedCode: res.result.code })
      } else {
        this.showToast(res.result.errMsg || '生成失败')
      }
    } catch (e) { wx.hideLoading(); this.showToast('生成失败') }
  },

  // Invite code: normal user redeems
  onInviteCodeInput(e) {
    this.setData({ inviteCode: e.detail.value.toUpperCase() })
  },

  async redeemInviteCode() {
    const code = this.data.inviteCode.trim()
    if (code.length < 4) { this.showToast('请输入有效的邀请码'); return }
    wx.showLoading({ title: '兑换中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'redeemInviteCode', data: { code } }
      })
      wx.hideLoading()
      if (res.result.success) {
        this.showToast(res.result.message || '✅ 兑换成功！')
        this.setData({ inviteCode: '', isAdmin: true })
        this.checkAdmin()
      } else {
        this.showToast(res.result.errMsg || '兑换失败')
      }
    } catch (e) { wx.hideLoading(); this.showToast('兑换失败') }
  },

  // Admin management
  async loadAdmins() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'getAdmins' }
      })
      if (res.result.success) {
        this.setData({ admins: res.result.data || [] })
      }
    } catch (e) { console.error(e) }
  },

  async removeAdmin(e) {
    const openid = e.currentTarget.dataset.openid
    wx.showModal({
      title: '确认移除',
      content: '确定移除该管理员吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '移除中...' })
          try {
            const r = await wx.cloud.callFunction({
              name: 'badminton',
              data: { type: 'removeAdmin', data: { openid } }
            })
            wx.hideLoading()
            if (r.result.success) {
              this.showToast('已移除')
              this.loadAdmins()
            } else {
              this.showToast(r.result.errMsg || '移除失败')
            }
          } catch (e) { wx.hideLoading(); this.showToast('移除失败') }
        }
      }
    })
  },

  showToast(msg) {
    this.setData({ toastMsg: msg, showToast: true })
    setTimeout(() => { this.setData({ showToast: false }) }, 2000)
  }
})
