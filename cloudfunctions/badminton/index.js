const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 超级管理员（硬编码）
const SUPER_ADMIN = 'oN-VR44CJa2LZLS8BvlLdfpaagXM'

async function checkAdmin(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) throw new Error('获取用户身份失败')
  if (openid === SUPER_ADMIN) return // 超级管理员通过
  // 检查 admins 集合
  const adminRes = await db.collection('admins').where({ openid }).get()
  if (adminRes.data.length === 0) {
    throw new Error('无操作权限，仅管理员可执行此操作')
  }
}

async function checkSuperAdmin(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (openid !== SUPER_ADMIN) {
    throw new Error('仅超级管理员可执行此操作')
  }
}

exports.main = async (event, context) => {
  const { type, data } = event

  switch (type) {
    case 'addSignupsByDate':
      await checkAdmin(event)
      return await addSignupsByDate(data)
    case 'getRecords':
      return await getRecords(data)
    case 'deleteRecord':
      await checkAdmin(event)
      return await deleteRecord(data)
    case 'clearAll':
      await checkAdmin(event)
      return await clearAll()
    case 'getActivities':
      return await getActivities(data)
    case 'getMonthlyReport':
      return await getMonthlyReport(data)
    case 'checkAdmin':
      try {
        const wxContext = cloud.getWXContext()
        const openid = wxContext.OPENID
        let isAdmin = false
        let isSuperAdmin = false
        if (openid === SUPER_ADMIN) {
          isAdmin = true
          isSuperAdmin = true
        } else {
          const adminRes = await db.collection('admins').where({ openid }).get()
          isAdmin = adminRes.data.length > 0
        }
        return { success: true, isAdmin, isSuperAdmin, openid }
      } catch (e) {
        return { success: false, isAdmin: false, isSuperAdmin: false, errMsg: e.message }
      }
    case 'getPlayers':
      return await getPlayers()
    case 'addAdmin':
      await checkSuperAdmin(event)
      return await addAdmin(data)
    case 'removeAdmin':
      await checkSuperAdmin(event)
      return await removeAdmin(data)
    case 'getAdmins':
      await checkSuperAdmin(event)
      return await getAdmins()
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
  let isFirstLine = true
  let foundSignup = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (/接龙/.test(line)) {
      foundSignup = true
      continue
    }

    if (!foundSignup) continue

    const numbered = line.match(/^\s*\d+[\.、\)]\s+(.+)/)
    if (!numbered) continue

    let content = numbered[1].trim()
    if (!content) continue

    if (isFirstLine) { isFirstLine = false; continue }  // 第一行序号跳过

    content = content.replace(/\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*$/g, '').trim()
        content = content.replace(/(\D)\s+(\d+)$/g, '$1$2').trim()  // 安妮 2 → 安妮2
    content = content.replace(/[\(（]\s*\d{1,2}[:：]?\d{0,2}\s*[~～\-—]\s*\d{1,2}[:：]?\d{0,2}\s*[点时]*\s*[\)）]/g, '').trim()

    if (!content) continue
    if (/接龙|统计|记录|截止|报名|替补|候补|总数|请接龙|场地|号场|禁止|谢绝|未按要求|[闭关]/.test(content)) continue

    const plusMatch = content.match(/^(.+?)\s*\+(\d+)\s*$/)
    if (plusMatch) {
      const base = plusMatch[1].trim()
      const count = parseInt(plusMatch[2])
      for (let j = 1; j <= count; j++) {
        results.push({ wxId: '', nickname: base + j })
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

async function clearAll() {
  try {
    // 删除所有 activities
    const activities = await db.collection('activities').get()
    const deleteActs = activities.data.map(a => db.collection('activities').doc(a._id).remove())
    await Promise.all(deleteActs)

    // 删除所有 players
    const players = await db.collection('players').get()
    const deletePls = players.data.map(p => db.collection('players').doc(p._id).remove())
    await Promise.all(deletePls)

    return { success: true, message: `已清除 ${activities.data.length} 条接龙记录和 ${players.data.length} 个成员` }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
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

async function addAdmin({ openid, name }) {
  try {
    if (!openid) return { success: false, errMsg: '缺少openid' }
    if (openid === SUPER_ADMIN) return { success: false, errMsg: '超级管理员无需添加' }
    const exist = await db.collection('admins').where({ openid }).get()
    if (exist.data.length > 0) return { success: false, errMsg: '该用户已是管理员' }
    await db.collection('admins').add({
      data: { openid, name: name || '', addedBy: SUPER_ADMIN, createdAt: db.serverDate() }
    })
    return { success: true, message: '添加成功' }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

async function removeAdmin({ openid }) {
  try {
    if (openid === SUPER_ADMIN) return { success: false, errMsg: '不能移除超级管理员' }
    const exist = await db.collection('admins').where({ openid }).get()
    if (exist.data.length === 0) return { success: false, errMsg: '该用户不是管理员' }
    await db.collection('admins').doc(exist.data[0]._id).remove()
    return { success: true, message: '已移除' }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}

async function getAdmins() {
  try {
    const res = await db.collection('admins').orderBy('createdAt', 'asc').get()
    const data = res.data.map(a => ({ openid: a.openid, name: a.name || '', createdAt: a.createdAt }))
    return { success: true, data }
  } catch (e) {
    return { success: false, errMsg: e.message }
  }
}
