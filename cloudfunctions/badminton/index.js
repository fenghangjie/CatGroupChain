const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { type, data } = event

  switch (type) {
    case 'createActivity':
      return await createActivity(data)
    case 'getActivities':
      return await getActivities(data)
    case 'addSignups':
      return await addSignups(data)
    case 'deleteActivity':
      return await deleteActivity(data)
    case 'getMonthlyReport':
      return await getMonthlyReport(data)
    case 'getPlayers':
      return await getPlayers()
    default:
      return { success: false, errMsg: '未知操作类型' }
  }
}

// 创建活动
async function createActivity({ date, title }) {
  try {
    const exist = await db.collection('activities').where({ date }).get()
    if (exist.data.length > 0) {
      return { success: false, errMsg: '该日期已有活动' }
    }
    const res = await db.collection('activities').add({
      data: {
        date,
        title: title || `${date} 羽毛球`,
        signups: [],
        createdAt: db.serverDate()
      }
    })
    return { success: true, data: res._id }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

// 获取活动列表
async function getActivities({ year, month } = {}) {
  try {
    let query = {}
    if (year && month) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`
      const end = `${year}-${String(month).padStart(2, '0')}-31`
      query = { date: _.gte(start).and(_.lte(end)) }
    }

    // 先查总数量
    const countRes = await db.collection('activities').where(query).count()
    // 再查数据（查全部，按月的话数量不会太多）
    const res = await db.collection('activities')
      .where(query)
      .orderBy('date', 'desc')
      .get()

    return {
      success: true,
      data: res.data,
      total: countRes.total
    }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

// 添加接龙数据到活动（解析并匹配微信号）
async function addSignups({ activityId, signupText }) {
  try {
    // 获取活动
    const actRes = await db.collection('activities').doc(activityId).get()
    if (!actRes.data) {
      return { success: false, errMsg: '活动不存在' }
    }
    const activity = actRes.data

    // 解析接龙文本
    const parsed = parseSignups(signupText)
    if (parsed.length === 0) {
      return { success: false, errMsg: '未能解析出参与人员' }
    }

    // 获取已有 players 做匹配
    const playersRes = await db.collection('players').get()
    const playersByWxId = {}
    const playersByNickname = {}
    playersRes.data.forEach(p => {
      if (p.wxId) playersByWxId[p.wxId] = p
      if (p.nickname) playersByNickname[p.nickname] = p
      ;(p.aliases || []).forEach(a => { playersByNickname[a] = p })
    })

    // 解析出结构化的参与人
    const newSignups = []
    const newPlayers = []

    for (const { wxId, nickname } of parsed) {
      let player = null

      if (wxId && playersByWxId[wxId]) {
        player = playersByWxId[wxId]
      } else if (nickname && playersByNickname[nickname]) {
        player = playersByNickname[nickname]
      }

      if (!player) {
        // 新成员
        const addRes = await db.collection('players').add({
          data: {
            wxId: wxId || '',
            nickname: nickname || '',
            aliases: nickname ? [nickname] : [],
            createdAt: db.serverDate()
          }
        })
        newPlayers.push({ wxId, nickname })
        newSignups.push({ wxId, nickname, playerId: addRes._id })
      } else {
        // 老成员，更新昵称/别名
        const updates = {}
        if (nickname && player.nickname !== nickname) {
          const aliases = player.aliases || []
          if (!aliases.includes(nickname)) {
            aliases.push(nickname)
            updates.aliases = aliases
          }
          // 如果还没有微信号但有，补上
          if (!player.wxId && wxId) updates.wxId = wxId
          // 如果没有昵称，补上
          if (!player.nickname && nickname) updates.nickname = nickname
        }
        if (Object.keys(updates).length > 0) {
          await db.collection('players').doc(player._id).update({ data: updates })
        }
        newSignups.push({ wxId, nickname, playerId: player._id })
      }
    }

    // 合并到活动（去重：同一个人不能在同一天签到两次）
    const existing = new Set(
      (activity.signups || []).map(s => s.playerId)
    )
    const toAdd = newSignups.filter(s => !existing.has(s.playerId))
    const merged = [...(activity.signups || []), ...toAdd]

    await db.collection('activities').doc(activityId).update({
      data: { signups: merged }
    })

    return {
      success: true,
      data: {
        total: merged.length,
       新增: toAdd.length,
        participants: merged
      }
    }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

// 解析接龙文本
// 支持格式：
//   1. 张三(zhangsan)
//   2. 张三 zhangsan
//   3. 张三（微信号：zhangsan）
//   4. 张三
function parseSignups(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const results = []

  for (const line of lines) {
    // 去掉序号前缀
    let content = line.trim().replace(/^\s*\d+[\.、\)\s]\s*/, '').trim()
    if (!content) continue

    // 过滤非人名行
    if (/接龙|统计|记录|截止|报名|替补|候补|总数|截止|请接龙/.test(content)) continue

    // 去掉时间段，如 8-10、8～10、7:00～10:00、20-22点、8点 等
    content = content.replace(/\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*$/g, '').trim()
    content = content.replace(/[\(（]\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*\s*[\)）]/g, '').trim()
    content = content.replace(/\s*\d{1,2}\s*[点时]\s*$/g, '').trim()

    // 尝试提取微信号
    let wxId = ''
    let nickname = content

    // 格式：张三(zhangsan) 或 张三（zhangsan）
    const match1 = content.match(/^(.+?)[（\(](\w+)[）\)]$/)
    if (match1) {
      nickname = match1[1].trim()
      wxId = match1[2].trim()
    }

    // 格式：张三 zhangsan
    const match2 = content.match(/^(.+?)\s+(\w+)$/)
    if (match2 && !wxId) {
      nickname = match2[1].trim()
      wxId = match2[2].trim()
    }

    // 格式：微信号：zhangsan
    const match3 = content.match(/微信号[：:]\s*(\w+)/)
    if (match3 && !wxId) {
      wxId = match3[1].trim()
      nickname = content.replace(/微信号[：:]\s*\w+/, '').trim()
    }

    if (nickname || wxId) {
      results.push({ wxId, nickname: nickname || wxId })
    }
  }

  return results
}

// 删除活动
async function deleteActivity({ _id }) {
  try {
    await db.collection('activities').doc(_id).remove()
    return { success: true }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

// 月度考勤报告
async function getMonthlyReport({ year, month }) {
  try {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-31`

    // 获取当月所有活动
    const actRes = await db.collection('activities')
      .where({ date: _.gte(start).and(_.lte(end)) })
      .orderBy('date', 'asc')
      .get()

    const activities = actRes.data

    // 统计每个人的出勤
    const attendanceMap = {} // playerId -> { count, days: [], wxId, nickname }

    for (const act of activities) {
      const signups = act.signups || []
      for (const s of signups) {
        if (!s.playerId) continue
        if (!attendanceMap[s.playerId]) {
          attendanceMap[s.playerId] = {
            count: 0,
            days: [],
            wxId: s.wxId || '',
            nickname: s.nickname || ''
          }
        }
        attendanceMap[s.playerId].count += 1
        attendanceMap[s.playerId].days.push(act.date)
      }
    }

    // 获取所有 player 详细信息
    const playersRes = await db.collection('players').get()
    const playerMap = {}
    playersRes.data.forEach(p => {
      playerMap[p._id] = p
    })

    // 组装考勤数据
    const report = Object.entries(attendanceMap).map(([playerId, info]) => {
      const player = playerMap[playerId]
      return {
        playerId,
        wxId: info.wxId || (player ? player.wxId : ''),
        nickname: info.nickname || (player ? (player.nickname || (player.aliases && player.aliases[0]) || '') : ''),
        aliases: player ? (player.aliases || []) : [],
        count: info.count,
        days: info.days.sort()
      }
    })

    // 按出勤次数降序排列
    report.sort((a, b) => b.count - a.count)
    report.forEach((item, i) => { item.rank = i + 1 })

    // 构建考勤矩阵：行=人，列=日期
    const allDates = [...new Set(activities.map(a => a.date))].sort()
    const matrix = report.map(person => {
      const daySet = new Set(person.days)
      return {
        ...person,
        attendance: allDates.map(d => daySet.has(d))
      }
    })

    return {
      success: true,
      data: {
        year,
        month,
        totalActivities: activities.length,
        totalPlayers: report.length,
        report,
        matrix,
        dates: allDates
      }
    }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

// 获取所有成员
async function getPlayers() {
  try {
    const res = await db.collection('players').orderBy('createdAt', 'asc').get()
    const data = res.data.map(p => ({
      _id: p._id,
      wxId: p.wxId || '',
      nickname: p.nickname || (p.aliases && p.aliases[0]) || '',
      aliases: p.aliases || []
    }))
    return { success: true, data }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}
