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
    adminInputOpenid: '',
    adminInputName: ''
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
        const r = res.result; console.log('checkAdmin result:', r); this.setData({ isAdmin: r.isAdmin, isSuperAdmin: r.isSuperAdmin })
        if (res.result.isSuperAdmin) this.loadAdmins()
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

  onAdminOpenidInput(e) {
    this.setData({ adminInputOpenid: e.detail.value })
  },

  onAdminNameInput(e) {
    this.setData({ adminInputName: e.detail.value })
  },

  async addAdmin() {
    const openid = this.data.adminInputOpenid.trim()
    const name = this.data.adminInputName.trim()
    if (!openid) { this.showToast('请输入微信号openid'); return }
    wx.showLoading({ title: '添加中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'badminton',
        data: { type: 'addAdmin', data: { openid, name } }
      })
      wx.hideLoading()
      if (res.result.success) {
        this.showToast('✅ 添加成功')
        this.setData({ adminInputOpenid: '', adminInputName: '' })
        this.loadAdmins()
      } else {
        this.showToast(res.result.errMsg || '添加失败')
      }
    } catch (e) { wx.hideLoading(); this.showToast('添加失败') }
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
