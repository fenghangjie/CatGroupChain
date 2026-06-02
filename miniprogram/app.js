// app.js
App({
  globalData: {
    // 环境 ID，需要在微信开发者工具中替换为实际的环境 ID
    env: 'cloud1-d7gsqtvz1b720b887'
  },
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true
      })
    }
  }
})
