const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { type, data } = event

  switch (type) {
    case 'addSignupsByDate':
      return await addSignupsByDate(data)
    case 'getRecords':
      return await getRecords(data)
    case 'deleteRecord':
      return await deleteRecord(data)
    case 'getActivities':
      return await getActivities(data)
    case 'getMonthlyReport':
      return await getMonthlyReport(data)
    case 'getPlayers':
      return await getPlayers()
    default:
      return { success: false, errMsg: '未知操作类型' }
  }
}

async function addSignupsByDate({ date, signupText }) {
  try {
    const exist = await db.collection('activities').where({ date }).get()
    if (exist.data.length > 0) {
      return { success: false, errMsg: `${date} 已有接龙记录，不能重复添加` }
    }

    const parsed = parseSignups(signupText)
    if (parsed.length === 0) {
      return { success: false, errMsg: '未能解析出参与人员' }
    }

    const playersRes = await db.collection('players').get()
    const playersByWxId = {}
    const playersByNick = {}
    playersRes.data.forEach(p => {
      if (p.wxId) playersByWxId[p.wxId] = p
      if (p.nickname) playersByNick[p.nickname] = p
      ;(p.aliases || []).forEach(a => { playersByNick[a] = p })
    })

    const signups = []
    for (const { wxId, nickname } of parsed) {
      let player = null
      if (wxId && playersByWxId[wxId]) player = playersByWxId[wxId]
      else if (nickname && playersByNick[nickname]) player = playersByNick[nickname]

      if (!player) {
        const addRes = await db.collection('players').add({
          data: { wxId: wxId || '', nickname: nickname || '', aliases: nickname ? [nickname] : [], createdAt: db.serverDate() }
        })
        signups.push({ wxId, nickname, playerId: addRes._id })
      } else {
        const updates = {}
        if (nickname && player.nickname !== nickname) {
          const aliases = player.aliases || []
          if (!aliases.includes(nickname)) aliases.push(nickname)
          updates.aliases = aliases
          if (!player.nickname && nickname) updates.nickname = nickname
          if (!player.wxId && wxId) updates.wxId = wxId
        }
        if (Object.keys(updates).length > 0) {
          await db.collection('players').doc(player._id).update({ data: updates })
        }
        signups.push({ wxId, nickname, playerId: player._id })
      }
    }

    await db.collection('activities').add({
      data: { date, title: `${date} 羽毛球`, signups, createdAt: db.serverDate() }
    })

    return { success: true, data: { total: signups.length, participants: signups } }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

function parseSignups(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const results = []
  let foundSignup = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (/接龙/.test(line)) {
      foundSignup = true
      continue
    }

    if (!foundSignup) continue

    const numbered = line.match(/^\s*\d+[\.、\)\s]\s*(.+)/)
    if (!numbered) continue

    let content = numbered[1].trim()
    if (!content) continue

    // 第一行带序号的是场地/截止信息，跳过
    if (results.length === 0 && /[场截止]/.test(content)) continue

    // 去掉时间段
    content = content.replace(/\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*$/g, '').trim()
    content = content.replace(/[\(（]\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*\s*[\)）]/g, '').trim()

    // 去掉末尾单独的数字（如 超人不会飞 1、安妮 2）
    content = content.replace(/\s+\d+$/g, '').trim()

    if (!content || content === '#') continue
    if (/接龙|统计|记录|截止|报名|替补|候补|总数|请接龙|场地|号场/.test(content)) continue

    // 展开 +数字（如 苏苏 +1 → 苏苏、苏苏1、苏苏2）
    const plusMatch = content.match(/^(.+?)\s*\+(\d+)\s*$/)
    if (plusMatch) {
      const base = plusMatch[1].trim()
      const count = parseInt(plusMatch[2])
      for (let j = 0; j <= count; j++) {
        const name = j === 0 ? base : base + j
        if (name) results.push({ wxId: '', nickname: name })
      }
      continue
    }

    let wxId = ''
    let nickname = content

    const m1 = content.match(/^(.+?)[（\(](\w+)[）\)]$/)
    if (m1) { nickname = m1[1].trim(); wxId = m1[2].trim() }

    const m2 = content.match(/^(.+?)\s+(\w+)$/)
    if (m2 && !wxId) { nickname = m2[1].trim(); wxId = m2[2].trim() }

    const m3 = content.match(/微信号[：:]\s*(\w+)/)
    if (m3 && !wxId) { wxId = m3[1].trim(); nickname = content.replace(/微信号[：:]\s*\w+/, '').trim() }

    if (nickname || wxId) {
      results.push({ wxId, nickname: nickname || wxId })
    }
  }

  return results
}

async function getRecords({ page = 0, pageSize = 50 } = {}) {
  try {
    const total = (await db.collection('activities').count()).total
    const res = await db.collection('activities').orderBy('date', 'desc').skip(page * pageSize).limit(pageSize).get()
    return { success: true, data: res.data, total }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

async function deleteRecord({ _id }) {
  try {
    await db.collection('activities').doc(_id).remove()
    return { success: true }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

async function getActivities({ year, month } = {}) {
  try {
    let query = {}
    if (year && month) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`
      const end = `${year}-${String(month).padStart(2, '0')}-31`
      query = { date: _.gte(start).and(_.lte(end)) }
    }
    const res = await db.collection('activities').where(query).orderBy('date', 'asc').get()
    return { success: true, data: res.data }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

async function getMonthlyReport({ year, month } = {}) {
  return await getActivities({ year, month })
}

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
